// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract LiquidityPool {
    IERC20 public tokenA;
    IERC20 public tokenB;

    uint256 public reserveA;
    uint256 public reserveB;

    event LiquidityAdded(address indexed provider, uint256 amountA, uint256 amountB);
    event Swap(address indexed user, address tokenIn, uint256 amountIn, uint256 amountOut);

    constructor(address _tokenA, address _tokenB) {
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
    }

    function addLiquidity(uint256 amountA, uint256 amountB) external {
        require(amountA > 0 && amountB > 0, "Invalid amounts");

        tokenA.transferFrom(msg.sender, address(this), amountA);
        tokenB.transferFrom(msg.sender, address(this), amountB);

        reserveA += amountA;
        reserveB += amountB;

        emit LiquidityAdded(msg.sender, amountA, amountB);
    }

    function getPriceAtoB(uint256 amountA) public view returns (uint256) {
        require(reserveA > 0 && reserveB > 0, "No liquidity");
        return (amountA * reserveB) / reserveA;
    }

    function swapAforB(uint256 amountA) external {
        require(amountA > 0, "Invalid amount");

        uint256 amountB = getPriceAtoB(amountA);
        require(reserveB >= amountB, "Insufficient liquidity");

        tokenA.transferFrom(msg.sender, address(this), amountA);
        tokenB.transfer(msg.sender, amountB);

        reserveA += amountA;
        reserveB -= amountB;

        emit Swap(msg.sender, address(tokenA), amountA, amountB);
    }

    function swapBforA(uint256 amountB) external {
        require(amountB > 0, "Invalid amount");

        uint256 amountA = (amountB * reserveA) / reserveB;
        require(reserveA >= amountA, "Insufficient liquidity");

        tokenB.transferFrom(msg.sender, address(this), amountB);
        tokenA.transfer(msg.sender, amountA);

        reserveB += amountB;
        reserveA -= amountA;

        emit Swap(msg.sender, address(tokenB), amountB, amountA);
    }

    function getReserves() external view returns (uint256, uint256) {
        return (reserveA, reserveB);
    }
}
