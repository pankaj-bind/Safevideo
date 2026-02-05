/**
 * Shared theme hook — single source of truth for theme state
 * Reads from localStorage and syncs to document attribute
 */
import { useState, useEffect, useCallback } from 'react';

export type Theme = 'dark' | 'light';

export const useTheme = (): { theme: Theme; toggleTheme: () => void } => {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('sv-theme');
    return stored === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sv-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggleTheme };
};
