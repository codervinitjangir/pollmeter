import { useEffect, useRef, useMemo, useState } from 'react';
import confetti from 'canvas-confetti';
import { LeaderboardEntry } from '../types';
import { cleanText } from '../cleanText';

interface Props {
  entries: LeaderboardEntry[];
  prevEntries?: LeaderboardEntry[];
  myParticipantId?: string;
  title?: string;
  variant?: 'projector' | 'compact';
  showPodium?: boolean;
  isPodium?: boolean;
  showAll?: boolean;
  limit?: number;
  celebrateKey?: string | number;
}

/** Authentic Mentimeter signature racing palette */
const MENTI_COLORS = [
  '#0D9488', // teal (Anjna)
  '#64748B', // slate gray (Shikha)
  '#FB7185', // salmon coral (Sunita)
  '#10B981', // emerald green (Anita)
  '#F472B6', // rose pink (Nalinder)
  '#F43F5E', // vivid pink (Lakshmi)
  '#F97316', // orange (Poonam)
  '#06B6D4', // bright cyan (Payal)
  '#FBBF24', // warm amber (Sorbjot)
  '#334155', // dark charcoal (Sujata)
  '#8B5CF6', // violet
  '#3B82F6', // royal blue
];

/** Mentimeter-style cute emoji avatars */
const AVATARS = ['🎂', '🍔', '🕵️', '🤔', '🐻', '🍩', '🎅', '🦁', '🐯', '🛸', '🚀', '🌟', '🍕', '🍉', '🍌', '🦀'];

function getAvatar(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  return AVATARS[Math.abs(hash) % AVATARS.length];
}

/** Participant color is bound to participant ID so their specific bar color stays with them as they move */
function getColor(participantId: string): string {
  let hash = 0;
  for (let i = 0; i < participantId.length; i++) hash += participantId.charCodeAt(i);
  return MENTI_COLORS[Math.abs(hash) % MENTI_COLORS.length];
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
  rowRef?: React.Ref<HTMLDivElement>;
}) {
  const isSurgingOrSettled = surgePhase !== 'initial';
  const animatedScore = useCountUp(entry.totalScore, prevScore, isSurgingOrSettled);

  // Bar length percentage
  const targetPct = maxScore > 0 ? (animatedScore / maxScore) * 100 : 0;
  const initialPct = maxScore > 0 ? (prevScore / maxScore) * 100 : 0;
  const barPct = surgePhase === 'initial' ? initialPct : targetPct;

  const delta = entry.totalScore - prevScore;
  const color = getColor(entry.participantId);
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
        hasClimbed && surgePhase === 'surging' ? ' menti-race-row--climbing' : ''
      }`}
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

      {/* 2. Racing Track & Dynamic Solid Color Bar */}
      <div className="menti-race-track-wrap">
        <div
          className="menti-race-bar"
          style={{
            width: `${Math.max(2, barPct)}%`,
            backgroundColor: color,
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
  variant = 'compact',
  showAll = false,
  limit,
  celebrateKey,
}: Props) {
  const isProjector = variant === 'projector';
  const celebrated = useRef<string | number | undefined>(undefined);
  const firstRowRef = useRef<HTMLDivElement>(null);
  const [slotHeight, setSlotHeight] = useState(isProjector ? 46 : 40);

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
      particleCount: 80,
      spread: 80,
      origin: { y: 0.5 },
      colors: MENTI_COLORS,
      disableForReducedMotion: true,
    });
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

  return (
    <div className={`menti-race-shell${isProjector ? ' menti-race-shell--projector' : ''}`}>
      {/* Title Header */}
      <div className="menti-race-header">
        <h2 className="menti-race-title">{title}</h2>
        {myParticipantId && (() => {
          const me = entries.find((e) => e.participantId === myParticipantId);
          return me ? (
            <span className="menti-race-my-rank">
              You&apos;re #{me.rank} of {entries.length}
            </span>
          ) : null;
        })()}
      </div>

      {/* Racing Rows List */}
      <div className="menti-race-list">
        {visible.map((entry, idx) => (
          <LbRow
            key={entry.participantId}
            entry={entry}
            idx={idx}
            initialRank={initialRankMap.get(entry.participantId) ?? idx}
            surgePhase={surgePhase}
            maxScore={maxScore}
            isMe={entry.participantId === myParticipantId}
            prevScore={prevScoreMap.get(entry.participantId) ?? 0}
            slotHeight={slotHeight}
            rowRef={idx === 0 ? firstRowRef : undefined}
          />
        ))}
      </div>

      {!showAll && limit != null && entries.length > visible.length && (
        <p className="text-muted text-center" style={{ fontSize: '0.85rem', marginTop: '0.75rem' }}>
          +{entries.length - visible.length} more participants
        </p>
      )}
    </div>
  );
}
