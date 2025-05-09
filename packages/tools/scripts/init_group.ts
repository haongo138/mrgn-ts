import dotenv from "dotenv";
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
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
  ADMIN_KEY: PublicKey;
};

const config: Config = {
  PROGRAM_ID: "4ktkTCjsHh1VdqwqkXBjGqZKnBkycWZMe3AEXEcdSbwV",
  ADMIN_KEY: new PublicKey("4ai4tdtEsanxqhuVg1BXCsHYyQPgG3rPsE99sCGoaks8"),
};

const deriveGlobalFeeState = (programId: PublicKey) => {
  return PublicKey.findProgramAddressSync([Buffer.from("feestate", "utf-8")], programId);
};

async function main() {
  marginfiIdl.address = config.PROGRAM_ID;
  const marginfiGroup = Keypair.generate();
  const connection = new Connection(process.env.PRIVATE_RPC_ENDPOINT, "confirmed");
  const wallet = loadKeypairFromFile(process.env.MARGINFI_WALLET);
  console.log("wallet: " + wallet.publicKey);

  // @ts-ignore
  const provider = new AnchorProvider(connection, wallet, {
    preflightCommitment: "confirmed",
  });

  const program = new Program<Marginfi>(
    // @ts-ignore
    marginfiIdl as Marginfi,
    provider
  );
  const transaction = new Transaction();
  transaction.add(
    await program.methods
      .marginfiGroupInitialize()
      .accountsPartial({
        marginfiGroup: marginfiGroup.publicKey,
        feeState: deriveGlobalFeeState(new PublicKey(config.PROGRAM_ID))[0],
        admin: config.ADMIN_KEY,
        // systemProgram: SystemProgram.programId,
      })
      .instruction()
  );

  if (sendTx) {
    try {
      const signature = await sendAndConfirmTransaction(connection, transaction, [wallet, marginfiGroup]);
      console.log("Transaction signature:", signature);
    } catch (error) {
      console.error("Transaction failed:", error);
    }
  } else {
    transaction.feePayer = config.ADMIN_KEY; // Set the fee payer to Squads wallet
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.partialSign(marginfiGroup);
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    const base58Transaction = bs58.encode(serializedTransaction);
    console.log("Base58-encoded transaction:", base58Transaction);
  }

  console.log("Group init: " + marginfiGroup.publicKey);
}

main().catch((err) => {
  console.error(err);
});
