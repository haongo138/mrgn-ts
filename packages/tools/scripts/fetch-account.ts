import dotenv from "dotenv";
import { Connection, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { Program, AnchorProvider } from "@coral-xyz/anchor";

import { loadKeypairFromFile } from "./utils";
import { assertI80F48Approx, assertKeysEqual } from "./softTests";

import { wrappedI80F48toBigNumber } from "@mrgnlabs/mrgn-common";
import { Marginfi } from "@mrgnlabs/marginfi-client-v2/src/idl/marginfi";
import marginfiIdl from "../../marginfi-client-v2/src/idl/marginfi.json";

dotenv.config();

const verbose = true;

type Config = {
  PROGRAM_ID: string;
  ACCOUNT: PublicKey;
};

const config: Config = {
  PROGRAM_ID: "FAUCDbgsBkGZQtPSLdrDiU6F8nFcxq9qmQwBiBba7gdh",
  ACCOUNT: new PublicKey("BYqHeLGpRL6bhB5enWHcRsxcWCzMjjU2Jc3VTvNaHpYJ"),
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
  let acc = await program.account.marginfiAccount.fetch(config.ACCOUNT);
  let balances = acc.lendingAccount.balances;
  let activeBalances = [];
  for (let i = 0; i < balances.length; i++) {
    if (balances[i].active === 0) continue; // Skip inactive balances

    activeBalances.push({
      "Bank PK": balances[i].bankPk.toString(),
      "Asset Tag": balances[i].bankAssetTag,
      "Liability Shares": formatNumber(wrappedI80F48toBigNumber(balances[i].liabilityShares)),
      "Asset Shares": formatNumber(wrappedI80F48toBigNumber(balances[i].assetShares)),
      "Emissions Outstanding": formatNumber(wrappedI80F48toBigNumber(balances[i].emissionsOutstanding)),
      "Last Update": balances[i].lastUpdate.toString(),
      "Active": balances[i].active,
    });
  }

  function formatNumber(num) {
    const number = parseFloat(num).toFixed(4);
    return number === "0.0000" ? "-" : number;
  }

  // Display the active balances as a formatted table
  console.table(activeBalances);
}

main().catch((err) => {
  console.error(err);
});
