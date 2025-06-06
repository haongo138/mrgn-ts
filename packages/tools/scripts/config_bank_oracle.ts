// Runs once per group, before any staked banks can be init.
import dotenv from "dotenv";
import { AccountMeta, Connection, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { Marginfi } from "@mrgnlabs/marginfi-client-v2/src/idl/marginfi";
import marginfiIdl from "../../marginfi-client-v2/src/idl/marginfi.json";
import { loadKeypairFromFile } from "./utils";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

dotenv.config();

/**
 * If true, send the tx. If false, output the unsigned b58 tx to console.
 */
const sendTx = true;
const verbose = true;

type Config = {
  PROGRAM_ID: string;
  GROUP_KEY: PublicKey;
  BANK: PublicKey;
  ORACLE: PublicKey;
  ORACLE_FEED: PublicKey;
  ADMIN: PublicKey;

  // Keep default values to use the defaults...
  MULTISIG_PAYER?: PublicKey; // May be omitted if not using squads
};

const config: Config = {
  PROGRAM_ID: "FAUCDbgsBkGZQtPSLdrDiU6F8nFcxq9qmQwBiBba7gdh",
  GROUP_KEY: new PublicKey("GY5MTE56S4fcTsh6u7y1Y3vDAEc8DLCq4RPhkGokSfGx"),
  BANK: new PublicKey("FJbxwPpjEn8ehNw4FG1CM1TfduqPYfpzgQg829yCGeHf"),
  ORACLE: new PublicKey("Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD"),
  ORACLE_FEED: new PublicKey("Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX"),
  ADMIN: new PublicKey("4ai4tdtEsanxqhuVg1BXCsHYyQPgG3rPsE99sCGoaks8"),

  MULTISIG_PAYER: new PublicKey("4ai4tdtEsanxqhuVg1BXCsHYyQPgG3rPsE99sCGoaks8"),
};

const oracleMeta: AccountMeta = {
  pubkey: config.ORACLE_FEED,
  isSigner: false,
  isWritable: false,
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

  const transaction = new Transaction();

  transaction.add(
    await program.methods
      .lendingPoolConfigureBankOracle(3, config.ORACLE)
      .accountsPartial({
        // group: config.GROUP_KEY,
        admin: config.ADMIN,
        bank: config.BANK,
      })
      .remainingAccounts([oracleMeta])
      .instruction()
  );

  if (sendTx) {
    try {
      const signature = await sendAndConfirmTransaction(connection, transaction, [wallet]);
      console.log("Transaction signature:", signature);
    } catch (error) {
      console.error("Transaction failed:", error);
    }
  } else {
    transaction.feePayer = config.MULTISIG_PAYER; // Set the fee payer to Squads wallet
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    const base58Transaction = bs58.encode(serializedTransaction);
    console.log("Base58-encoded transaction:", base58Transaction);
  }
}

main().catch((err) => {
  console.error(err);
});
