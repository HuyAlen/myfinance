import AppShell from "@/src/components/layout/AppShell";
import HelpPage from "@/src/components/help/HelpPage";

export const metadata = {
  title: "Hướng Dẫn | MyFinance",
  description: "Trung tâm hướng dẫn và onboarding cho MyFinance",
};

export default function HelpRoute() {
  return (
    <AppShell>
      <HelpPage />
    </AppShell>
  );
}
