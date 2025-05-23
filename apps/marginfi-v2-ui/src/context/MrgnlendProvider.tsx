import React from "react";
import { useRouter } from "next/router";

import { getTransactionStrategy, identify } from "@mrgnlabs/mrgn-utils";
import { useWallet } from "@mrgnlabs/mrgn-ui";

import config from "~/config/marginfi";
import { useMrgnlendStore, useUiStore } from "~/store";
import { useConnection } from "~/hooks/use-connection";

// @ts-ignore - Safe because context hook checks for null
const MrgnlendContext = React.createContext<>();

export const MrgnlendProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const router = useRouter();
  const debounceId = React.useRef<NodeJS.Timeout | null>(null);
  const { wallet, isOverride, connected } = useWallet();
  const { connection } = useConnection();
  const [fetchMrgnlendState, setIsRefreshingStore, resetUserData, marginfiAccounts] = useMrgnlendStore((state) => [
    state.fetchMrgnlendState,
    state.setIsRefreshingStore,
    state.resetUserData,

    state.marginfiAccounts,
  ]);
  const [fetchPriorityFee, fetchAccountLabels] = useUiStore((state) => [
    state.fetchPriorityFee,
    state.fetchAccountLabels,
    state.accountLabels,
  ]);

  const [hasFetchedAccountLabels, setHasFetchedAccountLabels] = React.useState(false);

  // identify user if logged in
  React.useEffect(() => {
    const walletAddress = wallet.publicKey?.toBase58();
    if (!walletAddress) return;
    identify(walletAddress, {
      wallet: walletAddress,
    });
  }, [wallet.publicKey]);

  // if account set in query param then store inn local storage and remove from url
  React.useEffect(() => {
    const { account } = router.query;
    if (!account) return;

    const prevMfiAccount = localStorage.getItem("mfiAccount");
    if (prevMfiAccount === account) return;

    localStorage.setItem("mfiAccount", account as string);
    router.replace(router.pathname, undefined, { shallow: true });
    fetchMrgnlendState();
  }, [router.query]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    const initializeAndFetch = () => {
      setIsRefreshingStore(true);
      fetchPriorityFee(connection);
      fetchMrgnlendState({
        marginfiConfig: config.mfiConfig,
        stageTokens: process.env.NEXT_PUBLIC_STAGE_TOKENS
          ? JSON.parse(process.env.NEXT_PUBLIC_STAGE_TOKENS)
          : undefined,
        connection,
        wallet,
        isOverride,
        processTransactionStrategy: getTransactionStrategy(),
      }).catch(console.error);
    };

    const periodicFetch = () => {
      console.log("🔄 Periodically fetching marginfi state");
      setIsRefreshingStore(true);
      fetchPriorityFee(connection);
      fetchMrgnlendState().catch(console.error);
    };

    if (debounceId.current) {
      clearTimeout(debounceId.current);
    }

    debounceId.current = setTimeout(initializeAndFetch, 1000);

    // Periodic updates without needing full configuration
    const intervalId = setInterval(periodicFetch, 30_000);

    return () => {
      if (debounceId.current) {
        clearTimeout(debounceId.current);
      }
      clearInterval(intervalId);
    };
  }, [wallet, isOverride]); // eslint-disable-line react-hooks/exhaustive-deps
  // ^ crucial to omit both `connection` and `fetchMrgnlendState` from the dependency array
  // TODO: fix...

  React.useEffect(() => {
    if (!connected) {
      resetUserData();
    }
  }, [connected, resetUserData]);

  // Fetch account labels
  React.useEffect(() => {
    if (marginfiAccounts.length > 0 && !hasFetchedAccountLabels) {
      setHasFetchedAccountLabels(true);
      fetchAccountLabels(marginfiAccounts);
    }
  }, [marginfiAccounts, fetchAccountLabels, hasFetchedAccountLabels]);

  return <MrgnlendContext.Provider value={{}}>{children}</MrgnlendContext.Provider>;
};
