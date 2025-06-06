"use client";
import React from "react";
import { useRouter } from "next/router";
import Script from "next/script";

import { WSOL_MINT, LST_MINT } from "@mrgnlabs/mrgn-common";
import { capture, generateEndpoint } from "@mrgnlabs/mrgn-utils";
import { PublicKey } from "@solana/web3.js";
import { SwapResult } from "@jup-ag/common";
import { QuoteResponseMeta } from "@mrgnlabs/mrgn-utils";

import { useWallet } from "~/components/wallet-v2";

type SwapProps = {
  onLoad?: () => void;
  onSuccess?: ({
    txid,
    swapResult,
    quoteResponseMeta,
  }: {
    txid: string;
    swapResult: SwapResult;
    quoteResponseMeta: QuoteResponseMeta | null;
  }) => void;
  initialInputMint?: PublicKey;
  initialOutputMint?: PublicKey;
};

export const Swap = ({ onLoad, onSuccess, initialInputMint, initialOutputMint }: SwapProps) => {
  const { walletContextState } = useWallet();
  const [loadTimestamp, setLoadTimestamp] = React.useState(0);
  const router = useRouter();

  const initialMint = React.useMemo(() => {
    const inputMint = router.query.inputMint;
    let pk: PublicKey | undefined;
    try {
      pk = new PublicKey(inputMint as string);
    } catch (err) {
      pk = undefined;
    }

    if (!pk && initialInputMint) {
      pk = initialInputMint;
    }

    return pk;
  }, [router.query, initialInputMint]);

  const handleOnReady = React.useCallback(() => {
    if (!window.Jupiter) return;

    window.Jupiter.init({
      displayMode: "integrated",
      integratedTargetId: "integrated-terminal",
      endpoint: generateEndpoint(
        process.env.NEXT_PUBLIC_MARGINFI_RPC_ENDPOINT_OVERRIDE as string,
        process.env.NEXT_PUBLIC_RPC_PROXY_KEY as string
      ),
      enableWalletPassthrough: true,
      onSuccess: ({ ...props }) => {
        capture("user_swap", {
          txn: props.txid,
        });
        onSuccess && onSuccess({ ...props } as any);
      },
      formProps: {
        initialInputMint: initialMint ? initialMint.toBase58() : undefined,
        initialOutputMint: initialOutputMint ? initialOutputMint.toBase58() : undefined,
      },
    });
    const currentTime = Date.now();
    const timeElapsed = currentTime - loadTimestamp;
    const delay = Math.max(0, 1000 - timeElapsed);
    setTimeout(() => {
      onLoad && onLoad();
    }, delay);
  }, [initialMint, loadTimestamp, onSuccess, onLoad]);

  React.useEffect(() => {
    if (!window.Jupiter?.syncProps) return;
    window.Jupiter.syncProps({ passthroughWalletContextState: walletContextState });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window.Jupiter, walletContextState]);

  if (loadTimestamp === 0) {
    setLoadTimestamp(Date.now());
  }

  return (
    <Script
      src="https://terminal.jup.ag/main-v2.js"
      onReady={() => {
        handleOnReady();
      }}
    />
  );
};
