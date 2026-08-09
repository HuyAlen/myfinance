"use client";

import { createContext, useContext, useEffect } from "react";

type SetGlobalFabSuppressed = (suppressed: boolean) => void;

/**
 * AppShell owns the actual suppression boolean (it's the one deciding
 * whether to render the FABs) and only hands descendant pages a setter —
 * there's nothing for a page to *read* here, only something to declare.
 */
const FabSuppressionSetterContext = createContext<SetGlobalFabSuppressed | null>(
  null,
);

export function FabSuppressionProvider({
  setSuppressed,
  children,
}: {
  setSuppressed: SetGlobalFabSuppressed;
  children: React.ReactNode;
}) {
  return (
    <FabSuppressionSetterContext.Provider value={setSuppressed}>
      {children}
    </FabSuppressionSetterContext.Provider>
  );
}

/**
 * Hides the global AI / Quick Action FABs for as long as `isOpen` is true —
 * call with a page's own "is my primary create/edit modal open" boolean
 * (OR together multiple mutually-exclusive-ish modal flags if a page has
 * more than one, e.g. `isFormOpen || isTransferOpen || !!deleteTarget`, so
 * switching between nested/sibling dialogs never flickers the FABs back in
 * between).
 *
 * Synced through an effect rather than during render, and always reset to
 * `false` on cleanup, so a page can never leave the FABs stuck hidden —
 * covers the modal being closed, the form being submitted, or the whole
 * page unmounting (route change unmounts AppShell too, which resets the
 * underlying state on its own, but this cleanup makes the guarantee local
 * and independent of that).
 */
export function useSuppressGlobalFabsWhileOpen(isOpen: boolean) {
  const setSuppressed = useContext(FabSuppressionSetterContext);

  useEffect(() => {
    if (!setSuppressed) return;

    setSuppressed(isOpen);
    return () => setSuppressed(false);
  }, [isOpen, setSuppressed]);
}
