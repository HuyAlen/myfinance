import AppShell from "@/src/components/layout/AppShell";
import SettingsPage from "@/src/components/settings/SettingsPage";

export default function Page() {
  return (
    <AppShell>
      <SettingsPage />
    </AppShell>
  );
}