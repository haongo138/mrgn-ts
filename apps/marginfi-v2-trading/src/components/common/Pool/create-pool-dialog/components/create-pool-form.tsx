import React from "react";
import { IconChevronLeft, IconSettings } from "@tabler/icons-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

import { CreatePoolState, PoolData } from "../types";

type CreatePoolFormProps = {
  isTokenFetchingError: boolean;
  poolData: PoolData | null;
  setCreatePoolState: React.Dispatch<React.SetStateAction<CreatePoolState>>;
  reset: () => void;
};

export const CreatePoolForm = ({ isTokenFetchingError, poolData, setCreatePoolState, reset }: CreatePoolFormProps) => {
  if (!poolData) return null;

  if (!poolData.quoteToken) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1 absolute top-2 left-1.5 text-muted-foreground"
        onClick={() => {
          setCreatePoolState(CreatePoolState.TOKEN);
          reset();
        }}
      >
        <IconChevronLeft size={18} /> Back
      </Button>
      <div className="text-center space-y-4 max-w-lg mx-auto pb-2">
        <h2 className="text-3xl font-medium flex flex-col gap-1.5 items-center">
          Confirm Token Pair{" "}
          <div className="flex flex-row items-center gap-2">
            {/* using remote birdeye images for tokens */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={poolData.token.icon} alt={poolData.token.symbol} className="w-10 h-10 rounded-full " />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={poolData.quoteToken.icon}
              alt={poolData.quoteToken.symbol}
              className="w-10 h-10 rounded-full ml-[-20px]"
            />
            {`${poolData.token.symbol.trim()}/${poolData.quoteToken.symbol.trim()}`}
          </div>
        </h2>

        <p className="text-muted-foreground">
          {isTokenFetchingError
            ? "Please provide details about the token."
            : "Please review and confirm the token details."}
        </p>
      </div>

      <div className="space-y-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div className="space-y-4 text-xs">
            <h4 className="text-sm font-medium">Base Token details</h4>
            <div className="space-y-1">
              <Label className="font-medium text-xs">Token name</Label>
              <Input value={poolData.token.name} disabled={true} />
            </div>
            <div className="space-y-1">
              <Label className="font-medium text-xs">Mint address</Label>
              <Input value={poolData.token.mint.toBase58()} disabled={true} />
            </div>
            <div className="flex w-full gap-2">
              <div className="space-y-1 flex-1">
                <Label className="font-medium text-xs">Token symbol</Label>
                <Input value={poolData.token.symbol} disabled={true} />
              </div>
              <div className="space-y-1 flex-1">
                <Label className="font-medium text-xs">Token decimals</Label>
                <Input type="number" value={poolData.token.decimals} disabled={true} />
              </div>
            </div>
          </div>
          <div className="space-y-4 text-xs">
            <h4 className="text-sm font-medium">Quote token details</h4>
            <div className="space-y-1">
              <Label className="font-medium text-xs">Token name</Label>
              <Input value={poolData.quoteToken.name} disabled={true} />
            </div>
            <div className="space-y-1">
              <Label className="font-medium text-xs">Mint address</Label>
              <Input value={poolData.quoteToken.mint.toBase58()} disabled={true} />
            </div>
            <div className="flex w-full gap-2">
              <div className="space-y-1 flex-1">
                <Label className="font-medium text-xs">Token symbol</Label>
                <Input value={poolData.quoteToken.symbol} disabled={true} />
              </div>
              <div className="space-y-1 flex-1">
                <Label className="font-medium text-xs">Token decimals</Label>
                <Input type="number" value={poolData.quoteToken.decimals} disabled={true} />
              </div>
            </div>
          </div>
        </div>
        <Button
          className="flex justify-center items-center px-8 mx-auto"
          type="button"
          onClick={() => {
            setCreatePoolState(CreatePoolState.CONFIGURE);
          }}
        >
          <IconSettings size={18} />
          Configure Pool Settings
        </Button>
      </div>
    </>
  );
};
