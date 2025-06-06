import BigNumber from "bignumber.js";
import { BankConfigOpt, RiskTier, OperationalState } from "@mrgnlabs/marginfi-client-v2";

/**
 * ┌────────────────────────────--─────────────────┐
 * │ Bank Configurations for Permission Pool Banks │
 * └───────────────────────────────--──────────────┘
 */

/**
 * Bank Configurations for stable banks (USDC, LST, USDT, SOL)
 */
export const DEFAULT_STABLE_BANK_CONFIG: BankConfigOpt = {
  assetWeightInit: new BigNumber(0.9),
  assetWeightMaint: new BigNumber(0.95),

  liabilityWeightInit: new BigNumber(1.25),
  liabilityWeightMaint: new BigNumber(1.1),

  depositLimit: new BigNumber(0).multipliedBy(1e6), // ? / oracle price
  borrowLimit: new BigNumber(0).multipliedBy(1e6), // ? / oracle price
  riskTier: RiskTier.Collateral,

  totalAssetValueInitLimit: new BigNumber(0),
  interestRateConfig: {
    // Curve Params
    optimalUtilizationRate: new BigNumber(0.8),
    plateauInterestRate: new BigNumber(0.1),
    maxInterestRate: new BigNumber(3),

    // Fees
    insuranceFeeFixedApr: new BigNumber(0),
    insuranceIrFee: new BigNumber(0),
    protocolFixedFeeApr: new BigNumber(0.01),
    protocolIrFee: new BigNumber(0.3),
    protocolOriginationFee: new BigNumber(0),
  },
  operationalState: OperationalState.Operational,

  oracleMaxAge: 300, // 5 mins
  permissionlessBadDebtSettlement: true,
  assetTag: null,
};

/**
 * Bank Configurations for other banks
 */
export const DEFAULT_TOKEN_BANK_CONFIG: BankConfigOpt = {
  assetWeightInit: new BigNumber(0.65),
  assetWeightMaint: new BigNumber(0.8),

  liabilityWeightInit: new BigNumber(1.3),
  liabilityWeightMaint: new BigNumber(1.2),

  depositLimit: new BigNumber(0),
  borrowLimit: new BigNumber(0),
  riskTier: RiskTier.Collateral,

  totalAssetValueInitLimit: new BigNumber(0),
  interestRateConfig: {
    // Curve Params
    optimalUtilizationRate: new BigNumber(0.8),
    plateauInterestRate: new BigNumber(0.1),
    maxInterestRate: new BigNumber(3),

    // Fees
    insuranceFeeFixedApr: new BigNumber(0),
    insuranceIrFee: new BigNumber(0),
    protocolFixedFeeApr: new BigNumber(0.01),
    protocolIrFee: new BigNumber(0.3),
    protocolOriginationFee: new BigNumber(0),
  },
  operationalState: OperationalState.Operational,
  oracleMaxAge: 60, // 1 mins
  permissionlessBadDebtSettlement: true,
  assetTag: null,
};

/**
 * ┌────────────────────────────--─────────────────┐
 * │ Pyth Oracle Configurations                    │
 * └───────────────────────────────--──────────────┘
 * If we want to have users use whitelisted Pyth oracle,
 * we can do so here
 */

// export const PYTH_USDC_ORACLE_CONFIG: BankConfigOpt["oracle"] = {
//   setup: OracleSetup.PythPushOracle,
//   keys: [
//     new PublicKey("Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD"), // feed id
//     new PublicKey("Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX"), // oracle key
//   ],
// };

// export const PYTH_LST_ORACLE_CONFIG: BankConfigOpt["oracle"] = {
//   setup: OracleSetup.PythLegacy,
//   keys: [new PublicKey("2H6gWKxJuoFjBS4REqNm4XRa7uVFf9n9yKEowpwh7LML")], // DECIDE WHAT TO USE
// };

/**
 * ┌────────────────────────────--─────────────────┐
 * │ DEFAULT DEPOSIT/BORROW LIMITS (USD)           │
 * └───────────────────────────────--──────────────┘
 * USD values used to calculate deposit and borrow limits
 */
export const DEFAULT_DEPOSIT_LIMIT = Number.MAX_SAFE_INTEGER; //infinite
export const DEFAULT_BORROW_LIMIT = Number.MAX_SAFE_INTEGER; //infinite

/**
 * ┌────────────────────────────--─────────────────┐
 * │ DEFAULT FEE RANGES                            │
 * └───────────────────────────────--──────────────┘
 * USD values used to calculate deposit and borrow limits
 */

export const MIN_ORGINIATION_FEE = 0.005; // 50 bps
export const MAX_ORGINIATION_FEE = 0.1; // 1000 bps

export const MIN_GROUP_FEE = 0; // 0 bps
export const MAX_GROUP_FEE = 0.92; // 9200 bps
export const WARNING_THRESHOLD = 0.25; // 2500 bps
export const MAX_WARNING_THRESHOLD = 0.5; // 5000 bps

/**
 * ┌────────────────────────────--─────────────────┐
 * │ MINT CATEGORIES                               │
 * └───────────────────────────────--──────────────┘
 * If we want to categorize mints for an optimized
 * bank config, we can do so here
 */

export const STABLE_MINT_KEYS = [
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
  "So11111111111111111111111111111111111111112", // SOL
  "2H6gWKxJuoFjBS4REqNm4XRa7uVFf9n9yKEowpwh7LML", // LST
];
