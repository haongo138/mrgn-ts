import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { BigNumber } from "bignumber.js"

import { loadKeypairFromFile } from "./utils";

import { Marginfi } from "@mrgnlabs/marginfi-client-v2/src/idl/marginfi-types_0.1.2";
import marginfiIdl from "@mrgnlabs/marginfi-client-v2/src/idl/marginfi.json";
import { wrappedI80F48toBigNumber } from "@mrgnlabs/mrgn-common";

const verbose = true;

type Config = {
  PROGRAM_ID: string;
  GROUP_ID: string;
};

const config: Config = {
  PROGRAM_ID: "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA",
  GROUP_ID: "4qp6Fx6tnZkY5Wropq9wUYgtFxXKwE6viZxFHg3rdAG8",
};

async function main() {
  marginfiIdl.address = config.PROGRAM_ID;
  const connection = new Connection("https://indulgent-fragrant-glade.solana-mainnet.quiknode.pro/157f9e3748df48360b36adb909d69ea42f353a1c/", "confirmed");
  const wallet = loadKeypairFromFile(process.env.HOME + "/.config/solana/id.json");

  // @ts-ignore
  const provider = new AnchorProvider(connection, wallet, {
    preflightCommitment: "confirmed",
  });

  const program = new Program<Marginfi>(marginfiIdl as Marginfi, provider);

  // Fetch all banks for the group
  const banksData = await program.account.bank.all([
    {
      memcmp: {
        bytes: new PublicKey(config.GROUP_ID).toBase58(),
        offset: 8 + 32 + 1, // Adjust offset based on account structure
      },
    },
  ]);
  // console.log("group banks: " + JSON.stringify(banksData[8]));
  console.log("group banks: " + JSON.stringify(banksData
    .filter((b) => b.account.emissionsMint.toBase58() !== "11111111111111111111111111111111")
    .map((bank, index) => ({
      index,
      bankMint: bank.account.mint.toBase58(),
      mintDecimals: bank.account.mintDecimals,
      oracleKey: bank.account.config.oracleKeys[0],
      emissionMint: bank.account.emissionsMint,
      emissionsRate: bank.account.emissionsRate.toString(),
      emissionsRemaining: wrappedI80F48toBigNumber(bank.account.emissionsRemaining).toString(),
      flag: bank.account.flags.toString(),
    }))));
}

main().catch((err) => {
  console.error(err);
});
