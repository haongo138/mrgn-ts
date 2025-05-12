// Run deposit_single_pool first to convert to LST. In production, these will likely be atomic.
import dotenv from "dotenv";
import {
  AccountMeta,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { Marginfi } from "@mrgnlabs/marginfi-client-v2/src/idl/marginfi";
import marginfiIdl from "../../marginfi-client-v2/src/idl/marginfi.json";
import { DEFAULT_API_URL, loadEnvFile, loadKeypairFromFile, SINGLE_POOL_PROGRAM_ID } from "./utils";
import {
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from "@mrgnlabs/mrgn-common";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

dotenv.config();

type Config = {
  PROGRAM_ID: string;
  GROUP: PublicKey;
  ACCOUNT: PublicKey;
  BANK: PublicKey;
  STAKE_POOL?: PublicKey;
  MINT: PublicKey;
  /** In native decimals */
  AMOUNT: BN;
  /** For each balance the user has, in order, pass
   * * bank0, oracle0, bank1, oracle1, etc
   * 
   * if a bank is a STAKED COLLATERAL bank, also pass the LST mint and SOL pool, like:
   * * bank0, oracle0, lstMint0, solPool0, bank1, oracle1
   * 
   * You can derive these with:
    ```
    const [lstMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint"), config.STAKE_POOL.toBuffer()],
        SINGLE_POOL_PROGRAM_ID
    );
    ```
    and
    ```
    const [pool] = PublicKey.findProgramAddressSync(
        [Buffer.from("stake"), config.STAKE_POOL.toBuffer()],
        SINGLE_POOL_PROGRAM_ID
    );
    ```
   * or read them from the bank directly (oracles[1] and oracles[2])
   * */
  REMAINING: PublicKey[];
};

const examples = {
  borrowJupSOLAgainstUSDC: {
    PROGRAM_ID: "stag8sTKds2h4KzjUw3zKTsxbqvT4XKHdaR9X9E6Rct",
    GROUP: new PublicKey("FCPfpHA69EbS8f9KKSreTRkXbzFpunsKuYf5qNmnJjpo"),
    ACCOUNT: new PublicKey("2GMbwepeyW5xzgm3cQLivdPWLydrFevLy2iBbZab3pd6"),
    BANK: new PublicKey("EJuhmswifV6wumS28Sfr5W8B18CJ29m1ZNKkhbhbYDCA"),
    MINT: new PublicKey("jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v"),
    AMOUNT: new BN(0.0005 * 10 ** 9), // jupsol has 9 decimals
    REMAINING: [
      new PublicKey("Ek5JSFJFD8QgXM6rPDCzf31XhDp1q3xezaWYSkJWqbqc"), // usdc bank
      new PublicKey("Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX"), // usdc oracle
      new PublicKey("EJuhmswifV6wumS28Sfr5W8B18CJ29m1ZNKkhbhbYDCA"), // jupsol bank
      new PublicKey("HX5WM3qzogAfRCjBUWwnniLByMfFrjm1b5yo4KoWGR27"), // jupsol oracle
    ],
  },
  borrowSOLAgainstUSDC: {
    PROGRAM_ID: "stag8sTKds2h4KzjUw3zKTsxbqvT4XKHdaR9X9E6Rct",
    GROUP: new PublicKey("FCPfpHA69EbS8f9KKSreTRkXbzFpunsKuYf5qNmnJjpo"),
    ACCOUNT: new PublicKey("2GMbwepeyW5xzgm3cQLivdPWLydrFevLy2iBbZab3pd6"),
    BANK: new PublicKey("3evdJSa25nsUiZzEUzd92UNa13TPRJrje1dRyiQP5Lhp"),
    MINT: new PublicKey("So11111111111111111111111111111111111111112"),
    AMOUNT: new BN(0.0005 * 10 ** 9), // sol has 9 decimals
    REMAINING: [
      new PublicKey("Ek5JSFJFD8QgXM6rPDCzf31XhDp1q3xezaWYSkJWqbqc"), // usdc bank
      new PublicKey("Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX"), // usdc oracle
      // new PublicKey("EJuhmswifV6wumS28Sfr5W8B18CJ29m1ZNKkhbhbYDCA"), // jupsol bank
      // new PublicKey("HX5WM3qzogAfRCjBUWwnniLByMfFrjm1b5yo4KoWGR27"), // jupsol oracle
      new PublicKey("3evdJSa25nsUiZzEUzd92UNa13TPRJrje1dRyiQP5Lhp"), // sol bank
      new PublicKey("7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE"), // sol oracle
    ],
  },
  borrowSOLAgainstStakedSOL: {
    PROGRAM_ID: "stag8sTKds2h4KzjUw3zKTsxbqvT4XKHdaR9X9E6Rct",
    GROUP: new PublicKey("FCPfpHA69EbS8f9KKSreTRkXbzFpunsKuYf5qNmnJjpo"),
    ACCOUNT: new PublicKey("7SBEjeEjhzRvWsrTq7UiNWBLjcYwE1hdbmMK5wUaeVhU"),
    BANK: new PublicKey("3evdJSa25nsUiZzEUzd92UNa13TPRJrje1dRyiQP5Lhp"),
    STAKE_POOL: new PublicKey("AvS4oXtxWdrJGCJwDbcZ7DqpSqNQtKjyXnbkDbrSk6Fq"),
    MINT: new PublicKey("So11111111111111111111111111111111111111112"),
    AMOUNT: new BN(0.00002 * 10 ** 6), // usdc has 6 decimals
    REMAINING: [
      new PublicKey("3jt43usVm7qL1N5qPvbzYHWQRxamPCRhri4CxwDrf6aL"), // staked sol bank
      new PublicKey("7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE"), // staked sol oracle
      new PublicKey("BADo3D6nMtGnsAaTv3iEes8mMcq92TuFoBWebFe8kzeA"), // lst mint
      new PublicKey("3e8RuaQMCPASZSMJAskHX6ZfuTtQ3JvoNPFoEvaVRn78"), // lst pool
      new PublicKey("3evdJSa25nsUiZzEUzd92UNa13TPRJrje1dRyiQP5Lhp"), // usdc bank
      new PublicKey("7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE"), // usdc oracle
    ],
  },
  borrowTest: {
    PROGRAM_ID: "FAUCDbgsBkGZQtPSLdrDiU6F8nFcxq9qmQwBiBba7gdh",
    GROUP: new PublicKey("GY5MTE56S4fcTsh6u7y1Y3vDAEc8DLCq4RPhkGokSfGx"),
    ACCOUNT: new PublicKey("dxb4zzmSqGUgVaX3NGvhXGS2iawcb6eTSeka2z4eqAf"),
    BANK: new PublicKey("3qunF6taEaM473TDfLCS9R9xLECMPeZi78rVcnNpDr8d"),
    MINT: new PublicKey("6mSAxhGQTbAdqTdXDcHuZiNmnaAGicNFVaaAKU1YXBr5"),
    AMOUNT: new BN(1 * 10 ** 6),
    REMAINING: [
      new PublicKey("CzwEH4tg6eNUhswG9USeWheHiviKWRfN8jpV3RQPmXG2"), // usdc bank
      new PublicKey("Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX"), // usdc oracle
      // new PublicKey("EJuhmswifV6wumS28Sfr5W8B18CJ29m1ZNKkhbhbYDCA"),
      // new PublicKey("HX5WM3qzogAfRCjBUWwnniLByMfFrjm1b5yo4KoWGR27"),
      new PublicKey("3qunF6taEaM473TDfLCS9R9xLECMPeZi78rVcnNpDr8d"),
      new PublicKey("Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX"),
    ],
  },
};

const config: Config = examples.borrowTest;
const options = {
  simulate: true,
  sendTx: true,
};

async function main() {
  marginfiIdl.address = config.PROGRAM_ID;
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

  if (config.STAKE_POOL) {
    // Equivalent to findPoolMintAddress
    const [lstMint] = PublicKey.findProgramAddressSync(
      [Buffer.from("mint"), config.STAKE_POOL.toBuffer()],
      SINGLE_POOL_PROGRAM_ID
    );
    // Equivalent to findPoolStakeAuthorityAddress
    const [pool] = PublicKey.findProgramAddressSync(
      [Buffer.from("stake"), config.STAKE_POOL.toBuffer()],
      SINGLE_POOL_PROGRAM_ID
    );
    console.log("mint: " + lstMint + " pool " + pool);
  }

  const oracleMeta: AccountMeta[] = config.REMAINING.map((pubkey) => ({
    pubkey,
    isSigner: false,
    isWritable: false,
  }));

  const ata = getAssociatedTokenAddressSync(config.MINT, wallet.publicKey);
  const transaction = new Transaction();
  transaction.add(
    createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, ata, wallet.publicKey, config.MINT)
  );

  transaction.add(
    await program.methods
      .lendingAccountBorrow(config.AMOUNT)
      .accounts({
        // marginfiGroup: config.GROUP,
        marginfiAccount: config.ACCOUNT,
        // signer: wallet.publicKey,
        bank: config.BANK,
        destinationTokenAccount: ata,
        // bankLiquidityVaultAuthority = deriveLiquidityVaultAuthority(id, bank);
        // bankLiquidityVault = deriveLiquidityVault(id, bank)
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(oracleMeta)
      .instruction()
  );

  const priorityFee = 100000; // 0.0001 SOL (100,000 lamports)
  transaction.instructions.unshift(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee }));
  transaction.feePayer = wallet.publicKey;

  if (options?.simulate) {
    try {
      const simulation = await connection.simulateTransaction(transaction);
      console.log("Simulation results:", simulation);
    } catch (error) {
      console.error("Simulation failed:", error);
    }
  }

  if (options?.sendTx) {
    try {
      const signature = await sendAndConfirmTransaction(connection, transaction, [wallet]);
      console.log("Transaction signature:", signature);
    } catch (error) {
      console.error("Transaction failed:", error);
    }
  } else {
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    const base58Transaction = bs58.encode(serializedTransaction);
    console.log("Base58-encoded transaction:", base58Transaction);
  }

  console.log("borrow: " + config.AMOUNT.toString() + " from " + config.BANK);
}

main().catch((err) => {
  console.error(err);
});
