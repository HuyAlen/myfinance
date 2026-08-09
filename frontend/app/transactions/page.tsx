import { Suspense } from "react";
import AppShell from "@/src/components/layout/AppShell";
import TransactionsPage from "@/src/components/transactions/TransactionsPage";

export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <TransactionsPage />
      </Suspense>
    </AppShell>
  );
}
