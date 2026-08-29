import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/src/components/auth/AuthProvider";
import { HouseholdProvider } from "@/src/components/household/HouseholdProvider";
import { RealtimeProvider } from "@/src/components/realtime/RealtimeProvider";
import { OnboardingProvider } from "@/src/components/onboarding/OnboardingProvider";
import { ToastProvider } from "@/src/components/ui/ToastProvider";
import ServiceWorkerRegistration from "@/src/components/pwa/ServiceWorkerRegistration";
import InstallPrompt from "@/src/components/pwa/InstallPrompt";
import WebVitalsReporter from "@/src/components/performance/WebVitalsReporter";
import ThemeProvider from "@/src/components/theme/ThemeProvider";

const beVietnam = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-be-vietnam",
});

const THEME_BOOTSTRAP_SCRIPT = String.raw`
  (() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    let preference = "system";
    try {
      const stored = window.localStorage.getItem("myfinance-theme-preference");
      if (stored === "light" || stored === "dark" || stored === "system") {
        preference = stored;
      }
    } catch {}
    const resolved =
      preference === "dark" || (preference === "system" && media.matches)
        ? "dark"
        : "light";
    root.dataset.theme = resolved;
    root.dataset.themePreference = preference;
    root.style.colorScheme = resolved;
  })();
`;

export const viewport: Viewport = {
  themeColor: "#edf3f8",
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
    <html lang="vi" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {/* React 19 / Next.js-safe theme bootstrap. `beforeInteractive` keeps
            the saved/system theme decision ahead of hydration so the app
            does not flash the light palette before ThemeProvider mounts. */}
        <Script
          id="myfinance-theme-bootstrap"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }}
        />
        <meta name="color-scheme" content="light dark" />
        {/* Inline critical CSS: guarantees the app's background paints
            immediately, even on a slow connection where the compiled
            Tailwind stylesheet hasn't finished downloading yet. Without
            this, the browser's default white canvas shows until that
            external stylesheet loads — the "white screen" real iPhone
            users were seeing was this pre-CSS window, not a React/auth
            delay (the app-shell skeleton below already renders during the
            auth window, but only once styles are present to make it look
            like anything). Matches globals.css's --background exactly. */}
        <style>{'html,body{background:#edf3f8}html[data-theme="dark"],html[data-theme="dark"] body{background:#0f1720;color:#e7eef5}'}</style>
      </head>
      <body className={beVietnam.variable}>
        <ThemeProvider>
        <WebVitalsReporter />
        <AuthProvider>
          <HouseholdProvider>
            <RealtimeProvider>
              <ToastProvider>
                <OnboardingProvider>{children}</OnboardingProvider>
              </ToastProvider>
            </RealtimeProvider>
          </HouseholdProvider>
          <ServiceWorkerRegistration />
          <InstallPrompt />
        </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
