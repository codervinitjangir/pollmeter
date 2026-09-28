import React from 'react';

export interface PolarisBadgeProps {
  children: React.ReactNode;
  variant?: 'live' | 'admin' | 'mentor' | 'verified' | 'amber' | 'neutral';
  style?: React.CSSProperties;
}

export function PolarisBadge({ children, variant = 'amber', style }: PolarisBadgeProps) {
  let badgeClass = 'pm-badge-role';
  if (variant === 'live') badgeClass = 'pm-portal-badge-faculty';
  if (variant === 'admin') badgeClass = 'pm-badge-admin-seal';
  if (variant === 'verified') badgeClass = 'pm-gateway-verified-badge';
  if (variant === 'amber') badgeClass = 'pm-portal-role-badge';
  if (variant === 'mentor') badgeClass = 'pm-gateway-role-tag';

  return (
    <span className={badgeClass} style={style}>
      {children}
    </span>
  );
}

export interface PolarisButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
}

export function PolarisButton({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  className = '',
  style,
  ...props
}: PolarisButtonProps) {
  const baseClass = variant === 'primary' ? 'pm-btn-primary' : variant === 'secondary' ? 'pm-btn-secondary' : 'btn-ghost';
  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { padding: '0.35rem 0.75rem', fontSize: '0.8rem' },
    md: { padding: '0.55rem 1.15rem', fontSize: '0.88rem' },
    lg: { padding: '0.75rem 1.5rem', fontSize: '0.95rem' },
  };

  return (
    <button
      className={`${baseClass} ${className}`.trim()}
      style={{ ...sizeStyles[size], ...style }}
      {...props}
    >
      {icon && <span style={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</span>}
      {children}
    </button>
  );
}

export interface PolarisUserChipProps {
  name: string;
  email?: string;
  role?: string;
  onSignOut?: () => void;
}

export function PolarisUserChip({ name, role, onSignOut }: PolarisUserChipProps) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
      <div
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          background: 'var(--panel, #0a0a0b)',
          border: '1px solid var(--acc, #4f8cff)',
          color: 'var(--acc, #4f8cff)',
          fontWeight: 600,
          fontSize: '0.8rem',
          fontFamily: 'var(--mono)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {initials}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <strong style={{ fontSize: '0.82rem', color: 'var(--fg, #f4f4f5)' }}>
          {name}
        </strong>
        {role && (
          <small style={{ fontSize: '0.68rem', color: 'var(--mute, #8b8b94)', textTransform: 'capitalize' }}>
            {role}
          </small>
        )}
      </div>
      {onSignOut && (
        <button
          type="button"
          onClick={onSignOut}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--err, #e5675a)',
            fontSize: '0.75rem',
            fontWeight: 500,
            cursor: 'pointer',
            padding: '0.2rem 0.4rem',
            borderRadius: '6px',
            marginLeft: '0.35rem',
          }}
        >
          Sign Out
        </button>
      )}
    </div>
  );
}
