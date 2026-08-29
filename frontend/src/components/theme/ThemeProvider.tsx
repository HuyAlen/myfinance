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
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemPrefersDark(): boolean {
  return window.matchMedia(THEME_MEDIA_QUERY).matches;
}

function updateThemeColor(resolvedTheme: ResolvedTheme) {
  const themeColor = resolvedTheme === "dark" ? "#0f1720" : "#edf3f8";
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  meta?.setAttribute("content", themeColor);
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

  const setTheme = useCallback((nextTheme: ThemePreference) => {
    themeRef.current = nextTheme;
    setThemeState(nextTheme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Storage can be disabled (private browsing / managed WebView). The
      // current session still receives the requested theme.
    }
    setResolvedTheme(applyTheme(nextTheme));
  }, []);

  useEffect(() => {
    let initialTheme: ThemePreference = "system";
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (isThemePreference(stored)) initialTheme = stored;
    } catch {
      // Keep system preference when storage is unavailable.
    }

    themeRef.current = initialTheme;
    setThemeState(initialTheme);
    setResolvedTheme(applyTheme(initialTheme));

    const media = window.matchMedia(THEME_MEDIA_QUERY);
    const onSystemThemeChange = () => {
      if (themeRef.current !== "system") return;
      setResolvedTheme(applyTheme("system"));
    };
    media.addEventListener("change", onSystemThemeChange);
    return () => media.removeEventListener("change", onSystemThemeChange);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [resolvedTheme, setTheme, theme],
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
