import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();

  const tokenA = "0x9C24e6e8Cc886477D4b46e704D145CDE50101045";
  const tokenB = "0xf5a83c00DD844FAd90Ad769f758D61A674CF10B2";

  const pool = await ethers.deployContract("LiquidityPool", [tokenA, tokenB]);
  await pool.waitForDeployment();

  console.log("LiquidityPool deployed to:", await pool.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
