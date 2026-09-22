import { useEffect, useRef, useMemo } from 'react';
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
  /** How many rows below the podium to show. */
  limit?: number;
  /** Changes when a new leaderboard is revealed, so confetti fires once per reveal. */
  celebrateKey?: string | number;
}

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

export default function Leaderboard({
  entries,
  myParticipantId,
  title = 'Leaderboard',
  variant = 'compact',
  showPodium = false,
  isPodium = false,
  showAll = false,
  limit,
  celebrateKey,
}: Props) {
  const hasPodium = showPodium || isPodium;
  const isProjector = variant === 'projector' || hasPodium;
  const celebrated = useRef<string | number | undefined>(undefined);

  // Store previous ranks across question reveals to animate delta and rank cross-outs (Rule 8)
  const prevRanksRef = useRef<Map<string, number>>(new Map());

  const ranked = entries;
  const me = myParticipantId
    ? ranked.find((e) => e.participantId === myParticipantId)
    : undefined;

  // Compute rank changes: e.g. was 3, now 1 -> delta = +2 (climbed!)
  const rankDeltas = useMemo(() => {
    const map = new Map<string, { prevRank?: number; delta: number }>();
    for (const e of entries) {
      const prev = prevRanksRef.current.get(e.participantId);
      if (prev !== undefined) {
        map.set(e.participantId, { prevRank: prev, delta: prev - e.rank });
      } else {
        map.set(e.participantId, { delta: 0 });
      }
    }
    return map;
  }, [entries]);

  // Keep rank deltas visible during the question transition before updating ref
  useEffect(() => {
    if (entries.length > 0) {
      const timer = setTimeout(() => {
        prevRanksRef.current = new Map(entries.map((e) => [e.participantId, e.rank]));
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [entries]);

  useEffect(() => {
    if (!hasPodium || ranked.length === 0) return;
    if (celebrated.current === celebrateKey) return;
    celebrated.current = celebrateKey;

    confetti({
      particleCount: 70,
      spread: 70,
      origin: { y: 0.55 },
      colors: ['#1F69FF', '#10B981', '#F59E0B', '#F43F5E'],
      disableForReducedMotion: true,
    });
  }, [hasPodium, celebrateKey, ranked.length]);

  const top1 = ranked.find((e) => e.rank === 1);
  const top2 = ranked.find((e) => e.rank === 2);
  const top3 = ranked.find((e) => e.rank === 3);

  const podiumIds = new Set(
    [top1?.participantId, top2?.participantId, top3?.participantId].filter(Boolean)
  );

  const rest = hasPodium ? ranked.filter((e) => !podiumIds.has(e.participantId)) : ranked;
  const visible = showAll ? (hasPodium ? rest : ranked) : limit != null ? rest.slice(0, limit) : rest;
  const hiddenMe = me && !podiumIds.has(me.participantId) && !visible.some((e) => e.participantId === me.participantId);

  function renderRankBadge(participantId: string, currentRank: number) {
    const info = rankDeltas.get(participantId);
    if (!info || info.prevRank === undefined) {
      return <span className="lb-rank">{MEDALS[currentRank] ?? `#${currentRank}`}</span>;
    }

    if (info.prevRank !== currentRank) {
      return (
        <div className="rank-cut-box" title={`Moved from #${info.prevRank} to #${currentRank}`}>
          <span className="rank-prev-cut">#{info.prevRank}</span>
          <span className="rank-arrow">➔</span>
          <span className="rank-curr">{MEDALS[currentRank] ?? `#${currentRank}`}</span>
        </div>
      );
    }

    return <span className="lb-rank">{MEDALS[currentRank] ?? `#${currentRank}`}</span>;
  }

  function renderDeltaPill(participantId: string) {
    const info = rankDeltas.get(participantId);
    if (!info || info.prevRank === undefined) {
      return <span className="rank-delta rank-delta--new">NEW</span>;
    }
    if (info.delta > 0) {
      return (
        <span className="rank-delta rank-delta--up" title={`Climbed ${info.delta} places!`}>
          ▲ +{info.delta}
        </span>
      );
    }
    if (info.delta < 0) {
      return (
        <span className="rank-delta rank-delta--down" title={`Dropped ${Math.abs(info.delta)} places`}>
          ▼ {info.delta}
        </span>
      );
    }
    return <span className="rank-delta rank-delta--same">—</span>;
  }

  return (
    <div className={`stack stack-5 ${isProjector ? 'projector-leaderboard' : ''}`}>
      <div className="row row-2" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="t-headline" style={{ fontSize: isProjector ? '1.75rem' : '1.35rem' }}>
          {title}
        </h2>
        {me && (
          <span className="badge badge-primary">
            You&rsquo;re #{me.rank} of {ranked.length}
          </span>
        )}
      </div>

      {/* 3-Step Podium for Top 3 */}
      {hasPodium && (top1 || top2 || top3) && (
        <div className="podium-wrap">
          <div className="podium-stage">
            {/* 2nd place (Left) */}
            {top2 ? (
              <div className={`podium-col second ${top2.participantId === myParticipantId ? 'is-me' : ''}`}>
                <div className="podium-avatar">🥈</div>
                <p className="podium-name" title={top2.name}>{top2.name}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', margin: '2px 0' }}>
                  {renderDeltaPill(top2.participantId)}
                </div>
                <div className="podium-block block-2">
                  <span className="podium-rank-num">2</span>
                  <span className="podium-score-num">{top2.totalScore.toLocaleString()} pts</span>
                </div>
              </div>
            ) : (
              <div className="podium-col second" style={{ opacity: 0.2 }}>
                <div className="podium-block block-2" style={{ height: '70px' }} />
              </div>
            )}

            {/* 1st place (Center, Tallest) */}
            {top1 ? (
              <div className={`podium-col first ${top1.participantId === myParticipantId ? 'is-me' : ''}`}>
                <span className="podium-crown" aria-hidden="true">👑</span>
                <div className="podium-avatar first-avatar">🥇</div>
                <p className="podium-name" title={top1.name} style={{ fontWeight: 800, fontSize: '1.05rem' }}>
                  {top1.name}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', margin: '2px 0' }}>
                  {renderDeltaPill(top1.participantId)}
                </div>
                <div className="podium-block block-1">
                  <span className="podium-rank-num">1</span>
                  <span className="podium-score-num">{top1.totalScore.toLocaleString()} pts</span>
                </div>
              </div>
            ) : (
              <div className="podium-col first" style={{ opacity: 0.2 }}>
                <div className="podium-block block-1" style={{ height: '90px' }} />
              </div>
            )}

            {/* 3rd place (Right) */}
            {top3 ? (
              <div className={`podium-col third ${top3.participantId === myParticipantId ? 'is-me' : ''}`}>
                <div className="podium-avatar">🥉</div>
                <p className="podium-name" title={top3.name}>{top3.name}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', margin: '2px 0' }}>
                  {renderDeltaPill(top3.participantId)}
                </div>
                <div className="podium-block block-3">
                  <span className="podium-rank-num">3</span>
                  <span className="podium-score-num">{top3.totalScore.toLocaleString()} pts</span>
                </div>
              </div>
            ) : (
              <div className="podium-col third" style={{ opacity: 0.2 }}>
                <div className="podium-block block-3" style={{ height: '50px' }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Participant List (All or Ranks 4+) */}
      {visible.length > 0 && (
        <div className="leaderboard">
          {visible.map((entry) => (
            <div
              key={entry.participantId}
              className={`lb-row ${
                entry.rank === 1 ? 'top-1' : entry.rank === 2 ? 'top-2' : entry.rank === 3 ? 'top-3' : ''
              } ${entry.participantId === myParticipantId ? 'is-me' : ''}`}
            >
              {renderRankBadge(entry.participantId, entry.rank)}
              <span className="lb-name">
                {entry.name}
                {entry.participantId === myParticipantId && (
                  <span className="badge badge-neutral" style={{ marginLeft: '0.4rem', fontSize: '0.7rem' }}>
                    You
                  </span>
                )}
              </span>
              {renderDeltaPill(entry.participantId)}
              <span className="lb-meta">{entry.correctAnswers} correct</span>
              <span className="lb-score">{entry.totalScore.toLocaleString()} pts</span>
            </div>
          ))}
        </div>
      )}

      {/* Detached personal row if current participant is hidden below fold */}
      {hiddenMe && me && (
        <div className="stack stack-2">
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>⋯</div>
          <div className="lb-row is-me">
            {renderRankBadge(me.participantId, me.rank)}
            <span className="lb-name">
              {me.name}
              <span className="badge badge-primary" style={{ marginLeft: '0.4rem', fontSize: '0.7rem' }}>
                You
              </span>
            </span>
            {renderDeltaPill(me.participantId)}
            <span className="lb-meta">{me.correctAnswers} correct</span>
            <span className="lb-score">{me.totalScore.toLocaleString()} pts</span>
          </div>
        </div>
      )}

      {ranked.length === 0 && (
        <p className="text-secondary text-center" style={{ padding: '2rem 0' }}>
          No scores yet. Responses will show up live!
        </p>
      )}

      {!showAll && limit != null && rest.length > visible.length && !hiddenMe && (
        <p className="text-muted text-center" style={{ fontSize: '0.85rem' }}>
          +{rest.length - visible.length} more participants in classroom
        </p>
      )}
    </div>
  );
}
