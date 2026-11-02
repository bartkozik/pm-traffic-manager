import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem('theme') as ThemeMode;
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    if (theme === 'dark') {
      root.dataset.theme = 'dark';
      body.dataset.theme = 'dark';
      root.style.setProperty('--app-bg-primary', '#10131c');
      root.style.setProperty('--app-text-primary', '#f5f7fb');
      root.style.setProperty('--app-text-muted', '#9aa3b2');
      root.style.setProperty('--app-border', '#30384b');
      body.style.backgroundColor = '#10131c';
      body.style.color = '#f5f7fb';
    } else {
      root.dataset.theme = 'light';
      body.dataset.theme = 'light';
      root.style.setProperty('--app-bg-primary', '#ffffff');
      root.style.setProperty('--app-text-primary', '#111827');
      root.style.setProperty('--app-text-muted', '#6b7280');
      root.style.setProperty('--app-border', '#d1d5db');
      body.style.backgroundColor = '#ffffff';
      body.style.color = '#111827';
    }

    body.style.margin = '0';
    body.style.padding = '0';
  }, [theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      if (!localStorage.getItem('theme')) {
        setThemeState(event.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
