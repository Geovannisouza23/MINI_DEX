import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();

  const tokenA = await ethers.deployContract("TokenA", [
    ethers.parseEther("1000000"),
  ]);
  await tokenA.waitForDeployment();

  const tokenB = await ethers.deployContract("TokenB", [
    ethers.parseEther("1000000"),
  ]);
  await tokenB.waitForDeployment();

  console.log("TokenA (ROB) deployed to:", await tokenA.getAddress());
  console.log("TokenB (RUB) deployed to:", await tokenB.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
