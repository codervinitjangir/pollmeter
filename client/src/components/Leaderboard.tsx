import { useEffect, useRef, useMemo, useState } from 'react';
import confetti from 'canvas-confetti';
import { LeaderboardEntry } from '../types';
import { cleanText } from '../cleanText';

interface Props {
  entries: LeaderboardEntry[];
  prevEntries?: LeaderboardEntry[];
  myParticipantId?: string;
  title?: string;
  subtitle?: string;
  variant?: 'projector' | 'compact';
  showPodium?: boolean;
  isPodium?: boolean;
  allowViewToggle?: boolean;
  showAll?: boolean;
  limit?: number;
  celebrateKey?: string | number;
}

interface BarStyle {
  gradient: string;
  accent: string;
  glow?: string;
}

const VIBRANT_GRADIENTS: BarStyle[] = [
  { gradient: 'linear-gradient(90deg, #0D9488 0%, #2DD4BF 100%)', accent: '#0D9488', glow: 'rgba(45, 212, 191, 0.35)' },
  { gradient: 'linear-gradient(90deg, #7C3AED 0%, #EC4899 100%)', accent: '#7C3AED', glow: 'rgba(236, 72, 153, 0.35)' },
  { gradient: 'linear-gradient(90deg, #2563EB 0%, #38BDF8 100%)', accent: '#2563EB', glow: 'rgba(56, 189, 248, 0.35)' },
  { gradient: 'linear-gradient(90deg, #059669 0%, #10B981 100%)', accent: '#059669', glow: 'rgba(16, 185, 129, 0.35)' },
  { gradient: 'linear-gradient(90deg, #E11D48 0%, #FB7185 100%)', accent: '#E11D48', glow: 'rgba(251, 113, 133, 0.35)' },
  { gradient: 'linear-gradient(90deg, #EA580C 0%, #FBBF24 100%)', accent: '#EA580C', glow: 'rgba(251, 191, 36, 0.35)' },
  { gradient: 'linear-gradient(90deg, #C026D3 0%, #F472B6 100%)', accent: '#C026D3', glow: 'rgba(244, 114, 182, 0.35)' },
  { gradient: 'linear-gradient(90deg, #0891B2 0%, #06B6D4 100%)', accent: '#0891B2', glow: 'rgba(6, 182, 212, 0.35)' },
];

const GOLD_STYLE: BarStyle = {
  gradient: 'linear-gradient(90deg, #D97706 0%, #F59E0B 50%, #FBBF24 100%)',
  accent: '#F59E0B',
  glow: 'rgba(245, 158, 11, 0.5)',
};

const SILVER_STYLE: BarStyle = {
  gradient: 'linear-gradient(90deg, #64748B 0%, #94A3B8 60%, #CBD5E1 100%)',
  accent: '#94A3B8',
  glow: 'rgba(148, 163, 184, 0.35)',
};

const BRONZE_STYLE: BarStyle = {
  gradient: 'linear-gradient(90deg, #C2410C 0%, #EA580C 60%, #FB923C 100%)',
  accent: '#EA580C',
  glow: 'rgba(234, 88, 12, 0.35)',
};

const CONFETTI_COLORS = ['#F59E0B', '#10B981', '#3B82F6', '#EC4899', '#8B5CF6', '#F43F5E'];

/** Mentimeter-style cute emoji avatars */
const AVATARS = ['🎂', '🍔', '🕵️', '🤔', '🐻', '🍩', '🎅', '🦁', '🐯', '🛸', '🚀', '🌟', '🍕', '🍉', '🍌', '🦀'];

function getAvatar(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  return AVATARS[Math.abs(hash) % AVATARS.length];
}

/** Participant bar styling - deterministic per participant with metallic gold/silver/bronze for top ranks */
function getBarStyle(participantId: string, rankIdx?: number): BarStyle {
  if (rankIdx === 0) return GOLD_STYLE;
  if (rankIdx === 1) return SILVER_STYLE;
  if (rankIdx === 2) return BRONZE_STYLE;
  let hash = 0;
  for (let i = 0; i < participantId.length; i++) hash += participantId.charCodeAt(i);
  return VIBRANT_GRADIENTS[Math.abs(hash) % VIBRANT_GRADIENTS.length];
}

/**
 * Counts a number up from `from` to `to` over `durationMs` milliseconds.
 * Starts only when `active` is true.
 */
function useCountUp(to: number, from: number, active: boolean, durationMs = 1300): number {
  const [value, setValue] = useState(from);
  const fromRef = useRef(from);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!active) {
      setValue(from);
      fromRef.current = from;
      return;
    }

    startRef.current = null;

    function tick(ts: number) {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(1, elapsed / durationMs);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(fromRef.current + (to - fromRef.current) * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [to, from, active, durationMs]);

  return value;
}

/** Individual Mentimeter racing row: Score on Left, Solid Bar in Middle, Avatar + Name at Tip */
function LbRow({
  entry,
  idx,
  initialRank,
  surgePhase,
  maxScore,
  isMe,
  prevScore,
  slotHeight,
  isProjector = false,
  rowRef,
}: {
  entry: LeaderboardEntry;
  idx: number;
  initialRank: number;
  surgePhase: 'initial' | 'surging' | 'settled';
  maxScore: number;
  isMe: boolean;
  prevScore: number;
  slotHeight: number;
  isProjector?: boolean;
  rowRef?: React.Ref<HTMLDivElement>;
}) {
  const isSurgingOrSettled = surgePhase !== 'initial';
  const animatedScore = useCountUp(entry.totalScore, prevScore, isSurgingOrSettled);

  // Bar length percentage
  const targetPct = maxScore > 0 ? (animatedScore / maxScore) * 100 : 0;
  const initialPct = maxScore > 0 ? (prevScore / maxScore) * 100 : 0;
  const rawBarPct = surgePhase === 'initial' ? initialPct : targetPct;
  // Scaled bar width so bar + avatar + name + badges never overflow the track
  const maxBarLengthPct = isProjector ? 64 : 44;
  const barPct = Math.max(3, (rawBarPct / 100) * maxBarLengthPct);

  const delta = entry.totalScore - prevScore;
  // Optional on the wire, so treat a missing value as "no streak" rather than
  // letting `undefined` reach the comparison.
  const streak = entry.streak ?? 0;
  const barStyle = getBarStyle(entry.participantId, idx);
  const color = barStyle.accent;
  const avatar = getAvatar(entry.name);
  const cleanedName = cleanText(entry.name);

  // Rank position change (0-indexed)
  const rankDelta = initialRank - idx; // positive = climbed!
  const hasClimbed = rankDelta > 0;

  // Vertical transform translation:
  // In 'initial', row sits at its previous vertical rank slot: (initialRank - idx) * slotHeight.
  // In 'surging' / 'settled', it transitions smoothly to 0px!
  const translateY = surgePhase === 'initial' ? rankDelta * slotHeight : 0;

  const rankBadge =
    surgePhase === 'settled'
      ? idx === 0
        ? '👑'
        : idx === 1
        ? '🥈'
        : idx === 2
        ? '🥉'
        : null
      : initialRank === 0
      ? '👑'
      : initialRank === 1
      ? '🥈'
      : initialRank === 2
      ? '🥉'
      : null;

  return (
    <div
      ref={rowRef}
      className={`menti-race-row${isMe ? ' menti-race-row--me' : ''}${
        idx === 0 ? ' menti-race-row--rank1' : ''
      }${hasClimbed && surgePhase === 'surging' ? ' menti-race-row--climbing' : ''}`}
      style={
        {
          transform: `translate3d(0, ${translateY}px, 0)`,
          transition:
            surgePhase === 'initial'
              ? 'none'
              : 'transform 1.3s cubic-bezier(0.2, 0.9, 0.3, 1.1)',
          zIndex: hasClimbed && surgePhase === 'surging' ? 10 : undefined,
        } as React.CSSProperties
      }
    >
      {/* 1. Score Column (Left) */}
      <div className="menti-race-score-col">
        {rankBadge && <span className="menti-race-medal">{rankBadge}</span>}
        <span className="menti-race-score">{animatedScore.toLocaleString()}</span>
        <span className="menti-race-unit">p</span>
      </div>

      {/* 2. Racing Track & Dynamic Vibrant Gradient Bar */}
      <div className="menti-race-track-wrap">
        <div
          className="menti-race-bar"
          style={{
            width: `${Math.max(2, barPct)}%`,
            background: barStyle.gradient,
            boxShadow: barStyle.glow ? `0 2px 12px ${barStyle.glow}` : undefined,
            transition:
              surgePhase === 'initial'
                ? 'none'
                : 'width 1.3s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Avatar and name cruising along the tip of the expanding bar */}
          <div className="menti-race-tip">
            <div className="menti-race-avatar" style={{ borderColor: color }}>
              <span aria-hidden="true">{avatar}</span>
            </div>
            <div className="menti-race-name-group">
              <span className="menti-race-name" title={cleanedName}>
                {cleanedName}
              </span>
              {isMe && <span className="menti-lb-you-badge">You</span>}
              {streak >= 3 && isSurgingOrSettled && (
                <span
                  className="menti-lb-streak-badge"
                  aria-label={`${streak} correct answers in a row`}
                >
                  🔥 {streak}x
                </span>
              )}
              {hasClimbed && isSurgingOrSettled && (
                <span className="menti-lb-climb-badge" aria-label={`Climbed ${rankDelta} spots`}>
                  ▲ +{rankDelta}
                </span>
              )}
              {delta > 0 && isSurgingOrSettled && (
                <span className="menti-race-delta" aria-label={`+${delta} points this round`}>
                  +{delta}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Olympic 3D Top 3 Podium */
function OlympicPodium({
  topEntries,
  myParticipantId,
}: {
  topEntries: LeaderboardEntry[];
  myParticipantId?: string;
}) {
  if (topEntries.length === 0) return null;

  const first = topEntries[0];
  const second = topEntries[1];
  const third = topEntries[2];

  const steps = [
    { entry: second, rank: 2, icon: '🥈', className: 'podium-step--2' },
    { entry: first, rank: 1, icon: '👑', className: 'podium-step--1' },
    { entry: third, rank: 3, icon: '🥉', className: 'podium-step--3' },
  ].filter((s) => Boolean(s.entry));

  return (
    <div className="olympic-podium-wrap">
      <div className="olympic-podium">
        {steps.map(({ entry, rank, icon, className }) => {
          if (!entry) return null;
          const cleaned = cleanText(entry.name);
          const avatar = getAvatar(entry.name);
          const isMe = entry.participantId === myParticipantId;
          const streak = entry.streak ?? 0;

          return (
            <div key={entry.participantId} className={`podium-step ${className}`}>
              <div className="podium-head">
                <span className="podium-badge-icon" role="img" aria-label={`Rank ${rank}`}>
                  {icon}
                </span>
                <div className="podium-avatar">
                  <span>{avatar}</span>
                </div>
                <span className="podium-name" title={cleaned}>
                  {cleaned} {isMe && '(You)'}
                </span>
                <span className="podium-score-pill">
                  {entry.totalScore.toLocaleString()} pts
                </span>
                {streak >= 3 && (
                  <span className="menti-lb-streak-badge" style={{ fontSize: '0.65rem' }}>
                    🔥 {streak}x
                  </span>
                )}
              </div>
              <div className="podium-pedestal">
                <span className="podium-rank-num">#{rank}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Authentic Mentimeter Racing Leaderboard
 * Matches Mentimeter's signature score-left, solid-bar-middle, avatar+name-at-tip layout.
 * Physical row overtaking with translateY spring physics.
 */
export default function Leaderboard({
  entries,
  prevEntries,
  myParticipantId,
  title = 'Leaderboard',
  subtitle,
  variant = 'compact',
  showAll = false,
  limit,
  celebrateKey,
  showPodium,
  isPodium,
  allowViewToggle = false,
}: Props) {
  const isProjector = variant === 'projector';
  const celebrated = useRef<string | number | undefined>(undefined);
  const firstRowRef = useRef<HTMLDivElement>(null);
  const [slotHeight, setSlotHeight] = useState(isProjector ? 56 : 40);

  // Dynamic View Mode: presenter can toggle between Racing Track and 3D Olympic Podium
  const [viewMode, setViewMode] = useState<'race' | 'podium'>(showPodium || isPodium ? 'podium' : 'race');

  useEffect(() => {
    if (showPodium || isPodium) {
      setViewMode('podium');
    }
  }, [showPodium, isPodium]);

  // Track surge animation phase: 'initial' (pre-animation) -> 'surging' (racing) -> 'settled'
  const [surgePhase, setSurgePhase] = useState<'initial' | 'surging' | 'settled'>('initial');

  // Map of participantId -> previous score
  const prevScoreMap = useMemo(() => {
    const map = new Map<string, number>();
    if (prevEntries && prevEntries.length > 0) {
      prevEntries.forEach((e) => map.set(e.participantId, e.totalScore));
    }
    return map;
  }, [prevEntries]);

  // Initial rank (0-indexed) before this round
  const initialRankMap = useMemo(() => {
    const map = new Map<string, number>();
    if (prevEntries && prevEntries.length > 0) {
      // Sort prevEntries by totalScore descending
      const sorted = [...prevEntries].sort((a, b) => b.totalScore - a.totalScore);
      sorted.forEach((e, i) => map.set(e.participantId, i));
    } else {
      // First round: everyone starts at their current index
      entries.forEach((e, i) => map.set(e.participantId, i));
    }
    return map;
  }, [entries, prevEntries]);

  // Measure actual row height dynamically
  useEffect(() => {
    if (firstRowRef.current) {
      const rect = firstRowRef.current.getBoundingClientRect();
      if (rect.height > 0) {
        setSlotHeight(rect.height + 10.4); // height + 0.65rem gap
      }
    }
  }, [entries.length, isProjector]);

  // Handle lively surge sequence:
  // 0.0s - 0.5s: 'initial' (DOM paints rows at previous rank slots without animation)
  // 0.5s - 2.0s: 'surging' (rows smoothly glide into new rank slots, scores count up)
  // 2.0s+: 'settled' (medals lock in, confetti bursts)
  useEffect(() => {
    setSurgePhase('initial');

    const surgeTimer = setTimeout(() => {
      setSurgePhase('surging');
    }, 500);

    const settleTimer = setTimeout(() => {
      setSurgePhase('settled');
    }, 2000);

    return () => {
      clearTimeout(surgeTimer);
      clearTimeout(settleTimer);
    };
  }, [celebrateKey, entries]);

  // Confetti when settled
  useEffect(() => {
    if (entries.length === 0) return;
    if (surgePhase !== 'settled') return;
    if (celebrated.current === celebrateKey) return;
    celebrated.current = celebrateKey;

    confetti({
      particleCount: 90,
      spread: 90,
      origin: { y: 0.5 },
      colors: CONFETTI_COLORS,
      disableForReducedMotion: true,
    });

    if (celebrateKey === 'final') {
      const end = Date.now() + 1500;
      const frame = () => {
        confetti({
          particleCount: 20,
          angle: 60,
          spread: 60,
          origin: { x: 0, y: 0.7 },
          colors: CONFETTI_COLORS,
        });
        confetti({
          particleCount: 20,
          angle: 120,
          spread: 60,
          origin: { x: 1, y: 0.7 },
          colors: CONFETTI_COLORS,
        });
        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };
      frame();
    }
  }, [celebrateKey, entries.length, surgePhase]);

  const visible = showAll
    ? entries
    : limit != null
    ? entries.slice(0, limit)
    : entries;

  const maxScore = Math.max(1, ...entries.map((e) => e.totalScore));

  if (entries.length === 0) {
    return (
      <p className="text-secondary text-center" style={{ padding: '2rem 0' }}>
        No scores yet. Responses will show up live!
      </p>
    );
  }

  const isPodiumMode = viewMode === 'podium';
  const topPodiumEntries = isPodiumMode ? visible.slice(0, 3) : [];
  const listEntries = isPodiumMode ? visible.slice(3) : visible;

  return (
    <div className={`menti-race-shell${isProjector ? ' menti-race-shell--projector' : ''}`}>
      {/* Title Header */}
      <div className="menti-race-header">
        <div className="menti-race-header-left">
          <h2 className="menti-race-title">{title}</h2>
          {subtitle && <p className="menti-race-subtitle">{subtitle}</p>}
        </div>

        <div className="menti-race-header-right">
          {allowViewToggle && entries.length > 0 && (
            <div className="menti-race-view-toggle">
              <button
                type="button"
                className={`menti-race-toggle-btn ${viewMode === 'race' ? 'is-active' : ''}`}
                onClick={() => setViewMode('race')}
                title="Racing track view"
              >
                🏁 Race
              </button>
              <button
                type="button"
                className={`menti-race-toggle-btn ${viewMode === 'podium' ? 'is-active' : ''}`}
                onClick={() => setViewMode('podium')}
                title="3D Olympic podium view"
              >
                🏆 Podium
              </button>
            </div>
          )}

          {myParticipantId ? (
            (() => {
              const me = entries.find((e) => e.participantId === myParticipantId);
              return me ? (
                <span className="menti-race-my-rank">
                  You&apos;re #{me.rank} of {entries.length}
                </span>
              ) : null;
            })()
          ) : (
            <div className="menti-race-live-chip">
              <span className="menti-stage-live-pulse" />
              <span>
                {entries.length} {entries.length === 1 ? 'Racer' : 'Racers'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Olympic 3D Podium for Top 3 */}
      {isPodiumMode && (
        <OlympicPodium
          topEntries={topPodiumEntries}
          myParticipantId={myParticipantId}
        />
      )}

      {/* Racing Rows List */}
      {listEntries.length > 0 && (
        <div className="menti-race-list">
          {listEntries.map((entry, idx) => {
            const actualIdx = isPodiumMode ? idx + 3 : idx;
            return (
              <LbRow
                key={entry.participantId}
                entry={entry}
                idx={actualIdx}
                initialRank={initialRankMap.get(entry.participantId) ?? actualIdx}
                surgePhase={surgePhase}
                maxScore={maxScore}
                isMe={entry.participantId === myParticipantId}
                prevScore={prevScoreMap.get(entry.participantId) ?? 0}
                slotHeight={slotHeight}
                isProjector={isProjector}
                rowRef={actualIdx === 0 ? firstRowRef : undefined}
              />
            );
          })}
        </div>
      )}

      {/* Leader spotlight when few participants in race view to eliminate awkward empty card void */}
      {viewMode === 'race' && entries.length > 0 && entries.length <= 4 && (
        <div className="menti-race-spotlight">
          <div className="menti-race-spotlight-item">
            <span className="menti-race-spotlight-icon">👑</span>
            <div className="menti-race-spotlight-text">
              <strong>{cleanText(entries[0].name)}</strong> is leading with{' '}
              <span className="menti-race-spotlight-pts">{entries[0].totalScore.toLocaleString()} pts</span>
            </div>
          </div>
          {entries[0].streak && entries[0].streak >= 2 ? (
            <div className="menti-race-spotlight-item">
              <span className="menti-race-spotlight-icon">🔥</span>
              <div className="menti-race-spotlight-text">
                On fire with <strong>{entries[0].streak} streak</strong>!
              </div>
            </div>
          ) : (
            <div className="menti-race-spotlight-item">
              <span className="menti-race-spotlight-icon">⚡</span>
              <div className="menti-race-spotlight-text">
                Every point counts · Stay sharp for the next round!
              </div>
            </div>
          )}
        </div>
      )}

      {!showAll && limit != null && entries.length > visible.length && (
        <p className="text-muted text-center" style={{ fontSize: '0.85rem', marginTop: '0.75rem' }}>
          +{entries.length - visible.length} more participants
        </p>
      )}
    </div>
  );
}
