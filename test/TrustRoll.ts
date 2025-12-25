import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { TrustRoll, TrustRoll__factory } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("TrustRoll")) as TrustRoll__factory;
  const trustRoll = (await factory.deploy()) as TrustRoll;
  const trustRollAddress = await trustRoll.getAddress();
  return { trustRoll, trustRollAddress };
}

async function decryptBalance(contract: TrustRoll, contractAddress: string, signer: HardhatEthersSigner) {
  const encryptedBalance = await contract.getEncryptedBalance(signer.address);
  const decrypted = await fhevm.userDecryptEuint(FhevmType.euint32, encryptedBalance, contractAddress, signer);
  return Number(decrypted);
}

describe("TrustRoll", function () {
  let signers: Signers;
  let trustRoll: TrustRoll;
  let trustRollAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("This test suite is intended for the FHEVM mock environment");
      this.skip();
    }

    ({ trustRoll, trustRollAddress } = await deployFixture());
  });

  it("mints encrypted points when purchasing with ETH", async function () {
    const depositValue = ethers.parseEther("1");
    const expectedPoints = Number((depositValue * 10000n) / ethers.WeiPerEther);

    await trustRoll.connect(signers.alice).purchasePoints({ value: depositValue });

    const clearBalance = await decryptBalance(trustRoll, trustRollAddress, signers.alice);
    expect(clearBalance).to.eq(expectedPoints);
  });

  it("stores encrypted ticket numbers and deducts cost", async function () {
    const depositValue = ethers.parseEther("0.002");
    const expectedPoints = Number((depositValue * 10000n) / ethers.WeiPerEther);

    await trustRoll.connect(signers.alice).purchasePoints({ value: depositValue });

    const encryptedInput = await fhevm
      .createEncryptedInput(trustRollAddress, signers.alice.address)
      .add8(3)
      .add8(7)
      .encrypt();

    await trustRoll
      .connect(signers.alice)
      .purchaseTicket(encryptedInput.handles[0], encryptedInput.handles[1], encryptedInput.inputProof);

    const clearBalance = await decryptBalance(trustRoll, trustRollAddress, signers.alice);
    expect(clearBalance).to.eq(expectedPoints - 10);

    const [firstNumber, secondNumber] = await trustRoll.getTicket(signers.alice.address);
    const clearFirst = await fhevm.userDecryptEuint(FhevmType.euint8, firstNumber, trustRollAddress, signers.alice);
    const clearSecond = await fhevm.userDecryptEuint(FhevmType.euint8, secondNumber, trustRollAddress, signers.alice);

    expect(clearFirst).to.eq(3);
    expect(clearSecond).to.eq(7);
  });

  it("plays a round and applies an encrypted reward", async function () {
    const depositValue = ethers.parseEther("1");
    const expectedPoints = Number((depositValue * 10000n) / ethers.WeiPerEther);

    await trustRoll.connect(signers.alice).purchasePoints({ value: depositValue });

    const encryptedInput = await fhevm
      .createEncryptedInput(trustRollAddress, signers.alice.address)
      .add8(1)
      .add8(2)
      .encrypt();

    await trustRoll
      .connect(signers.alice)
      .purchaseTicket(encryptedInput.handles[0], encryptedInput.handles[1], encryptedInput.inputProof);

    await trustRoll.connect(signers.alice).playRound();

    const [, , rewardCipher] = await trustRoll.getLastDraw(signers.alice.address);
    const reward = Number(
      await fhevm.userDecryptEuint(FhevmType.euint32, rewardCipher, trustRollAddress, signers.alice),
    );
    expect([0, 100, 1000]).to.include(reward);

    const clearBalance = await decryptBalance(trustRoll, trustRollAddress, signers.alice);
    expect(clearBalance).to.eq(expectedPoints - 10 + reward);
  });
});
