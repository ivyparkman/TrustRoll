import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

const CONTRACT_NAME = "TrustRoll";

async function resolveContract(hre: any, address?: string) {
  const { ethers, deployments } = hre;
  const deployment = address ? { address } : await deployments.get(CONTRACT_NAME);
  const contract = await ethers.getContractAt(CONTRACT_NAME, deployment.address);
  return { contract, address: deployment.address };
}

task("task:address", `Prints the ${CONTRACT_NAME} address`).setAction(async function (_taskArguments: TaskArguments, hre) {
  const { deployments } = hre;
  const deployment = await deployments.get(CONTRACT_NAME);
  console.log(`${CONTRACT_NAME} address is ${deployment.address}`);
});

task("task:purchase-points", "Swap ETH for encrypted points")
  .addParam("eth", "ETH amount to spend (e.g. 0.1)")
  .addOptionalParam("address", "Contract address override")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers } = hre;
    const ethAmount = taskArguments.eth as string;
    const value = ethers.parseEther(ethAmount);

    const { contract, address } = await resolveContract(hre, taskArguments.address as string | undefined);
    const signer = (await ethers.getSigners())[0];

    const tx = await contract.connect(signer).purchasePoints({ value });
    console.log(`Wait for tx ${tx.hash} on ${address}...`);
    const receipt = await tx.wait();
    console.log(`Status: ${receipt?.status}`);
  });

task("task:balance", "Decrypt an account's encrypted balance")
  .addOptionalParam("user", "User address to inspect")
  .addOptionalParam("address", "Contract address override")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();
    const signer = (await ethers.getSigners())[0];
    const target = (taskArguments.user as string | undefined) ?? signer.address;

    const { contract, address } = await resolveContract(hre, taskArguments.address as string | undefined);
    const encryptedBalance = await contract.getEncryptedBalance(target);
    const clearBalance = await fhevm.userDecryptEuint(FhevmType.euint32, encryptedBalance, address, signer);

    console.log(`Encrypted balance: ${encryptedBalance}`);
    console.log(`Clear balance    : ${clearBalance}`);
  });

task("task:buy-ticket", "Buy an encrypted ticket with two numbers (1-9)")
  .addParam("first", "First number 1-9")
  .addParam("second", "Second number 1-9")
  .addOptionalParam("address", "Contract address override")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const first = parseInt(taskArguments.first);
    const second = parseInt(taskArguments.second);
    if (![first, second].every((n) => Number.isInteger(n) && n >= 1 && n <= 9)) {
      throw new Error("Numbers must be between 1 and 9");
    }

    const { contract, address } = await resolveContract(hre, taskArguments.address as string | undefined);
    const signer = (await ethers.getSigners())[0];

    const encryptedInput = await fhevm.createEncryptedInput(address, signer.address).add8(first).add8(second).encrypt();

    const tx = await contract
      .connect(signer)
      .purchaseTicket(encryptedInput.handles[0], encryptedInput.handles[1], encryptedInput.inputProof);

    console.log(`Wait for tx ${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`Status: ${receipt?.status}`);
  });

task("task:play-round", "Start a draw and decrypt the outcome")
  .addOptionalParam("address", "Contract address override")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();
    const signer = (await ethers.getSigners())[0];

    const { contract, address } = await resolveContract(hre, taskArguments.address as string | undefined);

    const tx = await contract.connect(signer).playRound();
    console.log(`Wait for tx ${tx.hash}...`);
    await tx.wait();

    const [winningFirst, winningSecond, reward] = await contract.getLastDraw(signer.address);

    const clearFirst = await fhevm.userDecryptEuint(FhevmType.euint8, winningFirst, address, signer);
    const clearSecond = await fhevm.userDecryptEuint(FhevmType.euint8, winningSecond, address, signer);
    const clearReward = await fhevm.userDecryptEuint(FhevmType.euint32, reward, address, signer);

    const encryptedBalance = await contract.getEncryptedBalance(signer.address);
    const clearBalance = await fhevm.userDecryptEuint(FhevmType.euint32, encryptedBalance, address, signer);

    console.log(`Winning numbers : ${clearFirst.toString()} ${clearSecond.toString()}`);
    console.log(`Reward applied  : ${clearReward.toString()} points`);
    console.log(`New balance     : ${clearBalance.toString()} points`);
  });
