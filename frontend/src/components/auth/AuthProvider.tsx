"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/src/lib/supabase";
import { reportPerformanceMetric } from "@/src/lib/performance/performanceReporter";

type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
});

const LOCAL_UI_MODE =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_LOCAL_UI_MODE === "true";

const LOCAL_UI_USER: User = {
  id: "local-ui-user",
  aud: "authenticated",
  role: "authenticated",
  email: "local@myfinance.dev",
  app_metadata: {
    provider: "local",
    providers: ["local"],
  },
  user_metadata: {
    name: "Local UI",
  },
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const LOCAL_UI_SESSION: Session = {
  access_token: "local-ui-mode",
  refresh_token: "local-ui-mode",
  expires_in: 60 * 60 * 24 * 365,
  expires_at: 4102444800,
  token_type: "bearer",
  user: LOCAL_UI_USER,
};

// Auth bootstrap must never be allowed to hold AppShell's startup skeleton
// forever. This is intentionally longer than a normal local-storage session
// read so a legitimate token refresh still has room to complete on a slow
// connection, while providing a deterministic fail-closed escape hatch.
const AUTH_SESSION_TIMEOUT_MS = 10_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() =>
    LOCAL_UI_MODE ? LOCAL_UI_USER : null,
  );
  const [session, setSession] = useState<Session | null>(() =>
    LOCAL_UI_MODE ? LOCAL_UI_SESSION : null,
  );
  const [loading, setLoading] = useState(() => !LOCAL_UI_MODE);
  const mountedAtRef = useRef<number | null>(null);
  const hasReportedAuthReadyRef = useRef(false);

  useEffect(() => {
    mountedAtRef.current = performance.now();

    const reportAuthReady = () => {
      if (
        hasReportedAuthReadyRef.current ||
        mountedAtRef.current === null
      ) {
        return;
      }

      hasReportedAuthReadyRef.current = true;
      reportPerformanceMetric(
        "auth_ready",
        performance.now() - mountedAtRef.current,
        { status: "success" },
      );
    };

    // Development-only UI mode. State is already initialized synchronously by
    // the lazy useState initializers above, so this effect only reports ready.
    if (LOCAL_UI_MODE) {
      reportAuthReady();
      return;
    }

    let active = true;

    // Every auth-state event increments this revision. The initial getSession
    // result is only allowed to commit if no newer auth event (or timeout) has
    // happened first. This prevents a stale bootstrap response from clobbering
    // a newer SIGNED_IN / TOKEN_REFRESHED state.
    let authStateRevision = 0;
    const initialRevision = authStateRevision;

    const applyResolvedSession = (nextSession: Session | null) => {
      if (!active) return;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
      reportAuthReady();
    };

    const settleBootstrapFailure = (reason: unknown) => {
      if (!active || authStateRevision !== initialRevision) return;

      // Invalidate the outstanding initial request so a late resolution cannot
      // overwrite a newer state after we have already failed closed.
      authStateRevision += 1;
      setSession(null);
      setUser(null);
      setLoading(false);

      // Do not include tokens/session payloads in logs. Supabase error objects
      // may carry implementation details, so only emit a bounded message.
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "Unable to resolve initial auth session.";
      console.error("[AuthProvider] Initial session bootstrap failed:", message);
    };

    const initialSessionTimeout = window.setTimeout(() => {
      settleBootstrapFailure(
        `Session bootstrap exceeded ${AUTH_SESSION_TIMEOUT_MS}ms.`,
      );
    }, AUTH_SESSION_TIMEOUT_MS);

    // Normal Supabase authentication. Handle both failure shapes Supabase can
    // surface here: a resolved result carrying `error`, and a rejected Promise.
    void supabase.auth
      .getSession()
      .then(({ data: { session: initialSession }, error }) => {
        if (!active || authStateRevision !== initialRevision) return;

        window.clearTimeout(initialSessionTimeout);

        if (error) {
          settleBootstrapFailure(error.message);
          return;
        }

        applyResolvedSession(initialSession);
      })
      .catch((error: unknown) => {
        if (!active || authStateRevision !== initialRevision) return;

        window.clearTimeout(initialSessionTimeout);
        settleBootstrapFailure(error);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;

      authStateRevision += 1;
      window.clearTimeout(initialSessionTimeout);
      applyResolvedSession(nextSession);
    });

    return () => {
      active = false;
      window.clearTimeout(initialSessionTimeout);
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
