import dotenv from "dotenv";
import { Connection, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { Program, AnchorProvider } from "@coral-xyz/anchor";

import { loadKeypairFromFile } from "./utils";
import { assertI80F48Approx, assertKeysEqual } from "./softTests";

import { wrappedI80F48toBigNumber } from "@mrgnlabs/mrgn-common";
import { Marginfi } from "@mrgnlabs/marginfi-client-v2/src/idl/marginfi-types_0.1.2";
import marginfiIdl from "../../marginfi-client-v2/src/idl/marginfi.json";

dotenv.config();

type Config = {
  PROGRAM_ID: string;
  BANK: PublicKey;
};

const config: Config = {
  PROGRAM_ID: "4ktkTCjsHh1VdqwqkXBjGqZKnBkycWZMe3AEXEcdSbwV",
  BANK: new PublicKey("AdtPZENKdzFHfPspvpMvYY1X9wVXABKX6ne8LnUwK69z"),
};

async function main() {
  marginfiIdl.address = config.PROGRAM_ID;
  const connection = new Connection(process.env.PRIVATE_RPC_ENDPOINT, "confirmed");
  const wallet = loadKeypairFromFile(process.env.MARGINFI_WALLET);

  // @ts-ignore
  const provider = new AnchorProvider(connection, wallet, {
    preflightCommitment: "confirmed",
  });

  const program = new Program<Marginfi>(marginfiIdl as Marginfi, provider);
  let bank = await program.account.bank.fetch(config.BANK);

  console.log("group: " + bank.group);
  console.log("bank: " + JSON.stringify({
    totalAssetShares: wrappedI80F48toBigNumber(bank.totalAssetShares).toString(),
    totalLiabilities: wrappedI80F48toBigNumber(bank.totalLiabilityShares).toString(),
  }));
}

main().catch((err) => {
  console.error(err);
});
