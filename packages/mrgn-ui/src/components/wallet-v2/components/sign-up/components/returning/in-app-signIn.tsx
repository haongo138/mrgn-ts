import React from "react";

import { AuthScreenProps } from "~/components/wallet-v2/components/sign-up/sign-up.utils";
import { useBrowser } from "@mrgnlabs/mrgn-utils";
import { useWallet } from "~/components/wallet-v2";
import { OnboardHeader, ScreenWrapper, WalletSeperator } from "~/components/wallet-v2/components/sign-up/components";
import { IconBackpackWallet, IconLoader, IconPhantomWallet, IconSolflareWallet } from "~/components/ui/icons";
import { Button } from "~/components/ui/button";

interface props extends AuthScreenProps {}

const appId = process.env.NEXT_PUBLIC_APP_ID === "marginfi-v2-ui" ? "marginfi" : "arena";

export const InAppSignIn = ({ isLoading, select, update, onClose }: props) => {
  const { connected } = useWallet();
  const browser = useBrowser();

  const inAppWallet = React.useMemo(() => {
    if (browser === "Phantom") {
      return {
        icon: <IconPhantomWallet size={24} />,
        description: "Sign in with Phantom",
        connect: () => select("Phantom" as any),
      };
    } else if (browser === "Backpack") {
      return {
        icon: <IconBackpackWallet size={24} />,
        description: "Sign in with Backpack",
        connect: () => select("Backpack" as any),
      };
    } else if (browser === "Solflare") {
      return {
        icon: <IconSolflareWallet size={24} />,
        description: "Sign in with Solflare",
        connect: () => select("Solflare" as any),
      };
    }
  }, [select, browser]);

  React.useEffect(() => {
    if (connected) {
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  if (!inAppWallet) {
    return <></>;
  }

  return (
    <div className="pt-6 font-normal">
      <OnboardHeader
        title={appId === "marginfi" ? "Sign in to marginfi" : "Enter The Arena"}
        description={appId === "marginfi" ? "Earn yield, permissionlessly." : "Memecoin trading, with leverage."}
      />
      <ScreenWrapper>
        <Button
          variant={appId === "arena" ? "outline" : "default"}
          size="lg"
          className="mt-2 text-lg font-medium h-12"
          disabled={isLoading}
          onClick={inAppWallet.connect}
        >
          {isLoading ? <IconLoader /> : inAppWallet.icon} {inAppWallet.description}
        </Button>
        <WalletSeperator description={"more sign in options"} onClick={() => update("RETURNING_USER")} />
      </ScreenWrapper>
    </div>
  );
};
