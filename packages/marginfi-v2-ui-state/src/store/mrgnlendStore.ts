import {
  getValueInsensitive,
  nativeToUi,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  unpackAccount,
} from "@mrgnlabs/mrgn-common";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  DEFAULT_ACCOUNT_SUMMARY,
  makeEmissionsPriceMap,
  computeAccountSummary,
  fetchTokenAccounts,
  makeExtendedBankInfo,
  AccountSummary,
  ExtendedBankInfo,
  TokenAccountMap,
  ExtendedBankMetadata,
  makeExtendedBankMetadata,
  makeExtendedBankEmission,
  TokenPriceMap,
  fetchGroupData,
  filterStakedAssetBanks,
  getStakePoolActiveStates,
  StakePoolMetadata,
  getStakeAccountsCached,
  ValidatorStakeGroup,
  getValidatorRates,
  getStakePoolMev,
} from "../lib";
import { getPointsSummary } from "../lib/points";
import { create, StateCreator } from "zustand";
import { persist } from "zustand/middleware";

import { Bank, getPriceWithConfidence, OraclePrice } from "@mrgnlabs/marginfi-client-v2";
import type {
  Wallet,
  BankMetadataMap,
  TokenMetadataMap,
  TokenMetadata,
  BankMetadata,
  WalletToken,
} from "@mrgnlabs/mrgn-common";
import type { MarginfiAccountWrapper, ProcessTransactionStrategy } from "@mrgnlabs/marginfi-client-v2";
import type { MarginfiClient, MarginfiConfig } from "@mrgnlabs/marginfi-client-v2";

interface ProtocolStats {
  deposits: number;
  borrows: number;
  tvl: number;
  pointsTotal: number;
}

interface MrgnlendState {
  // State
  initialized: boolean;
  userDataFetched: boolean;
  isRefreshingStore: boolean;
  marginfiClient: MarginfiClient | null;
  marginfiAccounts: MarginfiAccountWrapper[];
  bankMetadataMap: BankMetadataMap;
  tokenMetadataMap: TokenMetadataMap;
  extendedBankMetadatas: ExtendedBankMetadata[];
  extendedBankInfos: ExtendedBankInfo[];
  stakedAssetBankInfos: ExtendedBankInfo[];
  extendedBankInfosWithoutStakedAssets: ExtendedBankInfo[];
  stakeAccounts: ValidatorStakeGroup[];
  protocolStats: ProtocolStats;
  selectedAccount: MarginfiAccountWrapper | null;
  nativeSolBalance: number;
  accountSummary: AccountSummary;
  emissionTokenMap: TokenPriceMap | null;
  birdEyeApiKey: string;
  bundleSimRpcEndpoint: string | null;
  stageTokens: string[] | null;
  processTransactionStrategy: ProcessTransactionStrategy | null;

  walletTokens: WalletToken[] | null;

  // Actions
  fetchMrgnlendState: (args?: {
    marginfiConfig?: MarginfiConfig;
    connection?: Connection;
    wallet?: Wallet;
    isOverride?: boolean;
    birdEyeApiKey?: string;
    bundleSimRpcEndpoint?: string;
    stageTokens?: string[];
    processTransactionStrategy?: ProcessTransactionStrategy;
  }) => Promise<void>;
  setIsRefreshingStore: (isRefreshingStore: boolean) => void;
  resetUserData: () => void;
  fetchWalletTokens: (wallet: Wallet, extendedBankInfos: ExtendedBankInfo[]) => Promise<void>;
  updateWalletTokens: (connection: Connection) => Promise<void>;
  updateWalletToken: (tokenAddress: string, ata: string, connection: Connection) => Promise<void>;
}

function createMrgnlendStore() {
  return create<MrgnlendState>(stateCreator);
}

function createPersistentMrgnlendStore() {
  return create<MrgnlendState, [["zustand/persist", Pick<MrgnlendState, "protocolStats">]]>(
    persist(stateCreator, {
      name: "mrgnlend-peristent-store",
      partialize(state) {
        return {
          protocolStats: state.protocolStats,
        };
      },
    })
  );
}

function createLocalStorageKey(authority: PublicKey): string {
  return `marginfi_accounts-${authority.toString()}`;
}

async function getCachedMarginfiAccountsForAuthority(
  authority: PublicKey,
  client: MarginfiClient
): Promise<MarginfiAccountWrapper[]> {
  if (typeof window === "undefined") {
    return client.getMarginfiAccountsForAuthority(authority);
  }

  const cacheKey = createLocalStorageKey(authority);
  const cachedAccountsStr = window.localStorage.getItem(cacheKey);
  let cachedAccounts: string[] = [];

  if (cachedAccountsStr) {
    cachedAccounts = JSON.parse(cachedAccountsStr);
  }

  if (cachedAccounts && cachedAccounts.length > 0) {
    const accountAddresses: PublicKey[] = cachedAccounts.reduce((validAddresses: PublicKey[], address: string) => {
      try {
        const publicKey = new PublicKey(address);
        validAddresses.push(publicKey);
        return validAddresses;
      } catch (error) {
        console.warn(`Invalid public key: ${address}. Skipping.`);
        return validAddresses;
      }
    }, []);

    // Update local storage with valid addresses only
    window.localStorage.setItem(cacheKey, JSON.stringify(accountAddresses.map((addr) => addr.toString())));
    return client.getMultipleMarginfiAccounts(accountAddresses);
  } else {
    const accounts = await client.getMarginfiAccountsForAuthority(authority);
    const accountAddresses = accounts.map((account) => account.address.toString());
    window.localStorage.setItem(cacheKey, JSON.stringify(accountAddresses));
    return accounts;
  }
}

export function clearAccountCache(authority: PublicKey) {
  try {
    const cacheKey = createLocalStorageKey(authority);
    window.localStorage.removeItem(cacheKey);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Error clearing account cache.`);
    } else {
      throw new Error("An unknown error occurred while clearing account cache.");
    }
  }
}

const stateCreator: StateCreator<MrgnlendState, [], []> = (set, get) => ({
  // State
  initialized: false,
  userDataFetched: false,
  isRefreshingStore: false,
  marginfiClient: null,
  marginfiAccounts: [],
  bankMetadataMap: {},
  tokenMetadataMap: {},
  extendedBankMetadatas: [],
  extendedBankInfos: [],
  stakeAccounts: [],
  stakedAssetBankInfos: [],
  extendedBankInfosWithoutStakedAssets: [],
  protocolStats: {
    deposits: 0,
    borrows: 0,
    tvl: 0,
    pointsTotal: 0,
  },
  marginfiAccountCount: 0,
  selectedAccount: null,
  nativeSolBalance: 0,
  accountSummary: DEFAULT_ACCOUNT_SUMMARY,
  birdEyeApiKey: "",
  emissionTokenMap: {},
  bundleSimRpcEndpoint: null,
  stageTokens: null,
  processTransactionStrategy: null,

  walletTokens: null,

  // Actions
  fetchMrgnlendState: async (args?: {
    marginfiConfig?: MarginfiConfig;
    connection?: Connection;
    wallet?: Wallet;
    isOverride?: boolean;
    birdEyeApiKey?: string;
    bundleSimRpcEndpoint?: string;
    stageTokens?: string[];
    processTransactionStrategy?: ProcessTransactionStrategy;
  }) => {
    try {
      const { MarginfiClient } = await import("@mrgnlabs/marginfi-client-v2");
      const { loadBankMetadatas, loadStakedBankMetadatas, loadTokenMetadatas } = await import("@mrgnlabs/mrgn-common");

      let userDataFetched = false;

      const connection = args?.connection ?? get().marginfiClient?.provider.connection;
      if (!connection) throw new Error("Connection not found");

      const wallet = args?.wallet ?? get().marginfiClient?.provider?.wallet;

      const marginfiConfig = args?.marginfiConfig ?? get().marginfiClient?.config;
      if (!marginfiConfig) throw new Error("Marginfi config must be provided at least once");

      const stageTokens = args?.stageTokens ?? get().stageTokens;

      const isReadOnly = args?.isOverride !== undefined ? args.isOverride : (get().marginfiClient?.isReadOnly ?? false);
      const bundleSimRpcEndpoint = args?.bundleSimRpcEndpoint ?? get().bundleSimRpcEndpoint ?? undefined;
      const processTransactionStrategy =
        args?.processTransactionStrategy ?? get().processTransactionStrategy ?? undefined;

      let bankMetadataMap: { [address: string]: BankMetadata };
      let tokenMetadataMap: { [symbol: string]: TokenMetadata };

      if (marginfiConfig.environment === "production") {
        let results = await Promise.all([
          loadBankMetadatas(process.env.NEXT_PUBLIC_BANKS_MAP),
          loadTokenMetadatas(process.env.NEXT_PUBLIC_TOKENS_MAP),
        ]);
        bankMetadataMap = results[0];
        tokenMetadataMap = results[1];
      } else if (marginfiConfig.environment === "staging") {
        if (process.env.NEXT_PUBLIC_BANKS_MAP && process.env.NEXT_PUBLIC_TOKENS_MAP) {
          let results = await Promise.all([
            loadBankMetadatas(process.env.NEXT_PUBLIC_BANKS_MAP),
            loadTokenMetadatas(process.env.NEXT_PUBLIC_TOKENS_MAP),
          ]);
          bankMetadataMap = results[0];
          tokenMetadataMap = results[1];
        } else {
          const bankMetadataJson = (await import("./staging-metadata.json")) as {
            bankMetadata: BankMetadataMap;
            tokenMetadata: TokenMetadataMap;
          };
          bankMetadataMap = bankMetadataJson.bankMetadata;
          tokenMetadataMap = bankMetadataJson.tokenMetadata;
        }
      } else if (marginfiConfig.environment === "mainnet-test-1") {
        const bankMetadataJson = (await import("./mainnet-test-1-metadata.json")) as {
          bankMetadata: BankMetadataMap;
          tokenMetadata: TokenMetadataMap;
        };
        bankMetadataMap = bankMetadataJson.bankMetadata;
        tokenMetadataMap = bankMetadataJson.tokenMetadata;
      } else {
        throw new Error("Unknown environment");
      }

      // fetch staked asset metadata
      const stakedAssetBankMetadataMap = await loadStakedBankMetadatas(
        `${process.env.NEXT_PUBLIC_STAKING_BANKS || "https://storage.googleapis.com/mrgn-public/mrgn-staked-bank-metadata-cache.json"}?t=${new Date().getTime()}`
      );
      const stakedAssetTokenMetadataMap = await loadTokenMetadatas(
        `${process.env.NEXT_PUBLIC_STAKING_TOKENS || "https://storage.googleapis.com/mrgn-public/mrgn-staked-token-metadata-cache.json"}?t=${new Date().getTime()}`
      );

      // merge staked asset metadata with main group metadata
      bankMetadataMap = {
        ...bankMetadataMap,
        ...stakedAssetBankMetadataMap,
      };
      tokenMetadataMap = {
        ...tokenMetadataMap,
        ...stakedAssetTokenMetadataMap,
      };

      const bankAddresses = Object.keys(bankMetadataMap).map((address) => new PublicKey(address));

      const marginfiClient = await MarginfiClient.fetch(marginfiConfig, wallet ?? ({} as any), connection, {
        preloadedBankAddresses: bankAddresses,
        readOnly: isReadOnly,
        bundleSimRpcEndpoint,
        bankMetadataMap: bankMetadataMap,
        processTransactionStrategy,
        fetchGroupDataOverride: fetchGroupData,
      });
      const clientBanks = [...marginfiClient.banks.values()];

      const banks = stageTokens
        ? clientBanks.filter(
            (bank) => bank.tokenSymbol && !stageTokens.find((a) => a.toLowerCase() == bank?.tokenSymbol?.toLowerCase())
          )
        : clientBanks;

      const birdEyeApiKey = args?.birdEyeApiKey ?? get().birdEyeApiKey;
      const emissionsTokenMap = get().emissionTokenMap ?? null;
      const priceMap = await makeEmissionsPriceMap(banks, connection, emissionsTokenMap);

      let nativeSolBalance: number = 0;
      let tokenAccountMap: TokenAccountMap;
      let marginfiAccounts: MarginfiAccountWrapper[] = [];
      let selectedAccount: MarginfiAccountWrapper | null = null;
      let stakeAccounts: ValidatorStakeGroup[] = [];
      if (wallet?.publicKey) {
        const [tokenData, marginfiAccountWrappers] = await Promise.all([
          fetchTokenAccounts(
            connection,
            wallet.publicKey,
            banks.map((bank) => ({
              mint: bank.mint,
              mintDecimals: bank.mintDecimals,
              bankAddress: bank.address,
              assetTag: bank.config.assetTag,
            })),
            marginfiClient.mintDatas
          ),
          getCachedMarginfiAccountsForAuthority(wallet.publicKey, marginfiClient),
        ]);

        stakeAccounts = await getStakeAccountsCached(wallet.publicKey);

        nativeSolBalance = tokenData.nativeSolBalance;
        tokenAccountMap = tokenData.tokenAccountMap;
        marginfiAccounts = marginfiAccountWrappers;

        //@ts-ignore
        const selectedAccountAddress = localStorage.getItem("mfiAccount");
        if (!selectedAccountAddress && marginfiAccounts.length > 0) {
          // if no account is saved, select the highest value account (first one)
          selectedAccount = marginfiAccounts[0];
        } else {
          // if account is saved, select it if found, otherwise forget saved one
          const maybeSelectedAccount = marginfiAccounts.find(
            (account) => account.address.toBase58() === selectedAccountAddress
          );

          if (maybeSelectedAccount) {
            selectedAccount = maybeSelectedAccount;
          } else {
            //@ts-ignore
            localStorage.removeItem("mfiAccount");
            selectedAccount = null;
          }
        }

        userDataFetched = true;
      }

      const banksWithPriceAndToken: {
        bank: Bank;
        oraclePrice: OraclePrice;
        tokenMetadata: TokenMetadata;
      }[] = [];

      banks.forEach((bank) => {
        const oraclePrice = marginfiClient.getOraclePriceByBank(bank.address);
        if (!oraclePrice) {
          return;
        }

        const bankMetadata = bankMetadataMap[bank.address.toBase58()];
        if (bankMetadata === undefined) {
          return;
        }

        try {
          const tokenMetadata = getValueInsensitive(tokenMetadataMap, bankMetadata.tokenSymbol);
          if (!tokenMetadata) {
            return;
          }

          banksWithPriceAndToken.push({ bank, oraclePrice, tokenMetadata });
        } catch (err) {
          console.error("error fetching token metadata: ", err);
        }
      });

      // get stake pool active states for all staked asset banks
      // will be disabled in the ui until active
      const validatorVoteAccounts = banksWithPriceAndToken
        .filter((bank) => bank.bank.config.assetTag === 2)
        .map((bank) => {
          const bankMetadata = bankMetadataMap[bank.bank.address.toBase58()];
          return new PublicKey(bankMetadata.validatorVoteAccount || "");
        });
      const stakePoolActiveStates = await getStakePoolActiveStates(connection, validatorVoteAccounts);
      const mev = await getStakePoolMev(connection, validatorVoteAccounts);
      const validatorRates = await getValidatorRates(validatorVoteAccounts);

      let [extendedBankInfos, extendedBankMetadatas] = banksWithPriceAndToken.reduce(
        (acc, { bank, oraclePrice, tokenMetadata }) => {
          const emissionTokenPriceData = priceMap[bank.emissionsMint.toBase58()];

          let userData;
          if (wallet?.publicKey) {
            const tokenAccount = tokenAccountMap!.get(bank.mint.toBase58());
            if (!tokenAccount) {
              return acc;
            }
            userData = {
              nativeSolBalance,
              tokenAccount,
              marginfiAccount: selectedAccount,
            };
          }

          // build staked asset metadata
          let stakedAssetMetadata: StakePoolMetadata | undefined;
          if (bank.config.assetTag === 2) {
            const isActive = stakePoolActiveStates.get(bank.mint.toBase58()) || false;
            const validatorVoteAccount = new PublicKey(
              bankMetadataMap[bank.address.toBase58()].validatorVoteAccount || ""
            );
            stakedAssetMetadata = {
              isActive,
              validatorVoteAccount,
              validatorRewards: validatorRates.get(bank.mint.toBase58()) || 0,
              mev: mev.get(validatorVoteAccount.toBase58()) || {
                pool: 0,
                onramp: 0,
              },
            };
          }

          acc[0].push(
            makeExtendedBankInfo(
              tokenMetadata,
              bank,
              oraclePrice,
              emissionTokenPriceData,
              userData,
              false,
              stakedAssetMetadata
            )
          );
          acc[1].push(makeExtendedBankMetadata(bank, tokenMetadata, false, stakedAssetMetadata));

          return acc;
        },
        [[], []] as [ExtendedBankInfo[], ExtendedBankMetadata[]]
      );

      const sortedExtendedBankInfos = extendedBankInfos.sort(
        (a, b) => b.info.state.totalDeposits * b.info.state.price - a.info.state.totalDeposits * a.info.state.price
      );

      const sortedExtendedBankMetadatas = extendedBankMetadatas.sort((am, bm) => {
        const a = sortedExtendedBankInfos.find((a) => a.address.equals(am.address))!;
        const b = sortedExtendedBankInfos.find((b) => b.address.equals(bm.address))!;

        if (!a || !b) return 0;
        return b.info.state.totalDeposits * b.info.state.price - a.info.state.totalDeposits * a.info.state.price;
      });

      const stakedAssetBankInfos = extendedBankInfos.filter((bank) => bank.info.rawBank.config.assetTag === 2);

      const { deposits, borrows } = extendedBankInfos.reduce(
        (acc, bank) => {
          const price = getPriceWithConfidence(bank.info.oraclePrice, false).price.toNumber();
          acc.deposits += bank.info.state.totalDeposits * price;
          acc.borrows += bank.info.state.totalBorrows * price;
          return acc;
        },
        { deposits: 0, borrows: 0 }
      );

      let accountSummary: AccountSummary = DEFAULT_ACCOUNT_SUMMARY;
      if (wallet?.publicKey && selectedAccount) {
        accountSummary = computeAccountSummary(selectedAccount, extendedBankInfos);
      }

      const pointsTotal = get().protocolStats.pointsTotal;

      set({
        initialized: true,
        userDataFetched,
        isRefreshingStore: false,
        marginfiClient,
        marginfiAccounts,
        bankMetadataMap,
        tokenMetadataMap,
        extendedBankInfos: sortedExtendedBankInfos,
        extendedBankMetadatas: sortedExtendedBankMetadatas,
        stakedAssetBankInfos,
        extendedBankInfosWithoutStakedAssets: sortedExtendedBankInfos.filter(
          (bank) => bank.info.rawBank.config.assetTag !== 2
        ),
        stakeAccounts,
        protocolStats: {
          deposits,
          borrows,
          tvl: deposits - borrows,
          pointsTotal: pointsTotal,
        },
        selectedAccount,
        nativeSolBalance,
        accountSummary,
        birdEyeApiKey,
        bundleSimRpcEndpoint,
        processTransactionStrategy,
        stageTokens: stageTokens ?? null,
      });

      const pointSummary = await getPointsSummary();

      set({
        protocolStats: { deposits, borrows, tvl: deposits - borrows, pointsTotal: pointSummary.points_total },
      });

      const [sortedExtendedBankEmission, sortedExtendedBankMetadatasEmission, newEmissionsTokenMap] =
        await makeExtendedBankEmission(sortedExtendedBankInfos, sortedExtendedBankMetadatas, priceMap, birdEyeApiKey);

      if (newEmissionsTokenMap !== null) {
        set({
          extendedBankInfos: sortedExtendedBankEmission,
          extendedBankMetadatas: sortedExtendedBankMetadatasEmission,
          emissionTokenMap: newEmissionsTokenMap,
        });
      } else {
        if (emissionsTokenMap && Object.keys(emissionsTokenMap).length === 0) {
          set({
            extendedBankInfos: sortedExtendedBankEmission,
            extendedBankMetadatas: sortedExtendedBankMetadatasEmission,
            emissionTokenMap: null,
          });
        }
      }
    } catch (err) {
      console.error("error refreshing state: ", err);
      set({ isRefreshingStore: false });
    }
  },
  setIsRefreshingStore: (isRefreshingStore: boolean) => set({ isRefreshingStore }),
  resetUserData: () => {
    const extendedBankInfos = get().extendedBankInfos.map((extendedBankInfo) => ({
      ...extendedBankInfo,
      userInfo: {
        tokenAccount: {
          created: false,
          mint: extendedBankInfo.info.state.mint,
          balance: 0,
        },
        maxDeposit: 0,
        maxRepay: 0,
        maxWithdraw: 0,
        maxBorrow: 0,
      },
    }));

    set({
      userDataFetched: false,
      selectedAccount: null,
      nativeSolBalance: 0,
      accountSummary: DEFAULT_ACCOUNT_SUMMARY,
      extendedBankInfos,
      marginfiClient: null,
    });
  },

  fetchWalletTokens: async (wallet: Wallet, extendedBankInfos: ExtendedBankInfo[]) => {
    try {
      const response = await fetch(`/api/user/wallet?wallet=${wallet.publicKey.toBase58()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch wallet tokens");
      }
      const data = await response.json();

      const mappedData: WalletToken[] = data.map((token: WalletToken) => {
        return {
          ...token,
          address: new PublicKey(token.address),
          ata: new PublicKey(token.ata),
        };
      });

      const bankTokenSymbols = new Set(extendedBankInfos.map((bank) => bank.meta.tokenSymbol));
      const bankTokenAddresses = new Set(extendedBankInfos.map((bank) => bank.address.toBase58()));

      const filteredTokens = mappedData
        .filter((token) => !bankTokenSymbols.has(token.symbol))
        .filter((token) => !bankTokenAddresses.has(token.address.toBase58()));

      set({ walletTokens: filteredTokens });
    } catch (error) {
      console.error("Failed to fetch wallet tokens:", error);
    }
  },
  updateWalletTokens: async (connection: Connection) => {
    try {
      const walletTokens = get().walletTokens;

      if (!walletTokens) {
        return;
      }

      // Updated prices
      const response = await fetch(
        `/api/tokens/price-multiple?tokenAddress=${encodeURIComponent(
          walletTokens.map((token) => token.address.toBase58()).join(",")
        )}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch wallet tokens");
      }

      const updatedPrices = await response.json();

      // Updated balances
      const accountsAiList = await connection.getMultipleAccountsInfo([...walletTokens.map((token) => token.ata)]);

      const decodedAccountInfos = accountsAiList.map((ai, idx) => {
        let accountOwner;
        if (ai?.owner.equals(TOKEN_2022_PROGRAM_ID)) {
          accountOwner = TOKEN_2022_PROGRAM_ID;
        } else {
          accountOwner = TOKEN_PROGRAM_ID;
        }
        const decoded = unpackAccount(walletTokens[idx].ata, ai, accountOwner);
        return decoded;
      });

      const updatedWalletTokens = walletTokens.map((token) => {
        const tokenPriceData = updatedPrices[token.address.toBase58()];
        const tokenBalance = decodedAccountInfos.find(
          (decoded) => decoded.mint.toBase58() === token.address.toBase58()
        );
        return {
          ...token,
          price: tokenPriceData ? tokenPriceData.value : token.price,
          balance: tokenBalance
            ? Number(nativeToUi(tokenBalance.amount.toString(), token.mintDecimals))
            : token.balance,
        };
      });

      // Update the state with the new token prices
      set({ walletTokens: updatedWalletTokens });
    } catch (error) {
      console.error("Failed to update wallet tokens:", error);
    }
  },

  updateWalletToken: async (tokenAddress: string, ata: string, connection: Connection) => {
    try {
      const walletTokens = get().walletTokens;

      if (!walletTokens) {
        return;
      }

      // Updated price
      const response = await fetch(`/api/tokens/price?tokenAddress=${tokenAddress}`);

      if (!response.ok) {
        throw new Error("Failed to fetch wallet token");
      }

      const updatedPriceObject = await response.json();

      // Updated balance
      const accountInfo = await connection.getAccountInfo(new PublicKey(ata));
      let accountOwner;
      if (accountInfo?.owner.equals(TOKEN_2022_PROGRAM_ID)) {
        accountOwner = TOKEN_2022_PROGRAM_ID;
      } else {
        accountOwner = TOKEN_PROGRAM_ID;
      }
      const decoded = unpackAccount(new PublicKey(ata), accountInfo, accountOwner);

      // Updated wallet tokens
      const updatedWalletTokens = walletTokens.map((token) => {
        if (token.address.toBase58() === tokenAddress) {
          return {
            ...token,
            price: updatedPriceObject.value,
            balance: nativeToUi(decoded.amount.toString(), token.mintDecimals),
          };
        }
        return token;
      });

      set({ walletTokens: updatedWalletTokens });
    } catch (error) {
      console.error("Failed to update wallet token:", error);
    }
  },
});

export { createMrgnlendStore, createPersistentMrgnlendStore };
export type { MrgnlendState };
