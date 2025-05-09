import dotenv from "dotenv";
import { AccountMeta, Connection, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { Marginfi } from "@mrgnlabs/marginfi-client-v2/src/idl/marginfi";
import marginfiIdl from "../../marginfi-client-v2/src/idl/marginfi.json";
import { I80F48_ONE, I80F48_ZERO, loadKeypairFromFile } from "./utils";
import { bigNumberToWrappedI80F48, TOKEN_PROGRAM_ID } from "@mrgnlabs/mrgn-common";
// TODO move to package import after update
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { InterestRateConfigRaw, BankConfigCompactRaw } from "@mrgnlabs/marginfi-client-v2";

dotenv.config();

/**
 * If true, send the tx. If false, output the unsigned b58 tx to console.
 */
const sendTx = true;
const verbose = true;

type Config = {
  PROGRAM_ID: string;
  GROUP_KEY: PublicKey;
  ORACLE: PublicKey;
  /** A pyth price feed that matches the configured Oracle */
  SOL_ORACLE_FEED: PublicKey;
  ADMIN: PublicKey;
  FEE_PAYER: PublicKey;
  BANK_MINT: PublicKey;
  SEED: number;
  MULTISIG_PAYER?: PublicKey; // May be omitted if not using squads
};

const config: Config = {
  PROGRAM_ID: "4ktkTCjsHh1VdqwqkXBjGqZKnBkycWZMe3AEXEcdSbwV",
  GROUP_KEY: new PublicKey("4M4o7DkXsX7FDmp3WpY9KYvmNpxSomWY4fTQzCG8P5PV"),
  ORACLE: new PublicKey("Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD"),
  SOL_ORACLE_FEED: new PublicKey("Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX"),
  ADMIN: new PublicKey("4ai4tdtEsanxqhuVg1BXCsHYyQPgG3rPsE99sCGoaks8"),
  FEE_PAYER: new PublicKey("4ai4tdtEsanxqhuVg1BXCsHYyQPgG3rPsE99sCGoaks8"),
  BANK_MINT: new PublicKey("3KETcC3MvTdni4tZSHVGLytLEP5YRkD9QHSMYKgdC6SU"),
  SEED: 0,
  MULTISIG_PAYER: new PublicKey("4ai4tdtEsanxqhuVg1BXCsHYyQPgG3rPsE99sCGoaks8"),

  // TODO configurable settings up here (currently, scroll down)
};

const deriveGlobalFeeState = (programId: PublicKey) => {
  return PublicKey.findProgramAddressSync([Buffer.from("feestate", "utf-8")], programId);
};

async function main() {
  marginfiIdl.address = config.PROGRAM_ID;
  const connection = new Connection("https://api.testnet.sonic.game/", "confirmed");
  const wallet = loadKeypairFromFile(process.env.MARGINFI_WALLET);

  // @ts-ignore
  const provider = new AnchorProvider(connection, wallet, {
    preflightCommitment: "confirmed",
  });

  const program = new Program<Marginfi>(
    // @ts-ignore
    marginfiIdl as Marginfi,
    provider
  );

  const [feeStateKey] = deriveGlobalFeeState(program.programId);
  const feeState = await program.account.feeState.fetch(feeStateKey);
  const feeWalletBefore = await provider.connection.getAccountInfo(feeState.globalFeeWallet);
  if (verbose) {
    console.log("fee state: " + feeState.key);
    console.log("fee wallet: " + feeState.globalFeeWallet);
    console.log("flat sol init fee: " + feeState.bankInitFlatSolFee);
    console.log("fee wallet lamports before: " + feeWalletBefore.lamports);
  }

  const transaction = new Transaction();

  const customConfig = {
    depositLimit: new BN(1_000_000_000 * 10 ** 6),
    borrowLimit: new BN(1_000_000_000 * 10 ** 6),
    totalAssetValueInitLimit: new BN(1_000_000_000 * 10 ** 6),
    riskTier: {
      isolated: {},
    },
    liabilityWeightInit: I80F48_ONE,
    liabilityWeightMaint: I80F48_ONE,

    // must be I80F48_ZERO if risk tier is isolated, otherwise I80F48_ONE
    assetWeightInit: I80F48_ZERO,
    assetWeightMaint: I80F48_ZERO,
  };

  const rate: InterestRateConfigRaw = {
    optimalUtilizationRate: bigNumberToWrappedI80F48(0.5),
    plateauInterestRate: bigNumberToWrappedI80F48(0.6),
    maxInterestRate: bigNumberToWrappedI80F48(3),
    insuranceFeeFixedApr: bigNumberToWrappedI80F48(0.01),
    insuranceIrFee: bigNumberToWrappedI80F48(0.02),
    protocolFixedFeeApr: bigNumberToWrappedI80F48(0.03),
    protocolIrFee: bigNumberToWrappedI80F48(0.04),
    protocolOriginationFee: bigNumberToWrappedI80F48(0.1),
  };

  let bankConfig: BankConfigCompactRaw = {
    assetWeightInit: customConfig.assetWeightInit,
    assetWeightMaint: customConfig.assetWeightMaint,
    liabilityWeightInit: customConfig.liabilityWeightInit,
    liabilityWeightMaint: customConfig.liabilityWeightMaint,
    depositLimit: customConfig.depositLimit,
    interestRateConfig: rate,
    operationalState: {
      operational: undefined,
    },
    borrowLimit: customConfig.borrowLimit,
    riskTier: customConfig.riskTier,
    totalAssetValueInitLimit: customConfig.totalAssetValueInitLimit,
    oracleMaxAge: 100,
    assetTag: 0,
    permissionlessBadDebtSettlement: false,
    freezeSettings: false,
  };

  // Note: the BN used by `BankConfigCompactRaw` is different from the kind used in the anchor
  // version here which requires this stupid hack where the BN is re-declared (or just TS-ignore it)
  const ix = await program.methods
    .lendingPoolAddBankWithSeed(
      {
        assetWeightInit: bankConfig.assetWeightInit,
        assetWeightMaint: bankConfig.assetWeightMaint,
        liabilityWeightInit: bankConfig.liabilityWeightInit,
        liabilityWeightMaint: bankConfig.liabilityWeightMaint,
        depositLimit: new BN(bankConfig.depositLimit.toString()),
        interestRateConfig: bankConfig.interestRateConfig,
        operationalState: bankConfig.operationalState,
        borrowLimit: new BN(bankConfig.borrowLimit.toString()),
        riskTier: bankConfig.riskTier,
        assetTag: 1, // ASSET TAG SOL
        pad0: [0, 0, 0, 0, 0, 0],
        totalAssetValueInitLimit: new BN(bankConfig.totalAssetValueInitLimit.toString()),
        oracleMaxAge: bankConfig.oracleMaxAge,
      },
      new BN(config.SEED)
    )
    .accounts({
      marginfiGroup: config.GROUP_KEY,
      admin: config.ADMIN,
      feePayer: config.FEE_PAYER,
      bankMint: config.BANK_MINT,
      // bank: // derived from mint/seed
      // globalFeeState: deriveGlobalFeeState(id),
      // globalFeeWallet: args.globalFeeWallet,
      // liquidityVaultAuthority = deriveLiquidityVaultAuthority(id, bank);
      // liquidityVault = deriveLiquidityVault(id, bank);
      // insuranceVaultAuthority = deriveInsuranceVaultAuthority(id, bank);
      // insuranceVault = deriveInsuranceVault(id, bank);
      // feeVaultAuthority = deriveFeeVaultAuthority(id, bank);
      // feeVault = deriveFeeVault(id, bank);
      // rent = SYSVAR_RENT_PUBKEY
      tokenProgram: TOKEN_PROGRAM_ID,
      // systemProgram: SystemProgram.programId,
    })
    .instruction();

  // TODO configure oracle here...

  transaction.add(ix);

  if (sendTx) {
    try {
      const signature = await sendAndConfirmTransaction(connection, transaction, [wallet]);
      console.log("Transaction signature:", signature);
      const [bankKey] = deriveBankWithSeed(program.programId, config.GROUP_KEY, config.BANK_MINT, new BN(config.SEED));
      console.log("bank key: " + bankKey);
    } catch (error) {
      console.error("Transaction failed:", error);
    }

    const feeWalletAfter = await provider.connection.getAccountInfo(feeState.globalFeeWallet);
    if (verbose) {
      console.log("fee wallet lamports after: " + feeWalletAfter.lamports);
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

// TODO remove when package updates
const deriveBankWithSeed = (programId: PublicKey, group: PublicKey, bankMint: PublicKey, seed: BN) => {
  return PublicKey.findProgramAddressSync(
    [group.toBuffer(), bankMint.toBuffer(), seed.toArrayLike(Buffer, "le", 8)],
    programId
  );
};

main().catch((err) => {
  console.error(err);
});
