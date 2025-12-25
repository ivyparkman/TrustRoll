// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint8, euint32, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title TrustRoll lottery with encrypted balances and picks
/// @notice Players buy encrypted points with ETH, pick encrypted numbers, and receive encrypted rewards.
contract TrustRoll is ZamaEthereumConfig {
    uint32 public constant POINTS_PER_ETH = 10000;
    uint32 public constant TICKET_COST = 10;
    uint32 public constant ONE_MATCH_REWARD = 100;
    uint32 public constant TWO_MATCH_REWARD = 1000;

    struct Ticket {
        euint8 firstNumber;
        euint8 secondNumber;
        bool exists;
    }

    struct DrawResult {
        euint8 firstWinning;
        euint8 secondWinning;
        euint32 reward;
    }

    mapping(address => euint32) private balances;
    mapping(address => Ticket) private tickets;
    mapping(address => DrawResult) private lastResults;

    event PointsPurchased(address indexed player, uint256 ethAmount, uint32 pointsMinted);
    event TicketPurchased(address indexed player);
    event RoundPlayed(address indexed player);

    /// @notice Convert ETH into encrypted points at a fixed rate.
    /// @dev Grants the caller permission to decrypt the updated balance.
    function purchasePoints() external payable returns (euint32) {
        require(msg.value > 0, "No ETH sent");

        uint256 pointsValue = (msg.value * POINTS_PER_ETH) / 1 ether;
        require(pointsValue > 0, "Insufficient ETH for points");

        euint32 addedPoints = FHE.asEuint32(uint32(pointsValue));
        euint32 updatedBalance = FHE.add(balances[msg.sender], addedPoints);

        balances[msg.sender] = updatedBalance;

        FHE.allowThis(updatedBalance);
        FHE.allow(updatedBalance, msg.sender);

        emit PointsPurchased(msg.sender, msg.value, uint32(pointsValue));
        return updatedBalance;
    }

    /// @notice Spend encrypted points to buy a ticket with two encrypted numbers.
    /// @param firstNumber The first encrypted pick (1-9).
    /// @param secondNumber The second encrypted pick (1-9).
    /// @param inputProof Zama input proof for the encrypted numbers.
    function purchaseTicket(
        externalEuint8 firstNumber,
        externalEuint8 secondNumber,
        bytes calldata inputProof
    ) external {
        Ticket storage ticket = tickets[msg.sender];

        euint32 cost = FHE.asEuint32(TICKET_COST);
        euint32 updatedBalance = FHE.sub(balances[msg.sender], cost);

        euint8 firstEncrypted = FHE.fromExternal(firstNumber, inputProof);
        euint8 secondEncrypted = FHE.fromExternal(secondNumber, inputProof);

        balances[msg.sender] = updatedBalance;
        ticket.firstNumber = firstEncrypted;
        ticket.secondNumber = secondEncrypted;
        ticket.exists = true;

        FHE.allowThis(updatedBalance);
        FHE.allow(updatedBalance, msg.sender);

        FHE.allowThis(firstEncrypted);
        FHE.allowThis(secondEncrypted);
        FHE.allow(firstEncrypted, msg.sender);
        FHE.allow(secondEncrypted, msg.sender);

        emit TicketPurchased(msg.sender);
    }

    /// @notice Start a draw, generate encrypted winning numbers, and apply encrypted rewards.
    /// @return winningFirst The first encrypted winning number.
    /// @return winningSecond The second encrypted winning number.
    /// @return reward The encrypted reward for this round.
    function playRound() external returns (euint8 winningFirst, euint8 winningSecond, euint32 reward) {
        Ticket storage ticket = tickets[msg.sender];
        require(ticket.exists, "Ticket missing");

        euint8 baseOne = FHE.asEuint8(1);
        euint8 zero = FHE.asEuint8(0);
        euint8 randomFirst = FHE.randEuint8();
        euint8 randomSecond = FHE.randEuint8();
        winningFirst = FHE.add(FHE.rem(randomFirst, 9), baseOne);
        winningSecond = FHE.add(FHE.rem(randomSecond, 9), baseOne);

        euint8 firstHit = FHE.select(FHE.eq(ticket.firstNumber, winningFirst), baseOne, zero);
        euint8 secondHit = FHE.select(FHE.eq(ticket.secondNumber, winningSecond), baseOne, zero);
        euint8 totalHits = FHE.add(firstHit, secondHit);

        reward = FHE.asEuint32(0);
        reward = FHE.select(FHE.eq(totalHits, baseOne), FHE.asEuint32(ONE_MATCH_REWARD), reward);
        reward = FHE.select(FHE.eq(totalHits, FHE.asEuint8(2)), FHE.asEuint32(TWO_MATCH_REWARD), reward);

        euint32 updatedBalance = FHE.add(balances[msg.sender], reward);
        balances[msg.sender] = updatedBalance;
        ticket.exists = false;

        lastResults[msg.sender] = DrawResult({
            firstWinning: winningFirst,
            secondWinning: winningSecond,
            reward: reward
        });

        FHE.allowThis(updatedBalance);
        FHE.allow(updatedBalance, msg.sender);

        FHE.allowThis(winningFirst);
        FHE.allowThis(winningSecond);
        FHE.allowThis(reward);
        FHE.allow(winningFirst, msg.sender);
        FHE.allow(winningSecond, msg.sender);
        FHE.allow(reward, msg.sender);

        emit RoundPlayed(msg.sender);
    }

    /// @notice Get the encrypted balance for any player.
    /// @param player Address to query.
    function getEncryptedBalance(address player) external view returns (euint32) {
        return balances[player];
    }

    /// @notice Get the encrypted ticket numbers and status for a player.
    /// @param player Address to query.
    /// @return firstNumber The encrypted first pick.
    /// @return secondNumber The encrypted second pick.
    /// @return exists Whether a ticket is active.
    function getTicket(address player) external view returns (euint8 firstNumber, euint8 secondNumber, bool exists) {
        Ticket storage ticket = tickets[player];
        return (ticket.firstNumber, ticket.secondNumber, ticket.exists);
    }

    /// @notice Get the encrypted result of the last draw for a player.
    /// @param player Address to query.
    /// @return firstWinning The encrypted first winning number.
    /// @return secondWinning The encrypted second winning number.
    /// @return reward The encrypted reward applied.
    function getLastDraw(address player)
        external
        view
        returns (euint8 firstWinning, euint8 secondWinning, euint32 reward)
    {
        DrawResult storage result = lastResults[player];
        return (result.firstWinning, result.secondWinning, result.reward);
    }
}
