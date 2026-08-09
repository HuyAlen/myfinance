import StartupShellSkeleton from "@/src/components/layout/StartupShellSkeleton";

// Next's route-level Suspense fallback for `/`. Shown as early as the
// server can stream something, before AppShell's own client-side
// loading/!user fallback ever gets a chance to mount. Reuses the exact
// same skeleton component AppShell falls back to, so there's no flash of
// a second, differently-shaped loading state.
export default function Loading() {
  return <StartupShellSkeleton />;
}
