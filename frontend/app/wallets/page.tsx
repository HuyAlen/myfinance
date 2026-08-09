import { Suspense } from "react";
import AppShell from "@/src/components/layout/AppShell";
import WalletsPage from "@/src/components/wallets/WalletsPage";

export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <WalletsPage />
      </Suspense>
    </AppShell>
  );
}
