import { Suspense } from "react";
import AppShell from "@/src/components/layout/AppShell";
import GoalsPage from "@/src/components/goals/GoalsPage";

export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <GoalsPage />
      </Suspense>
    </AppShell>
  );
}
