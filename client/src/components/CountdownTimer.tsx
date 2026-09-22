import { useEffect, useState } from 'react';

interface Props {
  /** Epoch ms when answers close. Server-authoritative, so every screen agrees. */
  endsAt?: number;
  startedAt?: number;
  durationSeconds: number;
  size?: number;
  onExpired?: () => void;
}

export default function CountdownTimer({ endsAt, startedAt, durationSeconds, size = 80, onExpired }: Props) {
  const targetTime = endsAt ?? (startedAt ? startedAt + durationSeconds * 1000 : Date.now() + durationSeconds * 1000);
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, (targetTime - Date.now()) / 1000)
  );

  useEffect(() => {
    let fired = false;

    function tick() {
      const rem = Math.max(0, (targetTime - Date.now()) / 1000);
      setRemaining(rem);
      if (rem <= 0 && !fired) {
        fired = true;
        onExpired?.();
      }
    }

    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
    // onExpired is intentionally excluded — a new identity each render would
    // restart the interval on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetTime]);

  const stroke = Math.max(4, Math.round(size * 0.08));
  const radius = (size - stroke * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = durationSeconds > 0 ? Math.min(1, remaining / durationSeconds) : 0;
  const dashOffset = circumference * (1 - progress);

  const displaySecs = Math.ceil(remaining);
  const isWarning = remaining <= 5 && remaining > 0;
  const isDone = remaining <= 0;

  return (
    <div
      className={`timer-ring-wrap${isWarning ? ' is-warning' : ''}`}
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
        <circle className="timer-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
        <circle
          className={`timer-fill${isWarning ? ' warning' : ''}${isDone ? ' done' : ''}`}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span
        className={`timer-number${isWarning ? ' warning' : ''}`}
        style={{ fontSize: Math.round(size * 0.36) }}
        aria-hidden="true"
      >
        {displaySecs}
      </span>
    </div>
  );
}
