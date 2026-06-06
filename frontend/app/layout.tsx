import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/src/components/auth/AuthProvider";
import { RealtimeProvider } from "@/src/components/realtime/RealtimeProvider";
import { OnboardingProvider } from "@/src/components/onboarding/OnboardingProvider";
import ServiceWorkerRegistration from "@/src/components/pwa/ServiceWorkerRegistration";
import InstallPrompt from "@/src/components/pwa/InstallPrompt";

const beVietnam = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-be-vietnam",
});

export const viewport: Viewport = {
  themeColor: "#2563eb",
};

export const metadata: Metadata = {
  title: "MyFinance",
  description: "Quản lý tài chính cá nhân thông minh với AI",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MyFinance",
  },
  icons: {
    apple: "/icon-192.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className={beVietnam.variable}>
        <AuthProvider>
          <RealtimeProvider>
            <OnboardingProvider>{children}</OnboardingProvider>
          </RealtimeProvider>
          <ServiceWorkerRegistration />
          <InstallPrompt />
        </AuthProvider>
      </body>
    </html>
  );
}
