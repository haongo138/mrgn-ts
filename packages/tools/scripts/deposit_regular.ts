import dotenv from "dotenv";
// Run deposit_single_pool first to convert to LST. In production, these will likely be atomic.
import { Connection, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { Marginfi } from "@mrgnlabs/marginfi-client-v2/src/idl/marginfi";
import marginfiIdl from "../../marginfi-client-v2/src/idl/marginfi.json";
import { DEFAULT_API_URL, loadEnvFile, loadKeypairFromFile, loadKeypairFromPrivateKey } from "./utils";
import {
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { createAssociatedTokenAccountIdempotentInstruction, createSyncNativeInstruction, getAssociatedTokenAddressSync } from "@mrgnlabs/mrgn-common";

dotenv.config();

type Config = {
  PROGRAM_ID: string;
  GROUP: PublicKey;
  ACCOUNT: PublicKey;
  BANK: PublicKey;
  MINT: PublicKey;
  /** In native decimals */
  AMOUNT: BN;
};

const config: Config = {
  PROGRAM_ID: "FAUCDbgsBkGZQtPSLdrDiU6F8nFcxq9qmQwBiBba7gdh",
  GROUP: new PublicKey("GY5MTE56S4fcTsh6u7y1Y3vDAEc8DLCq4RPhkGokSfGx"),

  // user's marginfi account
  // ACCOUNT: new PublicKey("9kZdKJQqKSpbhJzip95KMkafbt5N6YbcJJAWhfewrktE"),

  // deployer's marginfi account
  ACCOUNT: new PublicKey("dxb4zzmSqGUgVaX3NGvhXGS2iawcb6eTSeka2z4eqAf"),
  BANK: new PublicKey("5JBpz6PwjhPVSSMGiW9Ju2zRd2QfhLQafksBj3QmgQCy"),
  MINT: new PublicKey("3KETcC3MvTdni4tZSHVGLytLEP5YRkD9QHSMYKgdC6SU"),
  AMOUNT: new BN(100 * 10 ** 8),
};

async function main() {
  marginfiIdl.address = config.PROGRAM_ID;
  const connection = new Connection(process.env.PRIVATE_RPC_ENDPOINT, "confirmed");
  const wallet = loadKeypairFromFile(process.env.MARGINFI_WALLET);
  // const wallet = loadKeypairFromPrivateKey("CtmTX2THJhvhpWCx8TUoBfb5p94wVkPpfMDgR2JZZFYWKrxZ8uAaKwDuqxrtFXtGYMnBhRSYbhWLvGNedUeFWkv");
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

  const ata = getAssociatedTokenAddressSync(config.MINT, wallet.publicKey);

  const transaction = new Transaction();
  if (config.MINT.toString() == "So11111111111111111111111111111111111111112") {
    transaction.add(
      createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, ata, wallet.publicKey, config.MINT)
    );
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: ata,
        lamports: config.AMOUNT.toNumber(),
      })
    );
    transaction.add(createSyncNativeInstruction(ata));
  }
  transaction.add(
    await program.methods
      .lendingAccountDeposit(config.AMOUNT, false)
      .accounts({
        // marginfiGroup: config.GROUP,
        marginfiAccount: config.ACCOUNT,
        // signer: wallet.publicKey,
        bank: config.BANK,
        signerTokenAccount: ata,
        // bankLiquidityVault = deriveLiquidityVault(id, bank)
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction()
  );

  try {
    const signature = await sendAndConfirmTransaction(connection, transaction, [wallet]);
    console.log("Transaction signature:", signature);
  } catch (error) {
    console.error("Transaction failed:", error);
  }

  console.log("deposit: " + config.AMOUNT.toString() + " to " + config.BANK);
}

main().catch((err) => {
  console.error(err);
});
