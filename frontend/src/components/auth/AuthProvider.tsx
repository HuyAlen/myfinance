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

    // Development-only UI mode. This bypasses Supabase auth so the
    // frontend can be inspected locally without a reachable Supabase project.
    if (LOCAL_UI_MODE) {
      reportAuthReady();
      return;
    }

    let active = true;

    // Normal Supabase authentication.
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;

      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      reportAuthReady();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;

      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
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
