/**
 * Static, dependency-free shell skeleton shown before auth/session resolves
 * — both from `app/loading.tsx` (Next's own route-level Suspense fallback,
 * shown as early as the server can stream something) and from AppShell's
 * own `loading`/`!user` fallback branch. Sharing one component means the
 * user never sees two different-looking loading states flash in sequence.
 *
 * Intentionally has NO hooks, NO data, NO effects, NO timers, NO images —
 * pure static JSX + Tailwind classes, safe to render before hydration and
 * before any auth/session information exists. Contains no financial
 * numbers or user-specific data, only generic placeholder shapes.
 */
export default function StartupShellSkeleton() {
  return (
    <div className="h-(--app-height) overflow-hidden bg-slate-50 [--mobile-bottom-nav-height:4.75rem]">
      {/* Desktop sidebar placeholder */}
      <div className="fixed inset-y-0 left-0 hidden w-72 border-r border-slate-100 bg-white px-3 py-5 lg:block">
        <div className="mb-6 flex items-center gap-3 px-2">
          <div className="size-11 shrink-0 motion-safe:animate-pulse rounded-2xl bg-slate-200" />
          <div className="space-y-1.5">
            <div className="h-3 w-24 motion-safe:animate-pulse rounded bg-slate-200" />
            <div className="h-2.5 w-20 motion-safe:animate-pulse rounded bg-slate-100" />
          </div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-10 motion-safe:animate-pulse rounded-2xl bg-slate-100"
            />
          ))}
        </div>
      </div>

      <div className="flex h-full min-w-0 flex-col lg:pl-72">
        {/* Header placeholder: menu + brand + 2 action icons */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-white px-3 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="size-9 shrink-0 motion-safe:animate-pulse rounded-2xl bg-slate-100 lg:hidden" />
            <div className="space-y-1.5">
              <div className="h-4 w-32 motion-safe:animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-44 motion-safe:animate-pulse rounded bg-slate-100" />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="size-9 motion-safe:animate-pulse rounded-full bg-slate-100" />
            <div className="size-9 motion-safe:animate-pulse rounded-full bg-slate-200" />
          </div>
        </div>

        <main className="min-h-0 flex-1 overflow-hidden px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
          {/* Month-selector placeholder */}
          <div className="mb-4 flex items-center justify-center gap-2">
            <div className="size-8 shrink-0 motion-safe:animate-pulse rounded-xl bg-slate-100" />
            <div className="h-8 w-28 motion-safe:animate-pulse rounded-xl bg-white shadow-sm ring-1 ring-slate-100" />
            <div className="size-8 shrink-0 motion-safe:animate-pulse rounded-xl bg-slate-100" />
          </div>

          {/* Summary card placeholders */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-24 motion-safe:animate-pulse rounded-3xl bg-white shadow-sm ring-1 ring-slate-100"
              />
            ))}
          </div>
          <div className="mt-4 h-48 motion-safe:animate-pulse rounded-3xl bg-white shadow-sm ring-1 ring-slate-100" />
        </main>
      </div>

      {/* Mobile bottom nav placeholder */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 pb-[max(env(safe-area-inset-bottom),0.5rem)] lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1 px-1 pb-1 pt-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="mx-auto size-9 motion-safe:animate-pulse rounded-2xl bg-slate-100"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
