import dotenv from "dotenv";
import { Connection, PublicKey, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import * as sb from "@switchboard-xyz/on-demand";
import { CrossbarClient, decodeString, OracleJob } from "@switchboard-xyz/common";
import { loadKeypairFromFile } from "./utils";

dotenv.config();

type PoolOracleApiResponse = {
  programIdl: string;
  programId: string;
  queueKey: string;
};

type Config = {
  PROGRAM_ID: string;
  ADMIN_KEY: PublicKey;
  TOKEN_MINT: PublicKey;
  TOKEN_SYMBOL: string;
};

const config: Config = {
  PROGRAM_ID: "4ktkTCjsHh1VdqwqkXBjGqZKnBkycWZMe3AEXEcdSbwV",
  ADMIN_KEY: new PublicKey("4ai4tdtEsanxqhuVg1BXCsHYyQPgG3rPsE99sCGoaks8"),
  TOKEN_MINT: new PublicKey("3KETcC3MvTdni4tZSHVGLytLEP5YRkD9QHSMYKgdC6SU"),
  TOKEN_SYMBOL: "GOLDSOL",
};

/**
 * Default Pull Feed Configuration
 */
export const DEFAULT_PULL_FEED_CONF = {
  //   name: `TOKEN/USD`, // the feed name (max 32 bytes)
  //   queue: new PublicKey(queue), // the queue of oracles to bind to
  maxVariance: 10.0, // allow 1% variance between submissions and jobs
  minResponses: 1, // minimum number of responses of jobs to allow
  //numSignatures: 1, // number of signatures to fetch per update, not in the config it looks like
  minSampleSize: 1, // minimum number of responses to sample for a result
  maxStaleness: 250, // maximum stale slots of responses to sample
  //   feedHash: feedHashBuffer,
};

/**
 * Value Task Configuration
 */
export const VALUE_TASK: OracleJob.ITask = {
  valueTask: {
    big: "1",
  },
};

/**
 * Divide Task Configuration
 */
export function createDivideOracleTask(outTokenAddress: string): OracleJob.ITask {
  return {
    divideTask: {
      job: {
        tasks: [
          {
            jupiterSwapTask: {
              inTokenAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
              outTokenAddress, // TOKEN
              baseAmountString: "1",
            },
          },
        ],
      },
    },
  };
}

/**
 * Multiply Task Configuration
 */
export const MULTIPLY_ORACLE_TASK: OracleJob.ITask = {
  multiplyTask: {
    job: {
      tasks: [
        {
          oracleTask: {
            pythAddress: "Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD", // PYTH USDC oracle
            pythAllowedConfidenceInterval: 5,
          },
        },
      ],
    },
  },
};

async function main() {
  const queue = await sb.getDefaultQueue(process.env.PRIVATE_RPC_ENDPOINT);
  const programIdlString = JSON.stringify(queue.program.idl);
  const programId = queue.program.programId;
  const queueKey = queue.pubkey;
  console.log("fetched oracle program data: ", { programIdlString, programId, queueKey });

  // initialize connection and load wallet
  const connection = new Connection(process.env.PRIVATE_RPC_ENDPOINT, "confirmed");
  const keypair = loadKeypairFromFile(process.env.MARGINFI_WALLET);
  const wallet = new Wallet(keypair);
  console.log("wallet: " + keypair.publicKey);

  // initialize program
  const programIdl = JSON.parse(programIdlString);
  const provider = new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions());
  const program = new Program(programIdl, provider);

  // Get the default crossbar server client
  const crossbarClient = CrossbarClient.default();

  // Initialize tasks for the oracle job
  const valueTask = OracleJob.Task.create(VALUE_TASK);
  const divideTask = OracleJob.Task.create(createDivideOracleTask(config.TOKEN_MINT.toBase58()));
  const multiplyTask = OracleJob.Task.create(MULTIPLY_ORACLE_TASK);
  const oracleJob = OracleJob.create({
    tasks: [valueTask, divideTask, multiplyTask],
  });

  // Store the oracle job and get the feed hash
  const feedHash = (await crossbarClient.store(queueKey.toBase58(), [oracleJob])).feedHash;
  const feedHashBuffer = decodeString(feedHash);
  if (!feedHashBuffer) return;

  const [pullFeed, feedSeed] = sb.PullFeed.generate(program);

  const conf = {
    ...DEFAULT_PULL_FEED_CONF,
    name: `${config.TOKEN_SYMBOL}/USD`, // the feed name (max 32 bytes)
    queue: new PublicKey(queueKey), // the queue of oracles to bind to
    feedHash: Buffer.from(feedHash.slice(2), "hex"),
    payer: wallet.publicKey,
  };

  // Initialize the pull feed
  const pullFeedIx = await pullFeed.initIx(conf);

  console.log(`[INFO] Feed Public Key for ${config.TOKEN_SYMBOL}/USD: ${feedSeed.publicKey.toBase58()}`);
  const transaction = new Transaction();
  transaction.add(pullFeedIx);
  try {
    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair]);
    console.log("Transaction signature:", signature);
  } catch (error) {
    console.error("Transaction failed:", error);
  }
}

main().catch((err) => {
  console.error(err);
});
