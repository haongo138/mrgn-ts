import React from "react";
import Link from "next/link";
import { v4 as uuidv4 } from "uuid";

import { IconInfoCircle, IconX } from "@tabler/icons-react";

import { numeralFormatter, SolanaTransaction } from "@mrgnlabs/mrgn-common";
import { usdFormatter, usdFormatterDyn } from "@mrgnlabs/mrgn-common";
import { ActionType, ActiveBankInfo } from "@mrgnlabs/marginfi-v2-ui-state";
import { cn, ExecuteActionProps, ExecuteCollectRewardsAction, usePrevious, useConnection } from "@mrgnlabs/mrgn-utils";
import { CustomToastType, toastManager } from "@mrgnlabs/mrgn-toasts";
import { useWallet } from "@mrgnlabs/mrgn-ui";

import { useMrgnlendStore, useUiStore, useUserProfileStore } from "~/store";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { WalletAuthAccounts, WalletButton } from "~/components/wallet-v2";
import { Loader } from "~/components/ui/loader";

import { RewardsDialog } from "./components/rewards";

import { PortfolioAssetCard, PortfolioAssetCardSkeleton, PortfolioUserStats } from "./components";
import { RewardsType } from "./types";
import { useRewardSimulation } from "./hooks";
import { IconLoader } from "~/components/ui/icons";
import { Button } from "~/components/ui/button";

const initialRewardsState: RewardsType = {
  state: "NOT_FETCHED",
  tooltipContent: "Fetching rewards...",
  rewards: [],
  totalRewardAmount: 0,
};

export const LendingPortfolio = () => {
  const { connected } = useWallet();
  const { connection } = useConnection();
  const [walletConnectionDelay, setWalletConnectionDelay] = React.useState(false);
  const [
    isStoreInitialized,
    sortedBanks,
    accountSummary,
    isRefreshingStore,
    marginfiClient,
    selectedAccount,
    marginfiAccounts,
    fetchMrgnlendState,
  ] = useMrgnlendStore((state) => [
    state.initialized,
    state.extendedBankInfos,
    state.accountSummary,
    state.isRefreshingStore,
    state.marginfiClient,
    state.selectedAccount,
    state.marginfiAccounts,
    state.fetchMrgnlendState,
  ]);
  const [priorityFees, broadcastType, accountLabels, setGlobalActionBoxProps, globalActionBoxProps] = useUiStore(
    (state) => [
      state.priorityFees,
      state.broadcastType,
      state.accountLabels,
      state.setGlobalActionBoxProps,
      state.globalActionBoxProps,
    ]
  );
  const [userPointsData] = useUserProfileStore((state) => [state.userPointsData]);

  // Rewards
  const [rewardsState, setRewardsState] = React.useState<RewardsType>(initialRewardsState);
  const [rewardsDialogOpen, setRewardsDialogOpen] = React.useState(false);
  const [actionTxn, setActionTxn] = React.useState<SolanaTransaction | null>(null);
  const [rewardsLoading, setRewardsLoading] = React.useState(false);
  const [rewardsToastOpen, setRewardsToastOpen] = React.useState(false);
  const [rewardsToast, setRewardsToast] = React.useState<CustomToastType | null>(null);
  const hasMultipleAccount = React.useMemo(() => marginfiAccounts.length > 1, [marginfiAccounts]);

  const { handleSimulation } = useRewardSimulation({
    simulationResult: rewardsState,
    marginfiClient,
    selectedAccount,
    extendedBankInfos: sortedBanks,
    setSimulationResult: setRewardsState,
    setErrorMessage: () => {}, // No error handling, should fail silently since it is on page load.
    setActionTxn,
  });

  ////////////////////////////
  // handleSimulation logic //
  ////////////////////////////
  const [shouldFetchRewards, setShouldFetchRewards] = React.useState(true);
  const prevSelectedAccount = usePrevious(selectedAccount);
  React.useEffect(() => {
    if (selectedAccount && prevSelectedAccount?.address.toBase58() !== selectedAccount.address.toBase58()) {
      setShouldFetchRewards(true);
    }
  }, [selectedAccount, prevSelectedAccount]);
  React.useEffect(() => {
    if (selectedAccount && marginfiClient?.banks && shouldFetchRewards) {
      setRewardsState(initialRewardsState);
      handleSimulation();
      setShouldFetchRewards(false);
    }
  }, [handleSimulation, marginfiClient, selectedAccount, shouldFetchRewards]);

  const handleCollectRewardsAction = React.useCallback(async () => {
    if (!marginfiClient || !actionTxn) return;
    const props: ExecuteActionProps = {
      marginfiClient,
      actionTxns: { transactions: [actionTxn] },
      attemptUuid: uuidv4(),
      processOpts: { ...priorityFees, broadcastType },
      txOpts: {},
      callbacks: {
        onComplete: () => {
          setRewardsState(initialRewardsState);
          handleSimulation();
        },
      },
    };

    ExecuteCollectRewardsAction(props);

    setRewardsDialogOpen(false);
  }, [marginfiClient, actionTxn, priorityFees, broadcastType, handleSimulation, setRewardsDialogOpen]);

  const lendingBanks = React.useMemo(
    () =>
      sortedBanks && isStoreInitialized
        ? (sortedBanks.filter((b) => b.isActive && b.position.isLending) as ActiveBankInfo[]).sort(
            (a, b) => b.position.usdValue - a.position.usdValue
          )
        : [],
    [sortedBanks, isStoreInitialized]
  ) as ActiveBankInfo[];

  const borrowingBanks = React.useMemo(
    () =>
      sortedBanks && isStoreInitialized
        ? (sortedBanks.filter((b) => b.isActive && !b.position.isLending) as ActiveBankInfo[]).sort(
            (a, b) => b.position.usdValue - a.position.usdValue
          )
        : [],
    [sortedBanks, isStoreInitialized]
  ) as ActiveBankInfo[];

  const accountSupplied = React.useMemo(
    () =>
      accountSummary
        ? Math.round(accountSummary.lendingAmountUnbiased) > 10000
          ? usdFormatterDyn.format(Math.round(accountSummary.lendingAmountUnbiased))
          : usdFormatter.format(accountSummary.lendingAmountUnbiased)
        : "-",
    [accountSummary]
  );
  const accountBorrowed = React.useMemo(
    () =>
      accountSummary
        ? Math.round(accountSummary.borrowingAmountUnbiased) > 10000
          ? usdFormatterDyn.format(Math.round(accountSummary.borrowingAmountUnbiased))
          : usdFormatter.format(accountSummary.borrowingAmountUnbiased)
        : "-",
    [accountSummary]
  );
  const accountNetValue = React.useMemo(
    () =>
      accountSummary
        ? Math.round(accountSummary.balanceUnbiased) > 10000
          ? usdFormatterDyn.format(Math.round(accountSummary.balanceUnbiased))
          : usdFormatter.format(accountSummary.balanceUnbiased)
        : "-",
    [accountSummary]
  );

  const healthColor = React.useMemo(() => {
    if (accountSummary.healthFactor) {
      let color: string;

      if (accountSummary.healthFactor >= 0.5) {
        color = "#75BA80"; // green color " : "#",
      } else if (accountSummary.healthFactor >= 0.25) {
        color = "#B8B45F"; // yellow color
      } else {
        color = "#CF6F6F"; // red color
      }

      return color;
    } else {
      return "#fff";
    }
  }, [accountSummary.healthFactor]);

  const isLoading = React.useMemo(
    () =>
      (!isStoreInitialized ||
        walletConnectionDelay ||
        isRefreshingStore ||
        (!isStoreInitialized && accountSummary.balance === 0)) &&
      !lendingBanks.length &&
      !borrowingBanks.length,
    [isStoreInitialized, walletConnectionDelay, isRefreshingStore, accountSummary.balance, lendingBanks, borrowingBanks]
  );

  React.useEffect(() => {
    if (rewardsToastOpen || rewardsState.state !== "REWARDS_FETCHED" || rewardsState.totalRewardAmount === 0) return;

    if (rewardsToast) {
      rewardsToast.close();
    }

    const newToast = toastManager.showCustomToast(
      <div className="text-sm space-y-4">
        <p className="md:pr-16">You have rewards available for collection.</p>
        <Button
          size="sm"
          onClick={() => {
            setRewardsDialogOpen(true);
          }}
        >
          Click to collect
        </Button>
      </div>
    );

    console.log("newToast", newToast);
    setRewardsToastOpen(true);

    setRewardsToast(newToast);
  }, [rewardsState, rewardsToastOpen, rewardsToast]);

  // Introduced this useEffect to show the loader for 2 seconds after wallet connection. This is to avoid the flickering of the loader, since the isRefreshingStore isnt set immediately after the wallet connection.
  React.useEffect(() => {
    if (connected) {
      setWalletConnectionDelay(true);
      const timer = setTimeout(() => {
        setWalletConnectionDelay(false);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [connected]);

  if (isStoreInitialized && !connected) {
    return <WalletButton />;
  }

  if (isLoading) {
    return <Loader label={connected ? "Loading portfolio" : "Loading"} />;
  }

  if (isStoreInitialized && connected && !hasMultipleAccount) {
    if (!lendingBanks.length && !borrowingBanks.length) {
      return (
        <div className="flex flex-col items-center justify-center gap-4">
          <p className="text-center mt-4 text-muted-foreground">
            You do not have any open positions.
            <br className="md:hidden" />{" "}
            <Link href="/" className="border-b border-muted-foreground transition-colors hover:border-transparent">
              Explore the pools
            </Link>{" "}
            and make your first deposit
            {hasMultipleAccount && " or select a different account from the dropdown below"}.
          </p>
        </div>
      );
    }
  }

  return (
    <div className="py-4 md:py-6 flex flex-col items-center md:items-start w-full mb-10 gap-2">
      {hasMultipleAccount && (
        <div className="flex w-max justify-center gap-1.5">
          <p className="text-sm text-muted-foreground">Manage accounts:</p>
          <div className="-translate-y-1.5">
            <WalletAuthAccounts
              initialized={true}
              mfiClient={marginfiClient}
              connection={marginfiClient?.provider.connection ?? null}
              marginfiAccounts={marginfiAccounts}
              selectedAccount={selectedAccount}
              fetchMrgnlendState={fetchMrgnlendState}
              closeOnSwitch={true}
              popoverContentAlign="start"
              processOpts={{
                ...priorityFees,
                broadcastType,
              }}
              accountLabels={accountLabels}
            />
          </div>
        </div>
      )}
      <div className="p-4 md:p-6 rounded-xl space-y-3 w-full bg-muted/25">
        <div className="flex justify-between w-full">
          <h2 className="font-medium text-xl">Lend/borrow</h2>

          <div className="flex text-sm items-center gap-1.5">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger className="inline-flex items-center gap-1">
                  {rewardsState.state === "NOT_FETCHED" && (
                    <span className="cursor-default text-muted-foreground flex gap-1 items-center">
                      Calculating rewards <IconLoader size={16} />
                    </span>
                  )}
                  {rewardsState.state === "NO_REWARDS" && (
                    <span className="cursor-default text-muted-foreground">No outstanding rewards</span>
                  )}
                  {rewardsState.state === "REWARDS_FETCHED" && (
                    <button
                      className={cn(
                        rewardsState.totalRewardAmount === 0
                          ? "cursor-default text-muted-foreground"
                          : "cursor-pointer underline hover:text-muted-foreground"
                      )}
                      disabled={rewardsState.totalRewardAmount === 0}
                      onClick={() => {
                        setRewardsDialogOpen(true);
                      }}
                    >
                      Collect rewards
                    </button>
                  )}
                  {rewardsState.state === "EARNING_REWARDS" && (
                    <span className="cursor-default text-muted-foreground">Earning rewards</span>
                  )}
                  {rewardsState.state === "ERROR" && (
                    <span className="cursor-default text-muted-foreground">No outstanding rewards</span>
                  )}
                  {rewardsState.state !== "NOT_FETCHED" && (
                    <IconInfoCircle size={16} className="text-muted-foreground" />
                  )}
                </TooltipTrigger>
                <TooltipContent>
                  <span>{rewardsState.tooltipContent}</span>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <div className="text-muted-foreground">
          <dl className="flex justify-between items-center gap-2">
            <dt className="flex items-center gap-1.5 text-sm">
              Lend/borrow health factor
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconInfoCircle size={16} />
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <div className="flex flex-col gap-2 pb-2">
                      <p>
                        Health factor is based off <b>price biased</b> and <b>weighted</b> asset and liability values.
                      </p>
                      <div className="font-medium">
                        When your account health reaches 0% or below, you are exposed to liquidation.
                      </div>
                      <p>The formula is:</p>
                      <p className="text-sm italic text-center">{"(assets - liabilities) / (assets)"}</p>
                      <p>Your math is:</p>
                      <p className="text-sm italic text-center">{`(${usdFormatter.format(
                        accountSummary.lendingAmountWithBiasAndWeighted
                      )} - ${usdFormatter.format(
                        accountSummary.borrowingAmountWithBiasAndWeighted
                      )}) / (${usdFormatter.format(accountSummary.lendingAmountWithBiasAndWeighted)})`}</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </dt>
            <dd className="text-xl md:text-2xl font-medium" style={{ color: healthColor }}>
              {numeralFormatter(accountSummary.healthFactor * 100)}%
            </dd>
          </dl>
          <div className="h-2 bg-background-gray-light rounded-full">
            <div
              className="h-2 rounded-full"
              style={{
                backgroundColor: healthColor,
                width: `${accountSummary.healthFactor * 100}%`,
              }}
            />
          </div>
          <PortfolioUserStats
            supplied={accountSupplied}
            borrowed={accountBorrowed}
            netValue={accountNetValue}
            points={numeralFormatter(userPointsData.totalPoints)}
          />
        </div>
        <div className="flex flex-col md:flex-row justify-between flex-wrap gap-8 md:gap-20">
          <div className="flex flex-col flex-1 gap-4 md:min-w-[340px]">
            <dl className="flex justify-between items-center gap-2 text-xl font-medium">
              <dt>Supplied</dt>
              <dd className="text-lg">{accountSupplied}</dd>
            </dl>
            {isStoreInitialized ? (
              lendingBanks.length > 0 ? (
                <div className="flex flex-col gap-4">
                  {lendingBanks.map((bank) => (
                    <PortfolioAssetCard
                      key={bank.meta.tokenSymbol}
                      bank={bank}
                      isInLendingMode={true}
                      isBorrower={borrowingBanks.length > 0}
                      accountLabels={accountLabels}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground flex flex-wrap items-center gap-1">
                  <span>No lending positions found.</span>
                  <span
                    className="border-b border-primary/50 transition-colors hover:border-primary cursor-pointer"
                    onClick={() => {
                      setGlobalActionBoxProps({
                        ...globalActionBoxProps,
                        isOpen: true,
                        actionType: ActionType.Deposit,
                      });
                    }}
                  >
                    Search the pools
                  </span>
                  <span>to lend assets.</span>
                </div>
              )
            ) : (
              <PortfolioAssetCardSkeleton />
            )}
          </div>
          <div className="flex flex-wrap flex-col flex-1 gap-4 md:min-w-[340px]">
            <dl className="flex justify-between items-center gap-2 text-xl font-medium">
              <dt>Borrowed</dt>
              <dd className="text-lg">{accountBorrowed}</dd>
            </dl>
            {isStoreInitialized ? (
              borrowingBanks.length > 0 ? (
                <div className="flex flex-col gap-4">
                  {borrowingBanks.map((bank) => (
                    <PortfolioAssetCard
                      key={bank.meta.tokenSymbol}
                      bank={bank}
                      isInLendingMode={false}
                      isBorrower={borrowingBanks.length > 0}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground flex flex-wrap items-center gap-1">
                  <span>No borrow positions found.</span>
                  <span
                    className="border-b border-primary/50 transition-colors hover:border-primary cursor-pointer"
                    onClick={() => {
                      setGlobalActionBoxProps({ ...globalActionBoxProps, isOpen: true, actionType: ActionType.Borrow });
                    }}
                  >
                    Search the pools
                  </span>{" "}
                  <span>and open a new borrow.</span>
                </div>
              )
            ) : (
              <PortfolioAssetCardSkeleton />
            )}
          </div>
        </div>
        <RewardsDialog
          availableRewards={rewardsState}
          onClose={() => {
            setRewardsDialogOpen(false);
          }}
          open={rewardsDialogOpen}
          onOpenChange={(open) => {
            setRewardsDialogOpen(open);
          }}
          onCollect={handleCollectRewardsAction}
          isLoading={rewardsLoading}
        />
      </div>
    </div>
  );
};
