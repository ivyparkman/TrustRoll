# TrustRoll Encrypted Lottery

TrustRoll is a fully homomorphic lottery built on the FHEVM protocol. Players exchange ETH for encrypted points,
buy an encrypted two-number ticket, and reveal winnings only when they choose to decrypt their balance. The game
is designed so that picks, balances, and outcomes are never visible on-chain in plaintext.

## Project Goals

- Deliver a privacy-first lottery where player inputs and balances remain encrypted end-to-end.
- Provide a complete reference flow for FHEVM points, encrypted numbers, and encrypted rewards.
- Demonstrate a practical, user-facing FHE application with a modern React frontend.

## The Problem It Solves

Traditional on-chain lotteries expose user picks and balances. This enables front-running, privacy leaks, and
strategic copying of other players. TrustRoll eliminates these issues by keeping all sensitive values encrypted
while still proving correctness on-chain.

## Why TrustRoll Is Different

- Encrypted points and numbers: all sensitive data stays confidential on-chain.
- Fair payouts without disclosure: rewards are computed on encrypted data.
- User-controlled decryption: only the player can reveal their balance.
- Clear, repeatable game loop: easy to audit, test, and extend.
- Frontend-read with viem and write with ethers to align with FHEVM tooling best practices.

## Game Rules (Deterministic Constants)

- 1 ETH mints 10,000 encrypted points.
- A ticket costs 10 encrypted points.
- Each ticket contains 2 numbers in the range 1-9.
- The system draws 2 encrypted random numbers.
- Match 1 number: reward 100 encrypted points.
- Match 2 numbers: reward 1,000 encrypted points.
- The UI shows encrypted points by default, with an explicit decrypt action for the player.

## Tech Stack

- Smart contracts: Hardhat + Solidity
- FHE: Zama FHEVM
- Frontend: React + Vite
- Web3: viem (read) + ethers (write)
- Wallet UX: Rainbow
- Package manager: npm

## Architecture Overview

1. Player converts ETH into encrypted points on-chain.
2. Player buys a ticket by submitting two encrypted numbers (1-9).
3. The system generates two encrypted random numbers.
4. The contract computes matches and rewards in encrypted form.
5. The player can decrypt their balance in the UI.

All sensitive values are encrypted in the contract and never exposed in plaintext.

## Repository Structure

```
trustroll/
├── contracts/           # Smart contract source files
├── deploy/              # Deployment scripts
├── tasks/               # Hardhat custom tasks
├── test/                # Test files
├── ui/                  # React + Vite frontend
├── hardhat.config.ts    # Hardhat configuration
└── deployments/         # Network artifacts and ABI
```

## Quick Start

### Prerequisites

- Node.js 20+
- npm

### Install Dependencies

```bash
npm install
```

### Environment Setup (Deployment Only)

Create a `.env` file at the repository root for Hardhat deployment:

```
PRIVATE_KEY=<hex private key without 0x>
INFURA_API_KEY=<infura_project_id>
ETHERSCAN_API_KEY=<etherscan_key>
```

No frontend environment variables are required or used.

### Compile and Test

```bash
npm run compile
npm run test
```

### Local Development (Contracts)

```bash
npx hardhat node
npx hardhat deploy --network localhost
```

### Deploy to Sepolia

```bash
npx hardhat deploy --network sepolia
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

### Frontend

The frontend lives in `ui/` and targets Sepolia, not a localhost chain. It reads with viem and writes with ethers,
and it uses the ABI generated from `deployments/sepolia`.

```bash
cd ui
npm install
npm run dev
```

## How To Play

1. Connect a wallet on Sepolia.
2. Exchange ETH for encrypted points.
3. Pick two numbers (1-9) and buy a ticket with 10 points.
4. Start the draw to generate encrypted random numbers.
5. See your encrypted balance update.
6. Decrypt your balance when you want to reveal winnings.

## Security and Privacy Notes

- On-chain values are encrypted; plaintext inputs are never stored.
- Rewards are computed directly over ciphertexts.
- Decryption happens client-side and only at the user's request.
- The contract avoids using `msg.sender` in view methods to keep access explicit.

## Testing and Validation

- Unit tests cover encrypted points, ticket purchase, and draw outcomes.
- Tasks and deploy scripts verify setup against the FHEVM runtime.
- Run `npm run test` before deployment to ensure encrypted flows pass.

## Advantages Summary

- Privacy by default for balances and picks.
- Fairness without public disclosure.
- Clear, reproducible flow for FHEVM-based games.
- Clean separation between on-chain encryption logic and UI decryption.
- Minimal external dependencies and a transparent project layout.

## Future Roadmap

- Multi-round pools with configurable odds and prizes.
- Expanded ticket formats (more numbers or ranges).
- UI improvements for decryption history and payout tracking.
- Additional test coverage for edge cases and failure paths.
- Gas usage analysis and contract optimizations.
- Optional support for new FHEVM networks as they launch.

## License

This project is licensed under the BSD-3-Clause-Clear License. See `LICENSE` for details.

## References

- FHEVM Documentation: https://docs.zama.ai/fhevm
- FHEVM Hardhat Plugin: https://docs.zama.ai/protocol/solidity-guides/development-guide/hardhat
