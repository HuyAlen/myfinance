import type { Investment } from "@/src/types/finance";
import {
  addInvestment,
  deleteInvestment,
  getInvestments,
  updateInvestment,
} from "@/src/services/finance/financeStorage";

export type InvestmentMutationResult = { error: string | null };

export const investmentRepository = {
  list(): Promise<Investment[]> {
    return getInvestments();
  },
  create(investment: Investment): Promise<InvestmentMutationResult> {
    return addInvestment(investment);
  },
  update(investment: Investment): Promise<InvestmentMutationResult> {
    return updateInvestment(investment);
  },
  remove(id: string): Promise<InvestmentMutationResult> {
    return deleteInvestment(id);
  },
};
