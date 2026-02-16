import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatMocha from "@nomicfoundation/hardhat-mocha";
import { configVariable, defineConfig } from "hardhat/config";
import * as dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  plugins: [hardhatEthers, hardhatMocha],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
      },
    },
  },
  networks: {
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
  },
});
