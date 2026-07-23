import type { ForexAccount } from "@/src/types/finance";
import {
  addForexAccount,
  deleteForexAccount,
  getForexAccounts,
  updateForexAccount,
} from "@/src/services/finance/financeStorage";

export type ForexAccountMutationResult = { error: string | null };

export const forexAccountRepository = {
  list(): Promise<ForexAccount[]> {
    return getForexAccounts();
  },
  create(account: ForexAccount): Promise<ForexAccountMutationResult> {
    return addForexAccount(account);
  },
  update(account: ForexAccount): Promise<ForexAccountMutationResult> {
    return updateForexAccount(account);
  },
  remove(id: string): Promise<ForexAccountMutationResult> {
    return deleteForexAccount(id);
  },
};
