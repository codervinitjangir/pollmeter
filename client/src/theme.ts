import { POLARIS_PALETTE, POLARIS_TYPOGRAPHY, POLARIS_RADIUS, POLARIS_SHADOWS, ThemeMode } from './designTokens';

export type Theme = ThemeMode;
export { POLARIS_PALETTE, POLARIS_TYPOGRAPHY, POLARIS_RADIUS, POLARIS_SHADOWS };

export function getActiveTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  try {
    const saved = localStorage.getItem('pm_theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {}
  return 'dark';
}

export function setTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('pm_theme', theme);
  } catch {}
}

export function toggleTheme(): Theme {
  const current = getActiveTheme();
  const next: Theme = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}
