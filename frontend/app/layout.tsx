import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/src/components/auth/AuthProvider";
import { RealtimeProvider } from "@/src/components/realtime/RealtimeProvider";
import { OnboardingProvider } from "@/src/components/onboarding/OnboardingProvider";
import { ToastProvider } from "@/src/components/ui/ToastProvider";
import ServiceWorkerRegistration from "@/src/components/pwa/ServiceWorkerRegistration";
import InstallPrompt from "@/src/components/pwa/InstallPrompt";
import WebVitalsReporter from "@/src/components/performance/WebVitalsReporter";

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
  description: "Quáº£n lÃ½ tÃ i chÃ­nh cÃ¡ nhÃ¢n thÃ´ng minh vá»›i AI",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MyFinance",
  },
  // No explicit `icons.apple` here: app/apple-icon.tsx (Next.js file
  // convention) generates the apple-touch-icon PNG and its <link> tag
  // automatically. Declaring both would produce two conflicting
  // apple-touch-icon tags.
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" data-scroll-behavior="smooth">
      <head>
        {/* Inline critical CSS: guarantees the app's background paints
            immediately, even on a slow connection where the compiled
            Tailwind stylesheet hasn't finished downloading yet. Without
            this, the browser's default white canvas shows until that
            external stylesheet loads — the "white screen" real iPhone
            users were seeing was this pre-CSS window, not a React/auth
            delay (the app-shell skeleton below already renders during the
            auth window, but only once styles are present to make it look
            like anything). Matches globals.css's --background exactly. */}
        <style>{"html,body{background:#f8fafc}"}</style>
      </head>
      <body className={beVietnam.variable}>
        <WebVitalsReporter />
        <AuthProvider>
          <RealtimeProvider>
            <ToastProvider>
              <OnboardingProvider>{children}</OnboardingProvider>
            </ToastProvider>
          </RealtimeProvider>
          <ServiceWorkerRegistration />
          <InstallPrompt />
        </AuthProvider>
      </body>
    </html>
  );
}
