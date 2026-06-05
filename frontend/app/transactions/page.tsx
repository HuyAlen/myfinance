import AppShell from "@/src/components/layout/AppShell";
import TransactionsPage from "@/src/components/transactions/TransactionsPage";

export default function Page() {
  return (
    <AppShell>
      <TransactionsPage />
    </AppShell>
  );
}