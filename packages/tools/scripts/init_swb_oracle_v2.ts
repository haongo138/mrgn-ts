import {
  CrossbarClient,
  OracleJob
} from "@switchboard-xyz/common";
import {
  AnchorUtils,
  PullFeed,
  getDefaultQueue,
  asV0Tx,
} from "@switchboard-xyz/on-demand";
import { loadKeypairFromFile } from "../lib/utils";

const main = async () => {
  const jobs: OracleJob[] = [
    OracleJob.create({
      tasks: [
        {
          oracleTask: {
            pythAddress: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
            pythConfigs: {
              pythAllowedConfidenceInterval: 1
            },
          }
        }
      ],
    }),
  ];

  console.log("Running simulation...\n");

  // Print the jobs that are being run.
  const jobJson = JSON.stringify({ jobs: jobs.map((job) => job.toJSON()) });
  console.log(jobJson);
  console.log("--------------------------------");

  // Serialize the jobs to base64 strings.
  const serializedJobs = jobs.map((oracleJob) => {
    const encoded = OracleJob.encodeDelimited(oracleJob).finish();
    const base64 = Buffer.from(encoded).toString("base64");
    return base64;
  });

  // Call the simulation server.
  const response = await fetch("https://api.switchboard.xyz/api/simulate", {
    method: "POST",
    headers: [["Content-Type", "application/json"]],
    body: JSON.stringify({ cluster: "Mainnet", jobs: serializedJobs }),
  });

  // Check response.
  if (response.ok) {
    const data = await response.json();
    console.log(`Response is good (${response.status})`);
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(`Response is bad (${response.status})`);
    throw await response.text();
  }

  console.log("Storing and creating the feed...\n");

  // Get the queue for the network you're deploying on
  let queue = await getDefaultQueue(process.env.PRIVATE_RPC_ENDPOINT);

  // Get the crossbar server client
  const crossbarClient = CrossbarClient.default();

  // Get the payer keypair
  const payer = loadKeypairFromFile(process.env.MARGINFI_WALLET);
  console.log("Using Payer:", payer.publicKey.toBase58(), "\n");

  // Upload jobs to Crossbar, which pins valid feeds on ipfs
  const { feedHash } = await crossbarClient.store(queue.pubkey.toBase58(), jobs);
  const [pullFeed, feedKeypair] = PullFeed.generate(queue.program);
  const initIx = await pullFeed.initIx({
    name: "SOL/USD", // the feed name (max 32 bytes)
    queue: queue.pubkey, // the queue of oracles to bind to
    maxVariance: 1.0, // the maximum variance allowed for the feed results
    minResponses: 1, // minimum number of responses of jobs to allow
    feedHash: Buffer.from(feedHash.slice(2), "hex"), // the feed hash
    minSampleSize: 1, // The minimum number of samples required for setting feed value
    maxStaleness: 300, // The maximum number of slots that can pass before a feed value is considered stale.
    payer: payer.publicKey, // the payer of the feed
  });

  const initTx = await asV0Tx({
    connection: queue.program.provider.connection,
    ixs: [initIx],
    payer: payer.publicKey,
    signers: [payer, feedKeypair],
    computeUnitPrice: 200_000,
    computeUnitLimitMultiple: 1.5,
  });

  // simulate the transaction
  const simulateResult =
    await queue.program.provider.connection.simulateTransaction(initTx, {
      commitment: "processed",
    });
  console.log(simulateResult);

  const initSig = await queue.program.provider.connection.sendTransaction(
    initTx,
    {
      preflightCommitment: "processed",
      skipPreflight: false,
    }
  );

  console.log(`Feed ${feedKeypair.publicKey} initialized: ${initSig}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
