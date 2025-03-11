import { PublicKey } from "@solana/web3.js";

import { MarginfiAccountWrapper, MarginfiClient, createMarginfiAccountTx } from "@mrgnlabs/marginfi-client-v2";
import { ActionType, ExtendedBankInfo } from "@mrgnlabs/marginfi-v2-ui-state";
import { SolanaTransaction } from "@mrgnlabs/mrgn-common";
import { ActionProcessingError, isWholePosition, STATIC_SIMULATION_ERRORS } from "@mrgnlabs/mrgn-utils";

export async function generateActionTxns(props: {
  marginfiAccount: MarginfiAccountWrapper | null;
  marginfiClient: MarginfiClient;
  bank: ExtendedBankInfo;
  lendMode: ActionType;
  stakeAccount?: PublicKey;
  amount: number;
}): Promise<{ transactions: SolanaTransaction[]; finalAccount: MarginfiAccountWrapper }> {
  let accountCreationTx: SolanaTransaction | null = null;
  let account: MarginfiAccountWrapper | null = props.marginfiAccount;

  if (!account && props.lendMode === ActionType.Deposit) {
    const { account: newAccount, tx } = await createMarginfiAccountTx({
      marginfiAccount: props.marginfiAccount,
      marginfiClient: props.marginfiClient,
    });
    account = newAccount;
    accountCreationTx = tx;
  }

  if (!account) {
    throw new ActionProcessingError(STATIC_SIMULATION_ERRORS.ACCOUNT_NOT_INITIALIZED);
  }

  switch (props.lendMode) {
    case ActionType.Deposit:
      let depositTx: SolanaTransaction;
      if (account && props.bank.info.rawBank.config.assetTag === 2) {
        if (!props.stakeAccount || !props.bank.meta.stakePool?.validatorVoteAccount) {
          throw new ActionProcessingError(STATIC_SIMULATION_ERRORS.NATIVE_STAKE_NOT_FOUND);
        }

        depositTx = await account.makeDepositStakedTx(
          props.amount,
          props.bank.address,
          props.stakeAccount,
          props.bank.meta.stakePool?.validatorVoteAccount
        );
      } else {
        depositTx = await account.makeDepositTx(props.amount, props.bank.address);
      }
      return {
        transactions: [...(accountCreationTx ? [accountCreationTx] : []), depositTx],
        finalAccount: account,
      };
    case ActionType.Borrow:
      const borrowTxObject = await account.makeBorrowTx(props.amount, props.bank.address, {
        createAtas: true,
        wrapAndUnwrapSol: false,
      });

      return {
        transactions: borrowTxObject.transactions,
        finalAccount: account,
      };
    case ActionType.Withdraw:
      if (props.bank.info.rawBank.config.assetTag === 2) {
        const withdrawTx = await account.makeWithdrawStakedTx(
          props.amount,
          props.bank.address,
          props.bank.isActive && isWholePosition(props.bank, props.amount)
        );
        return {
          transactions: withdrawTx.transactions,
          finalAccount: account,
        };
      } else {
        const withdrawTxObject = await account.makeWithdrawTx(
          props.amount,
          props.bank.address,
          props.bank.isActive && isWholePosition(props.bank, props.amount)
        );

        return {
          transactions: withdrawTxObject.transactions,
          finalAccount: account,
        };
      }
    case ActionType.Repay:
      const repayTx = await account.makeRepayTx(
        props.amount,
        props.bank.address,
        props.bank.isActive && isWholePosition(props.bank, props.amount)
      );
      return {
        transactions: [repayTx],
        finalAccount: account,
      };
    default:
      throw new ActionProcessingError(STATIC_SIMULATION_ERRORS.ACTION_TYPE_CHECK);
  }
}
