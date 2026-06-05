import AppShell from "@/src/components/layout/AppShell";
import BudgetsPage from "@/src/components/budgets/BudgetsPage";

export default function Page() {
  return (
    <AppShell>
      <BudgetsPage />
    </AppShell>
  );
}