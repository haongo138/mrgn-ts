import React from "react";

import { IconInfoCircle } from "@tabler/icons-react";
import { useForm } from "react-hook-form";
import { cn, MAX_SLIPPAGE_PERCENTAGE, slippageOptions, STATIC_SIMULATION_ERRORS } from "@mrgnlabs/mrgn-utils";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import { Label } from "~/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormMessage } from "~/components/ui/form";

type SlippageProps = {
  slippageBps: number;
  setSlippageBps: (value: number) => void;
  toggleSettings: (mode: boolean) => void;
};

const DEFAULT_SLIPPAGE_BPS = 100;

interface SlippageForm {
  slippageBps: number;
}

export const Slippage = ({ slippageBps, setSlippageBps, toggleSettings }: SlippageProps) => {
  const form = useForm<SlippageForm>({
    defaultValues: {
      slippageBps: slippageBps,
    },
  });
  const formWatch = form.watch();

  const isCustomSlippage = React.useMemo(
    () => (slippageOptions.find((value) => value.value === formWatch.slippageBps) ? false : true),
    [formWatch.slippageBps]
  );

  function onSubmit(data: SlippageForm) {
    setSlippageBps(data.slippageBps);
    toggleSettings(false);
  }

  return (
    <div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <h2 className="text-lg font-normal mb-2 flex items-center gap-2">
            Set transaction slippage{" "}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconInfoCircle size={16} />
                </TooltipTrigger>
                <TooltipContent>
                  <div className="space-y-2">
                    <p>Priority fees are paid to the Solana network.</p>
                    <p>This additional fee helps boost how a transaction is prioritized.</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </h2>
          <FormField
            control={form.control}
            name="slippageBps"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormControl>
                  <RadioGroup
                    onValueChange={(value) => {
                      field.onChange(Number(value));
                    }}
                    defaultValue={field.value.toString()}
                    className="flex gap-4 justify-between"
                  >
                    {slippageOptions.map((option) => (
                      <div
                        key={option.label}
                        className={cn(
                          "w-full rounded p-3 border transition-colors hover:bg-accent",
                          field.value === option.value && "bg-accent"
                        )}
                      >
                        <RadioGroupItem
                          value={option.value.toString()}
                          id={option.label.toString()}
                          className="hidden"
                        />
                        <Label
                          className={"flex flex-col gap-2 h-auto cursor-pointer w-full text-center"}
                          htmlFor={option.label.toString()}
                        >
                          {option.label} <strong className="font-medium">{option.value} %</strong>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <h2 className="font-normal">or set manually</h2>

          <FormField
            control={form.control}
            name="slippageBps"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <div className="relative">
                    <Input
                      type="decimal"
                      min={0}
                      value={isCustomSlippage ? field.value : undefined}
                      placeholder={isCustomSlippage ? field.value.toString() : "0"}
                      onChange={(e) => field.onChange(e)}
                      className={cn("h-auto py-3 px-4 border", isCustomSlippage && "bg-accent")}
                    />
                    <span className="absolute inset-y-0 right-3 text-sm flex items-center">%</span>
                  </div>
                </FormControl>
                {field.value > MAX_SLIPPAGE_PERCENTAGE && (
                  <FormMessage className="text-xs px-1">
                    {STATIC_SIMULATION_ERRORS.SLIPPAGE_TOO_HIGH.description}
                  </FormMessage>
                )}
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full py-5">
            Save Settings
          </Button>
        </form>
      </Form>
    </div>
  );
};
