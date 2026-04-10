import React, { useState, useEffect } from 'react';

interface Props {
  defaultTheme?: 'light' | 'dark';
}

function getSystemPreference(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeToggle({ defaultTheme }: Props) {
  const [systemPreference, setSystemPreference] = useState<'light' | 'dark'>(getSystemPreference);
  const [theme, setTheme] = useState<'light' | 'dark'>(defaultTheme ?? getSystemPreference());

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = (e: MediaQueryListEvent) => {
      const pref = e.matches ? 'dark' : 'light';
      setSystemPreference(pref);
      setTheme(pref);
    };
    mq.addEventListener('change', handleSystemChange);
    return () => mq.removeEventListener('change', handleSystemChange);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const handleToggle = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  const isDark = theme === 'dark';

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-500">System: {systemPreference}</span>
      <button
        onClick={handleToggle}
        aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
        className={`relative w-12 h-6 rounded-full transition-colors ${
          isDark ? 'bg-blue-600' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            isDark ? 'translate-x-6' : 'translate-x-0'
          }`}
        />
      </button>
      <span className="text-sm font-medium capitalize">{theme}</span>
    </div>
  );
}
