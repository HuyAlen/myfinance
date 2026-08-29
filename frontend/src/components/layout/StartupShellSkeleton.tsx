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
 *
 * Placeholder blocks use the `skeleton-pulse` class (see globals.css)
 * instead of Tailwind's `animate-pulse`: a CSS-only background-color
 * oscillation between slate-100 and slate-200 that reads more clearly on
 * real iPhone than opacity fading alone, while still fully respecting
 * prefers-reduced-motion (the animation itself is gated behind
 * `@media (prefers-reduced-motion: no-preference)`; reduced-motion users
 * just see the static slate-100 resting color).
 */
export default function StartupShellSkeleton() {
  return (
    <div className="finance-shell h-(--app-height) overflow-hidden bg-[var(--finance-page)] [--mobile-bottom-nav-height:4.75rem]">
      {/* Desktop sidebar placeholder */}
      <div className="finance-sidebar fixed inset-y-0 left-0 hidden w-72 border-r border-slate-100 bg-white px-3 py-5 lg:block">
        <div className="mb-6 flex items-center gap-3 px-2">
          <div className="size-11 shrink-0 skeleton-pulse rounded-2xl" />
          <div className="space-y-1.5">
            <div className="h-3 w-24 skeleton-pulse rounded" />
            <div className="h-2.5 w-20 skeleton-pulse rounded" />
          </div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 skeleton-pulse rounded-2xl" />
          ))}
        </div>
      </div>

      <div className="flex h-full min-w-0 flex-col lg:pl-72">
        {/* Header placeholder: menu + brand + 2 action icons */}
        <div className="finance-header flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="size-9 shrink-0 skeleton-pulse rounded-2xl lg:hidden" />
            <div className="space-y-1.5">
              <div className="h-4 w-32 skeleton-pulse rounded-full" />
              <div className="h-3 w-44 skeleton-pulse rounded-full" />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="size-9 skeleton-pulse rounded-full" />
            <div className="size-9 skeleton-pulse rounded-full" />
          </div>
        </div>

        <main className="finance-main min-h-0 flex-1 overflow-hidden px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
          {/* Month-selector placeholder */}
          <div className="mb-4 flex items-center justify-center gap-2">
            <div className="size-8 shrink-0 skeleton-pulse rounded-xl" />
            <div className="flex h-8 w-28 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
              <div className="h-2.5 w-14 skeleton-pulse rounded-full" />
            </div>
            <div className="size-8 shrink-0 skeleton-pulse rounded-xl" />
          </div>

          {/* Summary card placeholders — internal title/value/secondary bars
              so each card reads as "actively loading" rather than an empty
              container. Widths are fixed Tailwind fractions, not random. */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["w-1/3", "w-2/3", "w-1/2"],
              ["w-2/5", "w-1/2", "w-1/3"],
              ["w-1/3", "w-3/5", "w-2/5"],
              ["w-2/5", "w-2/3", "w-1/3"],
            ].map((widths, i) => (
              <div
                key={i}
                className="flex h-24 flex-col justify-center gap-2 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
              >
                <div className={`h-2 ${widths[0]} skeleton-pulse rounded-full`} />
                <div className={`h-4 ${widths[1]} skeleton-pulse rounded-full`} />
                <div className={`h-2 ${widths[2]} skeleton-pulse rounded-full`} />
              </div>
            ))}
          </div>

          {/* Large secondary card (chart/list area) placeholder */}
          <div className="mt-4 h-48 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="h-3 w-1/4 skeleton-pulse rounded-full" />
            <div className="mt-5 space-y-3">
              <div className="h-2.5 w-full skeleton-pulse rounded-full" />
              <div className="h-2.5 w-5/6 skeleton-pulse rounded-full" />
              <div className="h-2.5 w-2/3 skeleton-pulse rounded-full" />
            </div>
          </div>
        </main>
      </div>

      {/* Mobile bottom nav placeholder */}
      <div className="finance-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 pb-[max(env(safe-area-inset-bottom),0.5rem)] lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1 px-1 pb-1 pt-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="mx-auto size-9 skeleton-pulse rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
