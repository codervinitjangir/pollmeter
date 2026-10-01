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
    bg: '#1B121E',
    bgAlt: '#160E18',
    sidebar: '#241828',
    sidebarAlt: '#1E1422',
    card: '#241828',
    cardNested: '#2E1E33',
    border: '#38273D',
    borderHover: '#49344F',
    text: '#F7F2F6',
    textSecondary: '#B9AAB8',
    textMuted: '#7C6C7B',
    accent: '#E27E6C',
    accentHover: '#F0907E',
    badgeBg: 'rgba(226, 126, 108, 0.15)',
    badgeText: '#E27E6C',
    statusLive: '#34D399',
    statusBlue: '#E27E6C',
    statusAmber: '#E27E6C',
    statusRed: '#EF4444',
  },
  light: {
    bg: '#FAF6F0',
    bgAlt: '#F5EFE8',
    sidebar: '#FFFFFF',
    sidebarAlt: '#FAF6F0',
    card: '#FFFFFF',
    cardNested: '#F7F2EC',
    border: '#EFE9E2',
    borderHover: '#E3DDD5',
    text: '#2D192C',
    textSecondary: '#756476',
    textMuted: '#A293A3',
    accent: '#CF6D5B',
    accentHover: '#BD5D4B',
    badgeBg: '#EBF5EF',
    badgeText: '#267851',
    statusLive: '#267851',
    statusBlue: '#CF6D5B',
    statusAmber: '#CF6D5B',
    statusRed: '#D94848',
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
