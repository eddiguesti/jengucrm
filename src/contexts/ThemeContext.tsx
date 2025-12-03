'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (value: Theme) => void;
  toggleTheme: () => void;
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getInitialTheme(): Theme {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  }
  return 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  const [ready, setReady] = useState(typeof window !== 'undefined');

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const root = document.documentElement;
    root.classList.remove('dark', 'theme-light');
    root.classList.add(theme === 'dark' ? 'dark' : 'theme-light');
    localStorage.setItem('theme', theme);
  }, [theme, ready]);

  const value = useMemo(
    () => ({
      theme,
      setTheme: (value: Theme) => setThemeState(value),
      toggleTheme: () => setThemeState(prev => (prev === 'dark' ? 'light' : 'dark')),
      ready,
    }),
    [theme, ready]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
