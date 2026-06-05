import AppShell from "@/src/components/layout/AppShell";
import DashboardPage from "@/src/components/dashboard/DashboardPage";

export default function Home() {
  return (
    <AppShell>
      <DashboardPage />
    </AppShell>
  );
}