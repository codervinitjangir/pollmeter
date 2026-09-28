/**
 * Polaris LMS / Campus Enterprise Design Tokens
 * 
 * Curated palette directly extracted from Polaris LMS & OJT Management standard:
 * - Canvas: Obsidian deep space (#09090B / #0B0B0D)
 * - Panels: Charcoal (#111113 / #151518)
 * - Cards: Elevated dark (#1B1B1F / #202024)
 * - Borders: Muted boundary (#2A2A2F / #333338)
 * - Text: Off-white crisp (#F2F2F2), Secondary (#9CA3AF), Muted (#6B7280)
 * - Accent: Warm Amber Orange (#F59E0B / #F6A21A)
 * - Badges: Amber-Cream (#FFF1D6 with #92400E text)
 * - Signals: Live Emerald (#10B981), Broadcast Blue (#3B82F6), Threat/Alert (#EF4444)
 */

export const POLARIS_PALETTE = {
  dark: {
    bg: '#060607',
    bgAlt: '#0b0b0d',
    sidebar: '#0b0b0d',
    sidebarAlt: '#111114',
    card: '#0b0b0d',
    cardNested: '#141418',
    border: '#1d1d22',
    borderHover: '#2b2b32',
    text: '#f4f4f6',
    textSecondary: '#93939e',
    textMuted: '#5a5a65',
    accent: '#7aa2ff',
    accentHover: '#98b8ff',
    badgeBg: 'rgba(122, 162, 255, 0.12)',
    badgeText: '#7aa2ff',
    statusLive: '#45d69a',
    statusBlue: '#7aa2ff',
    statusAmber: '#f5a524',
    statusRed: '#e5675a',
  },
  light: {
    bg: '#f6f5f2',
    bgAlt: '#fbfaf8',
    sidebar: '#fbfaf8',
    sidebarAlt: '#ffffff',
    card: '#ffffff',
    cardNested: '#fbfaf8',
    border: '#e2e1dc',
    borderHover: '#cfcec8',
    text: '#111319',
    textSecondary: '#575b68',
    textMuted: '#8d909b',
    accent: '#2350d6',
    accentHover: '#1a3eb0',
    badgeBg: '#eef2ff',
    badgeText: '#2350d6',
    statusLive: '#0d8a5b',
    statusBlue: '#2350d6',
    statusAmber: '#c77700',
    statusRed: '#e5675a',
  },
} as const;

export type ThemeMode = 'dark' | 'light';

export const POLARIS_TYPOGRAPHY = {
  fontFamily: "Geist, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  headingFamily: "'Bricolage Grotesque', Geist, sans-serif",
  monoFamily: "'Geist Mono', ui-monospace, Menlo, monospace",
  sizes: {
    xs: '0.72rem',
    sm: '0.82rem',
    base: '0.9rem',
    md: '1.05rem',
    lg: '1.25rem',
    xl: '1.5rem',
    '2xl': '1.85rem',
    '3xl': '2.25rem',
  },
} as const;

export const POLARIS_RADIUS = {
  sm: '6px',
  md: '10px',
  lg: '14px',
  xl: '20px',
  full: '9999px',
} as const;

export const POLARIS_SHADOWS = {
  cardDark: '0 18px 45px -10px rgba(0, 0, 0, 0.65)',
  cardLight: '0 10px 25px -5px rgba(0, 0, 0, 0.05)',
  glowAmber: '0 0 16px rgba(245, 158, 11, 0.3)',
  glowBlue: '0 0 16px rgba(59, 130, 246, 0.25)',
} as const;
