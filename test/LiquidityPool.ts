import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("LiquidityPool", function () {
  it("Swaps TokenA for TokenB and updates reserves", async function () {
    const [owner, trader] = await ethers.getSigners();

    const initialSupply = ethers.parseEther("1000000");
    const tokenA = await ethers.deployContract("TokenA", [initialSupply]);
    await tokenA.waitForDeployment();
    const tokenB = await ethers.deployContract("TokenB", [initialSupply]);
    await tokenB.waitForDeployment();

    const pool = (await ethers.deployContract("LiquidityPool", [
      await tokenA.getAddress(),
      await tokenB.getAddress(),
    ])) as any;
    await pool.waitForDeployment();

    const liquidityA = ethers.parseEther("1000");
    const liquidityB = ethers.parseEther("2000");

    await tokenA.approve(await pool.getAddress(), liquidityA);
    await tokenB.approve(await pool.getAddress(), liquidityB);
    await pool.addLiquidity(liquidityA, liquidityB);

    const traderAmountA = ethers.parseEther("100");
    await tokenA.transfer(trader.address, traderAmountA);
    await tokenA.connect(trader).approve(await pool.getAddress(), traderAmountA);

    const expectedAmountB = (traderAmountA * liquidityB) / liquidityA;

    const swapTx = await pool.connect(trader).swapAforB(traderAmountA);
    const receipt = await swapTx.wait();

    const events = await pool.queryFilter(
      pool.filters.Swap(),
      receipt?.blockNumber,
      receipt?.blockNumber,
    );
    expect(events.length).to.equal(1);
    const event = events[0] as any;
    const args = event.args as {
      user: string;
      tokenIn: string;
      amountIn: bigint;
      amountOut: bigint;
    };
    expect(args.user).to.equal(trader.address);
    expect(args.tokenIn).to.equal(await tokenA.getAddress());
    expect(args.amountIn).to.equal(traderAmountA);
    expect(args.amountOut).to.equal(expectedAmountB);

    const [reserveA, reserveB] = await pool.getReserves();
    expect(reserveA).to.equal(liquidityA + traderAmountA);
    expect(reserveB).to.equal(liquidityB - expectedAmountB);
  });
});
