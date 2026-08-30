"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  isResolvedTheme,
  isThemePreference,
  resolveThemePreference,
  THEME_MEDIA_QUERY,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "@/src/lib/theme";

type ThemeContextValue = {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemPrefersDark(): boolean {
  return window.matchMedia(THEME_MEDIA_QUERY).matches;
}

function readStoredThemePreference(
  fallback: ThemePreference,
): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : fallback;
  } catch {
    // iOS private browsing / managed WebViews can deny storage access. Keep
    // the in-memory preference so the current session remains functional.
    return fallback;
  }
}

function updateThemeColor(resolvedTheme: ResolvedTheme) {
  const themeColor = resolvedTheme === "dark" ? "#0f1720" : "#edf3f8";
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) => meta.setAttribute("content", themeColor));
}

function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolvedTheme = resolveThemePreference(
    preference,
    getSystemPrefersDark(),
  );
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolvedTheme;
  updateThemeColor(resolvedTheme);
  return resolvedTheme;
}

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const themeRef = useRef<ThemePreference>("system");

  const commitTheme = useCallback(
    (nextTheme: ThemePreference, persist: boolean) => {
      themeRef.current = nextTheme;
      setThemeState(nextTheme);

      if (persist) {
        try {
          window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        } catch {
          // Storage can be disabled (private browsing / managed WebView). The
          // DOM and React state still receive the requested theme immediately.
        }
      }

      setResolvedTheme(applyTheme(nextTheme));
    },
    [],
  );

  const setTheme = useCallback(
    (nextTheme: ThemePreference) => {
      commitTheme(nextTheme, true);
    },
    [commitTheme],
  );

  const toggleTheme = useCallback(() => {
    // On iPhone Safari/PWA the React state can briefly be stale after BFCache
    // restoration or app resume. The data-theme attribute is the actual CSS
    // authority, so use it first and only fall back to the current preference.
    const domTheme = document.documentElement.dataset.theme;
    const currentResolvedTheme = isResolvedTheme(domTheme)
      ? domTheme
      : resolveThemePreference(themeRef.current, getSystemPrefersDark());

    setTheme(currentResolvedTheme === "dark" ? "light" : "dark");
  }, [setTheme]);

  useEffect(() => {
    const bootstrapPreference = document.documentElement.dataset.themePreference;
    const initialTheme = readStoredThemePreference(
      isThemePreference(bootstrapPreference) ? bootstrapPreference : "system",
    );
    commitTheme(initialTheme, false);

    const media = window.matchMedia(THEME_MEDIA_QUERY);
    const onSystemThemeChange = () => {
      if (themeRef.current !== "system") return;
      setResolvedTheme(applyTheme("system"));
    };

    // Safari can restore a PWA/tab from BFCache with React state and the DOM
    // from slightly different moments. Re-applying the persisted/in-memory
    // preference on resume keeps CSS, icon state and browser chrome aligned.
    const syncThemeFromRuntime = () => {
      const nextTheme = readStoredThemePreference(themeRef.current);
      commitTheme(nextTheme, false);
    };

    const onPageShow = () => {
      syncThemeFromRuntime();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncThemeFromRuntime();
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const nextTheme = isThemePreference(event.newValue)
        ? event.newValue
        : "system";
      commitTheme(nextTheme, false);
    };

    media.addEventListener("change", onSystemThemeChange);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      media.removeEventListener("change", onSystemThemeChange);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [commitTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme }),
    [resolvedTheme, setTheme, theme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
