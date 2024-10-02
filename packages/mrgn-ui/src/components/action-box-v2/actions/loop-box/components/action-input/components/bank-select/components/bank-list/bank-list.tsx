import React from "react";

import { ExtendedBankInfo } from "@mrgnlabs/marginfi-v2-ui-state";
import { cn, computeBankRate, LendingModes } from "@mrgnlabs/mrgn-utils";

import { CommandEmpty, CommandGroup, CommandItem } from "~/components/ui/command";

import { BankItem, BankListCommand } from "~/components/action-box-v2/components";
import { MarginRequirementType, OperationalState } from "@mrgnlabs/marginfi-client-v2";
import { WSOL_MINT } from "@mrgnlabs/mrgn-common";

type BankListProps = {
  selectedBank: ExtendedBankInfo | null;
  banks: ExtendedBankInfo[];
  nativeSolBalance: number;
  isOpen: boolean;

  onSetSelectedBank: (selectedTokenBank: ExtendedBankInfo | null) => void;
  onClose: () => void;
};

export const BankList = ({
  selectedBank,
  banks,
  nativeSolBalance,
  isOpen,

  onSetSelectedBank,
  onClose,
}: BankListProps) => {
  const [searchQuery, setSearchQuery] = React.useState("");

  const calculateRate = React.useCallback((bank: ExtendedBankInfo) => {
    return computeBankRate(bank, LendingModes.BORROW);
  }, []);

  const loopingBanks = React.useMemo(() => {
    return banks.filter((bank) => {
      const isIsolated = bank.info.state.isIsolated;
      const isReduceOnly = bank.info.rawBank.config.operationalState === OperationalState.ReduceOnly;
      const isBeingRetired =
        bank.info.rawBank.getAssetWeight(MarginRequirementType.Initial, bank.info.oraclePrice, true).eq(0) &&
        bank.info.rawBank.getAssetWeight(MarginRequirementType.Maintenance, bank.info.oraclePrice).gt(0);
      const containsSearchQuery = searchQuery
        ? bank.meta.tokenSymbol.toLowerCase().includes(searchQuery.toLowerCase())
        : true;

      return !isIsolated && !isReduceOnly && !isBeingRetired && containsSearchQuery;
    });
  }, [banks, searchQuery]);

  React.useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
    }
  }, [isOpen]);

  return (
    <>
      <BankListCommand selectedBank={selectedBank} onClose={onClose} onSetSearchQuery={setSearchQuery}>
        <CommandEmpty>No tokens found.</CommandEmpty>

        {loopingBanks.map((bank, index) => {
          return (
            <CommandItem
              key={index}
              value={bank.address?.toString().toLowerCase()}
              onSelect={(currentValue) => {
                onSetSelectedBank(
                  banks.find((bankInfo) => bankInfo.address.toString().toLowerCase() === currentValue) ?? null
                );
                onClose();
              }}
              className={cn(
                "cursor-pointer font-medium flex items-center justify-between gap-2 data-[selected=true]:bg-background-gray-light data-[selected=true]:text-white py-2",
                "opacity-100"
              )}
            >
              <BankItem
                rate={calculateRate(bank)}
                lendingMode={LendingModes.BORROW}
                bank={bank}
                showBalanceOverride={
                  bank.info.state.mint.equals(WSOL_MINT) ? nativeSolBalance > 0 : bank.userInfo.tokenAccount.balance > 0
                }
                nativeSolBalance={nativeSolBalance}
              />
            </CommandItem>
          );
        })}
      </BankListCommand>
    </>
  );
};
