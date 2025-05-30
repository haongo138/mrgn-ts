import { PublicKey } from "@solana/web3.js";
import { InstructionsWrapper } from "@mrgnlabs/mrgn-common";

import instructions from "../../instructions";
import { MarginfiProgram } from "../../types";
import { BankConfigOpt, BankConfigOptRaw, OracleSetup } from "./types";
import { serializeBankConfigOpt, serializeOracleSetupToIndex } from "./utils";

export async function freezeBankConfigIx(
  program: MarginfiProgram,
  bankAddress: PublicKey,
  bankConfigOpt: BankConfigOpt
): Promise<InstructionsWrapper> {
  let bankConfigRaw: BankConfigOptRaw;
  if (!bankConfigOpt) {
    // todo: make bankConfigOpt optional and create function to get bankConfigOptRaw from bank
  }
  bankConfigRaw = serializeBankConfigOpt(bankConfigOpt);

  const ix = await instructions.makePoolConfigureBankIx(
    program,
    {
      bank: bankAddress,
    },
    {
      bankConfigOpt: {
        // ...bankConfigRaw,
        assetWeightInit: null,
        assetWeightMaint: null,

        liabilityWeightInit: null,
        liabilityWeightMaint: null,

        depositLimit: null,
        borrowLimit: null,
        riskTier: null,
        assetTag: null,
        totalAssetValueInitLimit: null,

        interestRateConfig: null,
        operationalState: null,

        oracleMaxAge: null,
        permissionlessBadDebtSettlement: null,
        freezeSettings: true,
      },
    }
  );

  return {
    instructions: [ix],
    keys: [],
  };
}

type AddOracleToBanksIxArgs = {
  program: MarginfiProgram;
  bankAddress: PublicKey;
  feedId: PublicKey;
  oracleKey?: PublicKey;
  setup: OracleSetup;
  groupAddress?: PublicKey;
  adminAddress?: PublicKey;
};

export async function addOracleToBanksIx({
  program,
  bankAddress,
  feedId,
  oracleKey,
  setup,
  groupAddress,
  adminAddress,
}: AddOracleToBanksIxArgs): Promise<InstructionsWrapper> {
  const ix = await instructions.makeLendingPoolConfigureBankOracleIx(
    program,
    {
      bank: bankAddress,
      group: groupAddress,
      admin: adminAddress,
    },
    {
      setup: serializeOracleSetupToIndex(setup),
      feedId,
    },
    oracleKey ? [{ isSigner: false, isWritable: false, pubkey: oracleKey }] : []
  );

  return {
    instructions: [ix],
    keys: [],
  };
}
