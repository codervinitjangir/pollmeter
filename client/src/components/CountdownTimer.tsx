import { useEffect, useState } from 'react';

interface Props {
  /** Epoch ms when answers close. Server-authoritative, so every screen agrees. */
  endsAt?: number;
  unlocksAt?: number | null;
  startedAt?: number;
  durationSeconds: number;
  size?: number;
  onExpired?: () => void;
  onUnlocked?: () => void;
}

export default function CountdownTimer({
  endsAt,
  unlocksAt,
  startedAt,
  durationSeconds,
  size = 80,
  onExpired,
  onUnlocked,
}: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let unlockedFired = false;
    let expiredFired = false;

    function tick() {
      const current = Date.now();
      setNow(current);

      if (unlocksAt && current >= unlocksAt && !unlockedFired) {
        unlockedFired = true;
        onUnlocked?.();
      }

      if (endsAt && current >= endsAt && !expiredFired) {
        expiredFired = true;
        onExpired?.();
      }
    }

    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [endsAt, unlocksAt, onExpired, onUnlocked]);

  const isReading = Boolean(unlocksAt && now < unlocksAt);
  const readDuration = unlocksAt && startedAt ? Math.max(1, (unlocksAt - startedAt) / 1000) : 3;
  const readRemaining = isReading ? Math.max(0, (unlocksAt! - now) / 1000) : 0;

  const targetTime = endsAt ?? (startedAt ? startedAt + durationSeconds * 1000 : now + durationSeconds * 1000);
  const answeringRemaining = isReading
    ? durationSeconds
    : Math.max(0, (targetTime - now) / 1000);

  const remaining = isReading ? readRemaining : answeringRemaining;
  const totalDuration = isReading ? readDuration : durationSeconds;

  const stroke = Math.max(4, Math.round(size * 0.09));
  const radius = (size - stroke * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = totalDuration > 0 ? Math.min(1, remaining / totalDuration) : 0;
  const dashOffset = circumference * (1 - progress);

  const displaySecs = Math.ceil(remaining);
  const isWarning = !isReading && remaining <= 5 && remaining > 0;
  const isDone = !isReading && remaining <= 0;

  // Color transitions: reading (indigo) → normal (cyan) → orange → red
  const strokeColor = isReading
    ? '#8B5CF6'
    : isDone
    ? '#6B7280'
    : isWarning
    ? '#EF4444'
    : remaining <= 10
    ? '#F97316'
    : '#38BDF8';

  const trackColor = isDone ? '#E5E7EB' : 'rgba(255,255,255,0.12)';

  return (
    <div
      className={`timer-ring-wrap${isWarning ? ' timer-ring-wrap--warning' : ''}${isDone ? ' timer-ring-wrap--done' : ''}${isReading ? ' timer-ring-wrap--reading' : ''}`}
      style={{ width: size, height: size }}
    >
      <svg
        className="timer-svg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="timer"
        aria-label={`${displaySecs} seconds remaining`}
      >
        {/* Track */}
        <circle
          className="timer-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          stroke={trackColor}
          fill="none"
        />
        {/* Animated arc */}
        <circle
          className={`timer-fill${isWarning ? ' warning' : ''}${isDone ? ' done' : ''}`}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          stroke={strokeColor}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
        />
      </svg>

      {/* Number in center */}
      <span
        className={`timer-number${isWarning ? ' warning' : ''}${isReading ? ' reading' : ''}`}
        style={{ fontSize: isReading ? Math.round(size * 0.32) : Math.round(size * 0.36) }}
        aria-hidden="true"
      >
        {isDone ? '✓' : isReading ? `${displaySecs}s` : displaySecs}
      </span>
    </div>
  );
}
