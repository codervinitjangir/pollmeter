import { useEffect, useRef, useMemo, useState } from 'react';
import confetti from 'canvas-confetti';
import { LeaderboardEntry } from '../types';

interface Props {
  entries: LeaderboardEntry[];
  myParticipantId?: string;
  title?: string;
  variant?: 'projector' | 'compact';
  showPodium?: boolean;
  isPodium?: boolean;
  showAll?: boolean;
  limit?: number;
  celebrateKey?: string | number;
}

/** Stable vibrant palette — one color per participant, cycling if > 10. */
const PARTICIPANT_COLORS = [
  '#38BDF8', // aqua
  '#F43F5E', // coral
  '#34D399', // mint
  '#FBBF24', // gold
  '#A78BFA', // violet
  '#FB923C', // tangerine
  '#60A5FA', // blue
  '#F472B6', // pink
  '#4ADE80', // green
  '#FCA5A5', // salmon
];

/** Deterministic avatar per name. */
const AVATARS = ['🛸', '👽', '🔥', '🦀', '🥸', '🍌', '🍉', '🍄', '😍', '📎', '🦁', '🐯', '🚀', '🌟', '🍕'];

function getAvatar(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  return AVATARS[Math.abs(hash) % AVATARS.length];
}

function getColor(idx: number): string {
  return PARTICIPANT_COLORS[idx % PARTICIPANT_COLORS.length];
}

/**
 * Counts a number up from `from` to `to` over `durationMs` milliseconds.
 * Starts only when `active` is true.
 */
function useCountUp(to: number, from: number, active: boolean, durationMs = 1500): number {
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

/** Individual leaderboard row with animated score, dynamic transform translation, and bar. */
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
  const barPct = maxScore > 0 ? (animatedScore / maxScore) * 100 : 0;
  const delta = entry.totalScore - prevScore;
  const color = getColor(idx);
  const avatar = getAvatar(entry.name);

  // Position change calculation:
  // initialRank is 0-indexed rank before this question
  // idx is final 0-indexed rank
  const rankDelta = initialRank - idx; // positive means climbed ranks!
  const hasClimbed = rankDelta > 0;

  // When 'initial', row is translated to its previous vertical slot:
  // (initialRank - idx) * slotHeight.
  // When 'surging' or 'settled', it transitions to 0px!
  const translateY = surgePhase === 'initial' ? rankDelta * slotHeight : 0;

  // Display rank:
  // In 'initial', show previous rank (initialRank + 1)
  // In 'settled', show crowns/medals or final rank
  // In 'surging', if climbed, show current position or climb badge
  const displayRank =
    surgePhase === 'settled'
      ? idx === 0
        ? '👑'
        : idx === 1
        ? '🥈'
        : idx === 2
        ? '🥉'
        : `#${idx + 1}`
      : `#${initialRank + 1}`;

  return (
    <div
      ref={rowRef}
      className={`menti-lb-row${isMe ? ' menti-lb-row--me' : ''}${
        surgePhase === 'settled' && idx < 3 ? ` menti-lb-row--top${idx + 1}` : ''
      }${hasClimbed && surgePhase === 'surging' ? ' menti-lb-row--climbing' : ''}`}
      style={
        {
          '--lb-color': color,
          transform: `translate3d(0, ${translateY}px, 0)`,
          zIndex: hasClimbed && surgePhase === 'surging' ? 5 : undefined,
        } as React.CSSProperties
      }
    >
      {/* Rank */}
      <span className="menti-lb-rank">
        {displayRank}
      </span>

      {/* Avatar */}
      <span className="menti-lb-avatar" aria-hidden="true">
        {avatar}
      </span>

      {/* Name + bar */}
      <div className="menti-lb-body">
        <div className="menti-lb-name-row">
          <span className="menti-lb-name" title={entry.name}>
            {entry.name}
            {isMe && <span className="menti-lb-you-badge">You</span>}
            {hasClimbed && isSurgingOrSettled && (
              <span className="menti-lb-climb-badge" aria-label={`Climbed ${rankDelta} spots`}>
                ▲ +{rankDelta}
              </span>
            )}
          </span>
          <div className="menti-lb-score-wrap">
            <span className="menti-lb-score" style={{ color }}>
              {animatedScore.toLocaleString()}
            </span>
            {delta > 0 && (
              <span className="menti-lb-delta" aria-label={`+${delta} points this round`}>
                +{delta}
              </span>
            )}
          </div>
        </div>
        {/* Bar expanding as score counts up */}
        <div className="menti-lb-track" aria-hidden="true">
          <div
            className="menti-lb-bar"
            style={{
              width: `${barPct}%`,
              background: `linear-gradient(90deg, ${color} 0%, ${color}bb 100%)`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Racing leaderboard — Mentimeter style.
 *
 * Each participant has:
 *  - A stable vibrant color
 *  - An emoji avatar derived from their name
 *  - An animated score that counts up from the previous value
 *  - A horizontal bar that expands in sync with the count-up
 *  - A +XYZ delta chip showing points gained this round
 *  - Smooth, dynamic overtaking rank animation (gliding rows)
 */
export default function Leaderboard({
  entries,
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
  const [slotHeight, setSlotHeight] = useState(isProjector ? 62 : 54);

  // Track surge animation phase: 'initial' (pre-animation) -> 'surging' (racing) -> 'settled'
  const [surgePhase, setSurgePhase] = useState<'initial' | 'surging' | 'settled'>('initial');

  // Track previous totals for delta calculation and count-up animation origin.
  const prevTotalsRef = useRef<Map<string, number>>(new Map());

  // Capture prev scores BEFORE entries update so count-up starts from the right place.
  const prevTotalsSnapshot = useMemo(() => {
    return new Map(prevTotalsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  // Compute initial ranks from previous scores
  const initialRankMap = useMemo(() => {
    const map = new Map<string, number>();
    // Sort all entries by prevScore descending
    const sorted = [...entries].sort((a, b) => {
      const scoreA = prevTotalsSnapshot.get(a.participantId) ?? 0;
      const scoreB = prevTotalsSnapshot.get(b.participantId) ?? 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return a.participantId.localeCompare(b.participantId);
    });
    sorted.forEach((e, i) => map.set(e.participantId, i));
    return map;
  }, [entries, prevTotalsSnapshot]);

  // Measure actual row height dynamically
  useEffect(() => {
    if (firstRowRef.current) {
      const rect = firstRowRef.current.getBoundingClientRect();
      if (rect.height > 0) {
        setSlotHeight(rect.height + 8); // height + 0.5rem gap
      }
    }
  }, [entries.length, isProjector]);

  // Handle lively surge sequence: 0.0s - 0.5s initial, 0.5s - 2.0s surging, 2.0s+ settled
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

  // Update the ref AFTER animation so next question has this question's final scores as baseline
  useEffect(() => {
    const timer = setTimeout(() => {
      prevTotalsRef.current = new Map(entries.map((e) => [e.participantId, e.totalScore]));
    }, 3500);
    return () => clearTimeout(timer);
  }, [entries]);

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
      colors: ['#38BDF8', '#F43F5E', '#34D399', '#FBBF24', '#A78BFA', '#FB923C'],
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
    <div className={`menti-lb-shell${isProjector ? ' menti-lb-shell--projector' : ''}`}>
      {/* Title */}
      <div className="menti-lb-header">
        <h2 className="menti-lb-title">{title}</h2>
        {myParticipantId && (() => {
          const me = entries.find((e) => e.participantId === myParticipantId);
          return me ? (
            <span className="menti-lb-my-rank">
              You&apos;re #{me.rank} of {entries.length}
            </span>
          ) : null;
        })()}
      </div>

      {/* Rows */}
      <div className="menti-lb-list">
        {visible.map((entry, idx) => (
          <LbRow
            key={entry.participantId}
            entry={entry}
            idx={idx}
            initialRank={initialRankMap.get(entry.participantId) ?? idx}
            surgePhase={surgePhase}
            maxScore={maxScore}
            isMe={entry.participantId === myParticipantId}
            prevScore={prevTotalsSnapshot.get(entry.participantId) ?? 0}
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
