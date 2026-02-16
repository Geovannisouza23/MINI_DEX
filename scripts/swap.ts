import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();

  const user = "0xA3F04DdC07122a1D3E72bc2585685E12fB8DeE69";

  const tokenA = await ethers.getContractAt(
    "TokenA",
    "0x9C24e6e8Cc886477D4b46e704D145CDE50101045"
  );

  const pool = await ethers.getContractAt(
    "LiquidityPool",
    "0xd6b090f3Af232077d9E97E63D8f1780B1c40498A"
  );

  const amount = ethers.parseEther("2");

  console.log("🔍 Checking balances...");
  const balA = await tokenA.balanceOf(user);
  console.log("TokenA balance:", ethers.formatEther(balA));

  console.log("🪪 Approving pool...");
  const approveTx = await tokenA.approve(await pool.getAddress(), amount);
  await approveTx.wait();
  console.log("✅ Approved!");

  console.log("🔄 Executing swap A → B...");
  const swapTx = await pool.swapAforB(amount);
  const receipt = await swapTx.wait();

  console.log("🎉 Swap executed!");
  console.log("Tx hash:", receipt?.hash);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
