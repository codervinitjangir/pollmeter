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
    bg: '#09090B',
    bgAlt: '#0B0B0D',
    sidebar: '#111113',
    sidebarAlt: '#151518',
    card: '#1B1B1F',
    cardNested: '#202024',
    border: '#2A2A2F',
    borderHover: '#383842',
    text: '#F2F2F2',
    textSecondary: '#9CA3AF',
    textMuted: '#6B7280',
    accent: '#F59E0B',
    accentHover: '#F6A21A',
    badgeBg: '#FFF1D6',
    badgeText: '#92400E',
    statusLive: '#10B981',
    statusBlue: '#3B82F6',
    statusRed: '#EF4444',
  },
  light: {
    bg: '#F8FAFC',
    bgAlt: '#F1F5F9',
    sidebar: '#FFFFFF',
    sidebarAlt: '#F8FAFC',
    card: '#FFFFFF',
    cardNested: '#F8FAFC',
    border: '#E2E8F0',
    borderHover: '#CBD5E1',
    text: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#64748B',
    accent: '#F59E0B',
    accentHover: '#D97706',
    badgeBg: '#FEF3C7',
    badgeText: '#92400E',
    statusLive: '#10B981',
    statusBlue: '#3B82F6',
    statusRed: '#EF4444',
  },
} as const;

export type ThemeMode = 'dark' | 'light';

export const POLARIS_TYPOGRAPHY = {
  fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  monoFamily: "'JetBrains Mono', 'Fira Code', monospace",
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
