import React from "react";
import { v4 as uuidv4 } from "uuid";
import BigNumber from "bignumber.js";

import {
  ExtendedBankInfo,
  ActionType,
  AccountSummary,
  computeAccountSummary,
  DEFAULT_ACCOUNT_SUMMARY,
} from "@mrgnlabs/marginfi-v2-ui-state";
import { MarginfiAccountWrapper, MarginfiClient } from "@mrgnlabs/marginfi-client-v2";
import {
  ActionMessageType,
  checkLoopActionAvailable,
  usePrevious,
  ExecuteLoopActionProps,
  executeLoopAction,
  logActivity,
} from "@mrgnlabs/mrgn-utils";
import { dynamicNumeralFormatter } from "@mrgnlabs/mrgn-common";

import { useAmountDebounce } from "~/hooks/useAmountDebounce";
import { ActionBoxContentWrapper, ActionButton, ActionSettingsButton } from "~/components/action-box-v2/components";
import { useActionAmounts } from "~/components/action-box-v2/hooks";
import { ActionMessage } from "~/components";

import { SimulationStatus } from "../../utils/simulation.utils";
import { ActionSimulationStatus } from "../../components";
import { useActionContext } from "../../contexts";

import { ActionInput, Preview } from "./components";
import { useLoopBoxStore } from "./store";
import { useLoopSimulation } from "./hooks";
import { LeverageSlider } from "./components/leverage-slider";
import { ApyStat } from "./components/apy-stat";

export type LoopBoxProps = {
  nativeSolBalance: number;
  connected: boolean;
  marginfiClient: MarginfiClient | null;
  selectedAccount: MarginfiAccountWrapper | null;
  banks: ExtendedBankInfo[];
  requestedBank?: ExtendedBankInfo;
  accountSummaryArg?: AccountSummary;
  allBanks?: ExtendedBankInfo[];
  isDialog?: boolean;
  initialAmount?: number;

  onComplete?: () => void;
  captureEvent?: (event: string, properties?: Record<string, any>) => void;
  setDisplaySettings?: (displaySettings: boolean) => void;
};

export const LoopBox = ({
  nativeSolBalance,
  connected,
  banks,
  marginfiClient,
  selectedAccount,
  accountSummaryArg,
  requestedBank,
  allBanks,
  isDialog,
  onComplete,
  captureEvent,
  setDisplaySettings,
  initialAmount,
}: LoopBoxProps) => {
  const [
    leverage,
    maxLeverage,
    amountRaw,
    selectedBank,
    selectedSecondaryBank,
    errorMessage,
    simulationResult,
    actionTxns,
    depositLstApy,
    borrowLstApy,
    refreshState,
    setSimulationResult,
    setActionTxns,
    setErrorMessage,
    fetchActionBoxState,
    setAmountRaw,
    setSelectedBank,
    setSelectedSecondaryBank,
    setMaxLeverage,
    setLeverage,
    refreshSelectedBanks,
  ] = useLoopBoxStore((state) => [
    state.leverage,
    state.maxLeverage,
    state.amountRaw,
    state.selectedBank,
    state.selectedSecondaryBank,
    state.errorMessage,
    state.simulationResult,
    state.actionTxns,
    state.depositLstApy,
    state.borrowLstApy,
    state.refreshState,
    state.setSimulationResult,
    state.setActionTxns,
    state.setErrorMessage,
    state.fetchActionBoxState,
    state.setAmountRaw,
    state.setSelectedBank,
    state.setSelectedSecondaryBank,
    state.setMaxLeverage,
    state.setLeverage,
    state.refreshSelectedBanks,
  ]);

  const { transactionSettings, priorityFees, jupiterOptions } = useActionContext() || {
    transactionSettings: null,
    priorityFees: null,
    jupiterOptions: null,
  };

  const [simulationStatus, setSimulationStatus] = React.useState<{
    isLoading: boolean;
    status: SimulationStatus;
  }>({
    isLoading: false,
    status: SimulationStatus.IDLE,
  });

  React.useEffect(() => {
    return () => {
      refreshState();
    };
  }, [refreshState]);

  const accountSummary = React.useMemo(() => {
    return (
      accountSummaryArg ?? (selectedAccount ? computeAccountSummary(selectedAccount, banks) : DEFAULT_ACCOUNT_SUMMARY)
    );
  }, [accountSummaryArg, selectedAccount, banks]);

  const { amount, debouncedAmount, walletAmount, maxAmount } = useActionAmounts({
    amountRaw,
    selectedBank,
    nativeSolBalance,
    actionMode: ActionType.Loop,
  });

  const debouncedLeverage = useAmountDebounce<number | null>(leverage, 1000);

  const [additionalActionMessages, setAdditionalActionMessages] = React.useState<ActionMessageType[]>([]);
  const [quoteActionMessage, setQuoteActionMessage] = React.useState<ActionMessageType[]>([]);

  const actionMessages = React.useMemo(() => {
    return checkLoopActionAvailable({
      amount,
      connected,
      selectedBank,
      selectedSecondaryBank,
      actionQuote: actionTxns.actionQuote,
      banks: allBanks ?? [],
    });
  }, [amount, connected, selectedBank, selectedSecondaryBank, actionTxns.actionQuote, allBanks]);

  const { actionSummary, refreshSimulation } = useLoopSimulation({
    debouncedAmount: debouncedAmount ?? 0,
    debouncedLeverage: debouncedLeverage ?? 0,
    selectedAccount,
    marginfiClient,
    accountSummary,
    selectedBank,
    selectedSecondaryBank,
    actionTxns,
    simulationResult,
    jupiterOptions,
    setMaxLeverage,
    setSimulationResult,
    setActionTxns,
    setErrorMessage,
    setIsLoading: setSimulationStatus,
    actionMessages: actionMessages,
  });

  // Cleanup the store when the wallet disconnects
  React.useEffect(() => {
    if (debouncedAmount === 0 && simulationResult) {
      setActionTxns({
        transactions: [],
        actionQuote: null,
        actualDepositAmount: 0,
        borrowAmount: new BigNumber(0),
      });
      setSimulationResult(null);
    }
  }, [simulationResult, debouncedAmount, setActionTxns, setSimulationResult]);

  React.useEffect(() => {
    if (!connected) {
      refreshState();
    }
  }, [refreshState, connected]);

  React.useEffect(() => {
    fetchActionBoxState({ requestedBank });
  }, [requestedBank, fetchActionBoxState]);

  React.useEffect(() => {
    if (initialAmount !== undefined) {
      const finalAmount = Math.min(initialAmount, maxAmount);
      setAmountRaw(finalAmount.toString());
    }
  }, [initialAmount, setAmountRaw, maxAmount]);

  React.useEffect(() => {
    if (errorMessage?.description) {
      setAdditionalActionMessages((prevMessages) => [...prevMessages, errorMessage]);
    } else {
      setAdditionalActionMessages([]);
    }
  }, [errorMessage]);

  React.useEffect(() => {
    if (!actionTxns.actionQuote) {
      setQuoteActionMessage([{ isEnabled: false }]);
    } else {
      setQuoteActionMessage([]);
    }
  }, [actionTxns.actionQuote]);
  /*
  Cleaing additional action messages when the bank or amount changes. This is to prevent outdated errors from being displayed.
  */
  const prevSelectedBank = usePrevious(selectedBank);
  const prevSecondaryBank = usePrevious(selectedSecondaryBank);
  const prevAmount = usePrevious(amount);

  React.useEffect(() => {
    if (
      prevSelectedBank &&
      prevSecondaryBank &&
      prevAmount &&
      (prevSelectedBank.meta.tokenSymbol !== selectedBank?.meta.tokenSymbol ||
        prevSecondaryBank.meta.tokenSymbol !== selectedSecondaryBank?.meta.tokenSymbol ||
        prevAmount !== amount)
    ) {
      setAdditionalActionMessages([]);
      setErrorMessage(null);
    }
  }, [prevSelectedBank, prevSecondaryBank, prevAmount, selectedBank, selectedSecondaryBank, amount, setErrorMessage]);

  /////////////////////
  // Looping Actions //
  /////////////////////
  const handleLoopAction = React.useCallback(async () => {
    if (!selectedBank || !amount || !marginfiClient || !selectedSecondaryBank || !transactionSettings) {
      return;
    }

    const params: ExecuteLoopActionProps = {
      actionTxns,
      attemptUuid: uuidv4(),
      marginfiClient,
      processOpts: { ...priorityFees, broadcastType: transactionSettings.broadcastType },
      txOpts: {},
      callbacks: {
        captureEvent: captureEvent,
        onComplete: (txnSig: string) => {
          onComplete?.();
          // Log the activity
          const activityDetails: Record<string, any> = {
            amount: amount,
            symbol: selectedBank.meta.tokenSymbol,
            mint: selectedBank.info.rawBank.mint.toBase58(),
            secondaryAmount: actionTxns.borrowAmount.toNumber(),
            secondarySymbol: selectedSecondaryBank.meta.tokenSymbol,
            secondaryMint: selectedSecondaryBank.info.rawBank.mint.toBase58(),
          };

          logActivity(ActionType.Loop, txnSig, activityDetails, selectedAccount?.address).catch((error) => {
            console.error("Failed to log activity:", error);
          });
        },
      },
      infoProps: {
        depositAmount: dynamicNumeralFormatter(amount),
        depositToken: selectedBank.meta.tokenSymbol,
        borrowAmount: dynamicNumeralFormatter(actionTxns.borrowAmount.toNumber()),
        borrowToken: selectedSecondaryBank.meta.tokenSymbol,
      },
      nativeSolBalance: nativeSolBalance,
    };

    executeLoopAction(params);

    setAmountRaw("");
  }, [
    actionTxns,
    amount,
    captureEvent,
    marginfiClient,
    priorityFees,
    selectedBank,
    selectedSecondaryBank,
    setAmountRaw,
    transactionSettings,
    nativeSolBalance,
    onComplete,
    selectedAccount,
  ]);

  React.useEffect(() => {
    if (marginfiClient) {
      refreshSelectedBanks(banks);
    }
  }, [marginfiClient, banks, refreshSelectedBanks]);

  return (
    <ActionBoxContentWrapper>
      {/* {actionTxns.lastValidBlockHeight && blockProgress !== 0 && (
        <div className="absolute top-0 right-4 z-50">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <CircularProgress
                  size={18}
                  strokeWidth={3}
                  value={blockProgress * 100}
                  strokeColor="stroke-mfi-action-box-accent-foreground/50"
                  backgroundColor="stroke-mfi-action-box-background-dark"
                />
              </TooltipTrigger>
              <TooltipContent side="left">
                <div className="space-y-2">
                  <p>Your transaction is ready for execution.</p>
                  <p>Once the spinner reaches 100%, if not processed, it will refresh to fetch updated quotes.</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )} */}
      <div className="mb-6">
        <ActionInput
          banks={banks}
          nativeSolBalance={nativeSolBalance}
          amount={amount}
          amountRaw={amountRaw}
          maxAmount={maxAmount}
          selectedBank={selectedBank}
          selectedSecondaryBank={selectedSecondaryBank}
          setAmountRaw={setAmountRaw}
          setSelectedBank={setSelectedBank}
          setSelectedSecondaryBank={(bank) => {
            setSelectedSecondaryBank(bank);
          }}
          isLoading={simulationStatus.isLoading}
          walletAmount={walletAmount}
          actionTxns={actionTxns}
        />
      </div>

      <div className="px-1 space-y-6 mb-4">
        <LeverageSlider
          selectedBank={selectedBank}
          selectedSecondaryBank={selectedSecondaryBank}
          amountRaw={amountRaw}
          leverageAmount={leverage}
          maxLeverage={maxLeverage}
          setLeverageAmount={setLeverage}
        />

        <ApyStat
          selectedBank={selectedBank}
          selectedSecondaryBank={selectedSecondaryBank}
          leverageAmount={leverage}
          depositLstApy={depositLstApy}
          borrowLstApy={borrowLstApy}
        />
      </div>
      {additionalActionMessages
        .concat(actionMessages)
        .concat(quoteActionMessage)
        .map(
          (actionMessage, idx) =>
            actionMessage.description && (
              <div className="pb-6" key={idx}>
                <ActionMessage
                  _actionMessage={actionMessage}
                  retry={refreshSimulation}
                  isRetrying={simulationStatus.isLoading}
                />
              </div>
            )
        )}

      <div className="mb-3 space-y-2">
        <ActionButton
          isLoading={simulationStatus.isLoading}
          isEnabled={
            !additionalActionMessages
              .concat(actionMessages)
              .concat(quoteActionMessage)
              .filter((value) => value.isEnabled === false).length && actionTxns?.transactions.length > 0
          }
          connected={connected}
          handleAction={() => {
            handleLoopAction();
          }}
          loaderType="INFINITE"
          buttonLabel={"Loop"}
        />
      </div>

      <div className="flex items-center justify-between">
        <ActionSimulationStatus
          simulationStatus={simulationStatus.status}
          hasErrorMessages={additionalActionMessages.length > 0}
          isActive={selectedBank && amount > 0 ? true : false}
          spinnerType="loop"
        />
        {setDisplaySettings && <ActionSettingsButton onClick={() => setDisplaySettings(true)} />}
      </div>

      <Preview actionSummary={actionSummary} selectedBank={selectedBank} isLoading={simulationStatus.isLoading} />
    </ActionBoxContentWrapper>
  );
};
