import { Suspense } from "react";
import AppShell from "@/src/components/layout/AppShell";
import BudgetsPage from "@/src/components/budgets/BudgetsPage";

export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <BudgetsPage />
      </Suspense>
    </AppShell>
  );
}
