import { Connection, PublicKey } from "@solana/web3.js";
import { Program, AnchorProvider } from "@coral-xyz/anchor";

import { loadKeypairFromFile } from "./utils";

import { Marginfi } from "@mrgnlabs/marginfi-client-v2/src/idl/marginfi";
import marginfiIdl from "@mrgnlabs/marginfi-client-v2/src/idl/marginfi.json";

const verbose = true;

type Config = {
  PROGRAM_ID: string;
  GROUP: PublicKey;
};

const config: Config = {
  PROGRAM_ID: "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA",
  GROUP: new PublicKey("4qp6Fx6tnZkY5Wropq9wUYgtFxXKwE6viZxFHg3rdAG8"),
};

async function main() {
  marginfiIdl.address = config.PROGRAM_ID;
  const connection = new Connection("https://solana-mainnet.g.alchemy.com/v2/HSPerR3bY_Fdy4xFpdTXVAjscS7mhXd8", "confirmed");
  const wallet = loadKeypairFromFile(process.env.HOME + "/.config/solana/id.json");

  // @ts-ignore
  const provider = new AnchorProvider(connection, wallet, {
    preflightCommitment: "confirmed",
  });

  const program = new Program<Marginfi>(marginfiIdl as Marginfi, provider);
  let group = await program.account.marginfiGroup.fetch(config.GROUP);

  console.log("admin: " + group.admin);
}

main().catch((err) => {
  console.error(err);
});
