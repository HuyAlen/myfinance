import { Suspense } from "react";
import AppShell from "@/src/components/layout/AppShell";
import DebtsPage from "@/src/components/debts/DebtsPage";

export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <DebtsPage />
      </Suspense>
    </AppShell>
  );
}
