import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Question,
  SessionPhase,
  Participant,
  AggregatedResult,
  McqAggregated,
  TextAggregated,
  LeaderboardEntry,
  SessionEndedPayload,
} from '../../types';
import LiveBarChart from '../../components/LiveBarChart';
import TextResponseList from '../../components/TextResponseList';
import CountdownTimer from '../../components/CountdownTimer';
import Leaderboard, { OlympicPodium, fire4CornerFireworks } from '../../components/Leaderboard';
import { cleanText } from '../../cleanText';
import { getAvatar } from '../../utils/avatars';
import { toggleTheme, Theme } from '../../theme';

export interface LiveSessionRoomProps {
  code: string;
  phase: SessionPhase;
  participants: Participant[];
  showRoster: boolean;
  setShowRoster: React.Dispatch<React.SetStateAction<boolean>>;
  joinAlerts: { id: string; name: string }[];
  currentQuestion: Question | null;
  currentIndex: number;
  questionCount: number;
  results: AggregatedResult | null;
  answeredCount: number;
  correctAnswer: string | undefined;
  timer: {
    endsAt: number;
    durationSeconds: number;
    startedAt?: number;
    unlocksAt?: number | null;
    readTimeSeconds?: number | null;
  } | null;
  leaderboard: LeaderboardEntry[];
  prevLeaderboard: LeaderboardEntry[];
  finalData: SessionEndedPayload | null;
  reactions: Array<{ id: string; emoji: string; left: number; drift: number; duration: number }>;
  isReviewMode: boolean;
  resultsAdvance: number;
  resultsPaused: boolean;
  setResultsPaused: React.Dispatch<React.SetStateAction<boolean>>;
  autoAdvanceEnabled: boolean;
  setAutoAdvanceEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  autoAdvance: number;
  autoPaused: boolean;
  setAutoPaused: React.Dispatch<React.SetStateAction<boolean>>;
  readSecondsLeft: number;
  isReadingTime: boolean;
  lanIp: string;
  copied: boolean;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  hostTheme: Theme;
  setHostTheme: (theme: Theme) => void;
  muted: boolean;
  toggleSound: () => void;
  error: string;
  start: () => void;
  lockAnswers: () => void;
  showLeaderboard: () => void;
  next: () => void;
  previous: () => void;
  extendTime: (seconds: number) => void;
  endSession: () => void;
  newSession: () => void;
  copyJoinLink: () => void;
  exportResultsCsv: () => void;
}

export default function LiveSessionRoom(props: LiveSessionRoomProps) {
  const {
    code,
    phase,
    participants,
    showRoster,
    setShowRoster,
    joinAlerts,
    currentQuestion,
    currentIndex,
    questionCount,
    results,
    answeredCount,
    correctAnswer,
    timer,
    leaderboard,
    prevLeaderboard,
    finalData,
    reactions,
    isReviewMode,
    resultsAdvance,
    resultsPaused,
    setResultsPaused,
    autoAdvanceEnabled,
    setAutoAdvanceEnabled,
    autoAdvance,
    autoPaused,
    setAutoPaused,
    readSecondsLeft,
    isReadingTime,
    lanIp,
    copied,
    isFullscreen,
    toggleFullscreen,
    hostTheme,
    setHostTheme,
    muted,
    toggleSound,
    error,
    start,
    lockAnswers,
    showLeaderboard,
    next,
    previous,
    extendTime,
    endSession,
    newSession,
    copyJoinLink,
    exportResultsCsv,
  } = props;

  const port = window.location.port ? `:${window.location.port}` : '';
  const joinHost =
    lanIp && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? `${lanIp}${port}`
      : window.location.host;
  const joinUrl = `${window.location.protocol}//${joinHost}/join?code=${code}`;


  const connectedCount = participants.filter((p) => p.connected).length;
  const isLastQuestion = currentIndex >= questionCount - 1;
  const everyoneAnswered = connectedCount > 0 && answeredCount >= connectedCount;

  const sessionNav = (
    <nav className="menti-stage-nav">
      {/* Brand */}
      <span className="menti-stage-nav-brand">
        <svg width="22" height="22" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 9H11V27H6V9Z" fill="#fff" />
          <rect x="14" y="14" width="5" height="13" rx="1" fill="#F43F5E" />
          <rect x="22" y="7" width="5" height="20" rx="1" fill="#38BDF8" />
        </svg>
        <span>PollMeter</span>
      </span>

      {/* Centre join hint */}
      <div className="menti-stage-nav-join">
        <span>Go to </span>
        <strong>{joinHost}/join</strong>
        <span> and use code </span>
        <strong className="menti-stage-nav-code">{code}</strong>
      </div>

      {/* Right controls */}
      <div className="menti-stage-nav-right">
        {phase === 'ended' ? (
          <button
            className="btn btn-primary btn--sm"
            onClick={newSession}
            id="nav-new-quiz-btn"
            style={{ fontWeight: 700, padding: '0.45rem 1rem', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: '8px' }}
          >
            + Start New Quiz
          </button>
        ) : (
          <span className="menti-stage-live-dot" aria-label="Live session">
            <span className="menti-stage-live-pulse" />
            Live
          </span>
        )}
        <span className="menti-stage-chip">👥 {connectedCount}</span>
        {questionCount > 0 && phase !== 'lobby' && (
          <span className="menti-stage-chip">Q {currentIndex + 1}/{questionCount}</span>
        )}
        {phase === 'question' && (
          <span className={`menti-stage-chip menti-stage-chip--tally${everyoneAnswered ? ' menti-stage-chip--complete' : ''}`}>
            {everyoneAnswered ? '✔ All answered' : `${answeredCount}/${connectedCount || '—'} answered`}
          </span>
        )}
        <button
          className="menti-stage-btn-ghost"
          onClick={() => setHostTheme(toggleTheme())}
          id="stage-theme-toggle-btn"
          title={hostTheme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          aria-label="Toggle theme"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
        >
          <span>{hostTheme === 'dark' ? '☀️' : '🌙'}</span>
          <span>{hostTheme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
        <button
          className="menti-stage-btn-ghost"
          onClick={toggleFullscreen}
          id="fullscreen-btn"
          title={isFullscreen ? 'Exit fullscreen' : 'Enter projector mode'}
        >
          {isFullscreen ? '✕ Exit' : '⛶ Projector'}
        </button>
      </div>
    </nav>
  );
  // ─── Lobby ────────────────────────────────────────────────────────────────
  if (phase === 'lobby') return (
    <div className="page page--stage page--stage-lobby">
      {sessionNav}
      <main className="stage-main stage-lobby-main">
        <div className="menti-lobby-grid">
          {/* Left Column: Instructions, Big Code, Participants & Start button */}
          <div className="menti-lobby-left">
            <div className="menti-lobby-header">
              <span className="badge badge-primary menti-lobby-badge">✨ Live Classroom Quiz</span>
              <h1 className="menti-lobby-title">Ready when you are!</h1>
              <p className="menti-lobby-subtitle">
                Students can scan the QR code with their phone camera or join on a laptop:
              </p>
            </div>

            {/* Join Details Box */}
            <div className="menti-lobby-code-box">
              <div className="menti-lobby-url-row">
                <span className="menti-lobby-step-num">1</span>
                <span>Go to <strong>{joinHost}/join</strong></span>
              </div>
              <div className="menti-lobby-code-row">
                <span className="menti-lobby-step-num">2</span>
                <span>Enter code:</span>
                <span className="menti-lobby-code-val" aria-label={`Session code ${code}`}>
                  {code.slice(0, 3)} {code.slice(3)}
                </span>
                <button
                  className="btn btn-secondary btn--sm menti-lobby-copy-btn"
                  onClick={copyJoinLink}
                  id="copy-link-btn"
                  title="Copy direct join link"
                >
                  {copied ? '✓ Copied!' : '📋 Copy link'}
                </button>
              </div>
            </div>

            {/* Connected Participants Tally & Avatars */}
            <div className="menti-lobby-participants-box">
              <div className="menti-lobby-participants-header">
                <span className="t-label-md">👥 In the room</span>
                <span className="badge badge-primary">{participants.length}</span>
              </div>
              <div className="menti-lobby-participants-list">
                {participants.length === 0 ? (
                  <div className="menti-lobby-waiting">
                    <span className="spinner spinner--sm" />
                    <span>Waiting for students to join with code <strong>{code}</strong>…</span>
                  </div>
                ) : (
                  <div className="menti-lobby-chips-wrap">
                    {participants.map((p) => (
                      <span
                        key={p.id}
                        className="menti-lobby-chip"
                        style={{ opacity: p.connected ? 1 : 0.6 }}
                      >
                        <span style={{ marginRight: '0.35rem' }}>{getAvatar(p.name)}</span> {p.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {error && <div className="alert alert-error">⚠ {error}</div>}

            {/* Launch Action Bar */}
            <div className="menti-lobby-actions">
              <button className="btn btn-ghost" onClick={newSession} id="back-builder-btn">
                ← Back to builder
              </button>
              <button
                className="btn btn-success btn--lg menti-lobby-start-btn"
                onClick={start}
                id="start-session-btn"
              >
                ▶ Start Quiz · {questionCount} question{questionCount === 1 ? '' : 's'}
              </button>
            </div>
          </div>

          {/* Right Column: QR Code Card */}
          <div className="menti-lobby-right">
            <div className="menti-lobby-qr-card">
              <div className="menti-lobby-qr-frame">
                <QRCodeSVG
                  value={joinUrl}
                  size={195}
                  level="M"
                  marginSize={2}
                  bgColor="#ffffff"
                  fgColor="#0F172A"
                  style={{ width: '100%', height: 'auto', maxWidth: '195px', maxHeight: '195px' }}
                />
              </div>
              <div className="menti-lobby-qr-caption">
                <span>📱 Scan with your phone camera to join instantly</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );

  // ─── Ended ────────────────────────────────────────────────────────────────
  if (phase === 'ended') return (
    <div className="page page--ended">
      {sessionNav}
      <div className="main-content" style={{ padding: '1.25rem 1.5rem 3rem' }}>
        <div className="container--showcase">
          <div className="stack stack-6">
            {/* Sleek, compact celebration banner */}
            <div className="final-standings-bar">
              <div className="final-standings-title-wrap">
                <span
                  className="final-standings-crown"
                  onClick={fire4CornerFireworks}
                  role="button"
                  title="Click to launch celebration fireworks! 🎉"
                  style={{ cursor: 'pointer' }}
                >
                  👑
                </span>
                <div>
                  <h1 className="final-standings-heading">Final Standings</h1>
                  <p className="final-standings-subtitle">
                    {finalData?.questions.length ?? questionCount} questions · {leaderboard.length} students
                  </p>
                </div>
              </div>
              <div className="final-standings-btns">
                <button
                  className="btn btn-primary"
                  onClick={newSession}
                  id="top-new-quiz-btn"
                  style={{ fontWeight: 700, padding: '0.55rem 1.4rem', borderRadius: '10px' }}
                >
                  ✨ Start New Quiz
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={exportResultsCsv}
                  id="top-export-csv-btn"
                  style={{ fontWeight: 600, padding: '0.55rem 1.2rem', borderRadius: '10px' }}
                >
                  📥 Export CSV
                </button>
              </div>
            </div>

            {/* 2-Column Full-Page Showcase: Left = Top 3 3D Podium, Right = Top 10 Horizontal Racing Bars */}
            <div className="final-showcase-grid">
              {/* Left Column: 3D Olympic Podium */}
              <div className="final-showcase-card final-showcase-card--podium">
                <div className="final-showcase-card-header">
                  <div className="final-showcase-card-header-left">
                    <span className="final-showcase-icon">🏆</span>
                    <h2 className="final-showcase-card-title">Top 3 Champions</h2>
                  </div>
                  <span className="final-showcase-badge final-showcase-badge--gold">Podium</span>
                </div>
                <div className="final-showcase-podium-body">
                  <OlympicPodium
                    topEntries={leaderboard.slice(0, 3)}
                    showWinnerCard={true}
                  />
                </div>
              </div>

              {/* Right Column: Top 10 Horizontal Racing Bars */}
              <div className="final-showcase-card final-showcase-card--bars">
                <div className="final-showcase-card-header">
                  <div className="final-showcase-card-header-left">
                    <span className="final-showcase-icon">🏁</span>
                    <h2 className="final-showcase-card-title">Top 10 Leaderboard</h2>
                  </div>
                  <span className="final-showcase-badge final-showcase-badge--blue">
                    {Math.min(10, leaderboard.length)} Racers
                  </span>
                </div>
                <div className="final-showcase-bars-body">
                  <Leaderboard
                    entries={leaderboard}
                    prevEntries={prevLeaderboard}
                    variant="projector"
                    limit={10}
                    title=""
                    celebrateKey="final"
                    isFinal={true}
                  />
                </div>
              </div>
            </div>

            {/* Question Breakdown Section - 2 cards per row */}
            {finalData?.questions && finalData.questions.length > 0 && (
              <div className="final-questions-section">
                <div className="final-questions-header">
                  <div className="final-questions-header-left">
                    <span className="final-questions-icon">📊</span>
                    <h2 className="final-questions-title">Questions Review</h2>
                  </div>
                  <span className="final-questions-count">
                    {finalData.questions.length} question{finalData.questions.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="final-questions-grid">
                  {finalData.questions.map((q, idx) => {
                    const agg = finalData.finalResults[q.id];
                    if (!agg) return null;
                    return (
                      <div key={q.id} className="final-question-card stack stack-3">
                        <div className="final-question-card-head">
                          <span className="badge badge-neutral t-label-sm">Q{idx + 1}</span>
                          <p className="final-question-text">{cleanText(q.text)}</p>
                        </div>
                        <hr className="divider" style={{ margin: '0.25rem 0 0.5rem' }} />
                        <div className="final-question-chart-wrap">
                          {q.type === 'mcq' ? (
                            <LiveBarChart aggregated={agg as McqAggregated} correctAnswer={q.correctAnswer} />
                          ) : (
                            <TextResponseList responses={agg as TextAggregated} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="host-bar">
              <button className="btn btn-secondary btn--lg" onClick={exportResultsCsv} id="export-csv-btn">
                📥 Export CSV
              </button>
              <button
                className="btn btn-ghost"
                onClick={toggleSound}
                title={muted ? 'Unmute sound effects' : 'Mute sound effects'}
                aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
                aria-pressed={!muted}
                id="mute-btn-final"
              >
                {muted ? '🔇' : '🔊'}
              </button>
              <div className="host-bar-spacer" />
              <button className="btn btn-primary btn--lg" onClick={newSession} id="new-session-btn">
                + New quiz
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ─── Live stage: question / results / leaderboard ─────────────────────────
  const gradedAndOpen = phase === 'question' && Boolean(currentQuestion?.correctAnswer);

  return (
    <div className="page page--stage">
      {sessionNav}

      <main className="stage-main">
        {/* Slim progress strip */}
        <div className="stage-progress-strip">
          <div className="stage-progress-labels">
            <span className="stage-progress-q">
              Question {currentIndex + 1} of {questionCount}
            </span>
            <span className="stage-progress-rem">
              {Math.max(0, questionCount - currentIndex - 1)} to go
            </span>
          </div>
          <div className="stage-progress-bar">
            <div
              className="stage-progress-fill"
              style={{ width: `${questionCount ? ((currentIndex + 1) / questionCount) * 100 : 0}%` }}
            />
          </div>
        </div>

        {phase === 'leaderboard' ? (
          <div className="stage-lb-wrap">
            {/* Correct answer reveal banner */}
            {correctAnswer && (
              <div className="menti-correct-banner">
                <span className="menti-correct-icon" aria-hidden="true">✔</span>
                <span>Correct answer: <strong>{cleanText(correctAnswer)}</strong></span>
              </div>
            )}
            {/* Racing leaderboard */}
            <div className="menti-stage-card stage-lb-card">
              <Leaderboard
                entries={leaderboard}
                prevEntries={prevLeaderboard}
                variant="projector"
                limit={10}
                showPodium={false}
                title={`⚡ Standings · Question ${currentIndex + 1} of ${questionCount}`}
                subtitle="Top 10 Leaders · Faster responses score higher"
                celebrateKey={currentIndex}
              />
            </div>
          </div>
        ) : (
          currentQuestion && (
            <div className="menti-stage-card">
              {/* ─── Question header ─── */}
              <div className="menti-stage-q-header">
                <div className="menti-stage-q-body">
                  <div className="row row-2" style={{ alignItems: 'center' }}>
                    <span className="menti-stage-q-num">
                      Question {currentIndex + 1} of {questionCount}
                    </span>
                    {isReadingTime && (
                      <span className="badge badge-primary menti-read-badge">
                        📖 Reading Time ({readSecondsLeft}s)
                      </span>
                    )}
                  </div>
                  <h1 className="menti-stage-question">{cleanText(currentQuestion.text)}</h1>
                </div>
                {/* Countdown timer */}
                {phase === 'question' && timer && (
                  <div className="menti-stage-timer-wrap">
                    <CountdownTimer
                      endsAt={timer.endsAt}
                      unlocksAt={timer.unlocksAt}
                      startedAt={timer.startedAt}
                      durationSeconds={timer.durationSeconds}
                      size={82}
                    />
                  </div>
                )}
                {/* Results phase — no timer, show answered count */}
                {phase === 'results' && (
                  <div className="menti-stage-reveal-badge">
                    <span aria-hidden="true">👁</span> Results revealed
                  </div>
                )}
              </div>

              <div className="menti-stage-divider" />

              {/* ─── Content area ─── */}
              {isReadingTime ? (
                <div className="menti-stage-reading-card">
                  <div className="menti-stage-reading-badge">
                    <span className="menti-stage-reading-icon">📖</span>
                    <span>READ THE QUESTION</span>
                  </div>
                  <h2 className="menti-stage-reading-title">
                    Options unlock in <span className="menti-stage-reading-num">{readSecondsLeft}s</span>
                  </h2>
                  <p className="menti-stage-reading-sub">
                    Focus on the question. Options will appear here and on your phones shortly!
                  </p>
                  <div className="menti-stage-reading-dots">
                    <span className="reading-dot" />
                    <span className="reading-dot" />
                    <span className="reading-dot" />
                  </div>
                </div>
              ) : currentQuestion.type === 'mcq' ? (
                gradedAndOpen && results == null ? (
                  /* Scored question: show colorful option cards while hidden */
                  <div className="menti-stage-options">
                    {(currentQuestion.options ?? []).map((opt, idx) => {
                      const COLORS = ['#38BDF8','#F43F5E','#34D399','#FBBF24','#A78BFA','#FB923C'];
                      const color = COLORS[idx % COLORS.length];
                      const LETTERS = ['A','B','C','D','E','F'];
                      return (
                        <div
                          key={opt}
                          className="menti-stage-opt-card"
                          style={{
                            background: hostTheme === 'dark' ? '#151518' : `${color}18`,
                            borderColor: hostTheme === 'dark' ? `${color}70` : `${color}60`,
                            '--opt-color': color,
                          } as React.CSSProperties}
                        >
                          <span
                            className="menti-stage-opt-letter"
                            style={{ background: color }}
                          >
                            {LETTERS[idx] ?? idx + 1}
                          </span>
                          <span className="menti-stage-opt-text">{cleanText(opt)}</span>
                        </div>
                      );
                    })}
                    {/* Hidden tally */}
                    <div className="menti-stage-hidden-tally">
                      <span className="menti-stage-hidden-icon" aria-hidden="true">🔒</span>
                      <span>{answeredCount} student{answeredCount === 1 ? '' : 's'} answered — results hidden until closed</span>
                    </div>
                  </div>
                ) : (
                  /* Poll open OR results revealed — show column chart */
                  <LiveBarChart
                    aggregated={(results ?? {}) as McqAggregated}
                    correctAnswer={phase === 'results' ? correctAnswer : undefined}
                    variant="projector"
                  />
                )
              ) : (
                <TextResponseList
                  responses={Array.isArray(results) ? (results as TextAggregated) : []}
                  variant="projector"
                />
              )}
            </div>
          )
        )}

        {error && <div className="alert alert-error" style={{ margin: 0, padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>⚠ {error}</div>}

        {/* Latecomers announce themselves here — the top-10 board can't show a
            student on 0 points, and the mentor needs to know they're in. */}
        {joinAlerts.length > 0 && (
          <div className="host-join-toasts" aria-live="polite">
            {joinAlerts.map((a) => (
              <div key={a.id} className="host-join-toast">
                <span aria-hidden="true">{getAvatar(a.name)}</span>
                <strong>{a.name}</strong> joined
              </div>
            ))}
          </div>
        )}

        {/* Full roster, on demand, in every phase — not just the lobby. */}
        {showRoster && (
          <div className="host-roster-panel" role="region" aria-label="Students in the room">
            <div className="host-roster-panel-head">
              <strong>
                👥 {participants.length} in the room
                {participants.some((p) => !p.connected) && (
                  <span className="text-muted" style={{ fontWeight: 500 }}>
                    {' '}· {participants.filter((p) => p.connected).length} connected
                  </span>
                )}
              </strong>
              <button
                className="btn btn-ghost btn--sm"
                onClick={() => setShowRoster(false)}
                aria-label="Close roster"
              >
                ✕
              </button>
            </div>
            {participants.length === 0 ? (
              <p className="text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                Nobody has joined yet. Students join with code <strong>{code}</strong>.
              </p>
            ) : (
              <div className="menti-lobby-chips-wrap">
                {participants.map((p) => (
                  <span
                    key={p.id}
                    className="menti-lobby-chip"
                    style={{ opacity: p.connected ? 1 : 0.55 }}
                    title={
                      p.connected
                        ? 'Connected'
                        : 'Disconnected — phone asleep, or wifi dropped. Their score is safe.'
                    }
                  >
                    <span style={{ marginRight: '0.35rem' }}>{getAvatar(p.name)}</span> {p.name}
                    {!p.connected && <span style={{ marginLeft: '0.3rem' }}>💤</span>}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Presenter controls ─────────────────────────────────────── */}
        <div className="host-bar">
          <button
            className="btn btn-ghost"
            onClick={previous}
            disabled={currentIndex <= 0}
            title="Re-run the previous question"
          >
            ← Previous
          </button>

          {phase === 'question' && (
            <>
              <button className="btn btn-quiet" onClick={() => extendTime(15)} id="extend-time-btn">
                +15s
              </button>
              <span className="t-label-sm text-muted">
                {everyoneAnswered ? 'Everyone has answered' : 'Waiting for answers…'}
              </span>
            </>
          )}

          {phase === 'results' && (
            <div className="row row-2">
              {isReviewMode ? (
                <span className="chip" style={{ background: 'rgba(245,158,11,0.15)', color: hostTheme === 'dark' ? '#F59E0B' : '#B45309', border: '1px solid rgba(245,158,11,0.3)' }}>
                  👁 Review mode — auto-advance paused
                </span>
              ) : (
                <>
                  <span className="chip chip--pulse">
                    Leaderboard in {resultsAdvance}s
                  </span>
                  <button
                    className="btn btn-ghost btn--sm"
                    onClick={() => setResultsPaused((p) => !p)}
                    title={resultsPaused ? 'Resume countdown' : 'Pause countdown'}
                  >
                    {resultsPaused ? '▶ Resume' : '⏸ Pause'}
                  </button>
                </>
              )}
            </div>
          )}

          {phase === 'leaderboard' && (
            <div className="row row-2" style={{ alignItems: 'center', gap: '0.75rem' }}>
              <button
                className="btn btn-primary"
                onClick={next}
                id="leaderboard-next-btn"
                style={{ fontWeight: 800, padding: '0.55rem 1.4rem', borderRadius: '10px' }}
              >
                {isLastQuestion ? '🏆 View Final Standings' : 'Next Question ➔'}
              </button>

              {autoAdvanceEnabled ? (
                <div className="row row-2" style={{ alignItems: 'center', gap: '0.5rem' }}>
                  <span className="chip chip--pulse">
                    {isLastQuestion ? 'Finishing' : 'Next'} in {autoAdvance}s
                  </span>
                  <button
                    className="btn btn-ghost btn--sm"
                    onClick={() => setAutoPaused((p) => !p)}
                    title={autoPaused ? 'Resume countdown' : 'Pause countdown'}
                  >
                    {autoPaused ? '▶ Resume' : '⏸ Pause'}
                  </button>
                  <button
                    className="btn btn-ghost btn--sm"
                    onClick={() => {
                      setAutoAdvanceEnabled(false);
                      localStorage.setItem('pollmeter_auto_advance', 'false');
                    }}
                    title="Switch to manual next button"
                  >
                    ⚡ Auto: ON
                  </button>
                </div>
              ) : (
                <button
                  className="btn btn-ghost btn--sm"
                  onClick={() => {
                    setAutoAdvanceEnabled(true);
                    localStorage.setItem('pollmeter_auto_advance', 'true');
                  }}
                  title="Enable automatic 5-second countdown"
                >
                  ⚡ Auto: OFF (Manual)
                </button>
              )}
            </div>
          )}

          <button
            className={`btn btn-ghost host-roster-pill${
              showRoster ? ' host-roster-pill--open' : ''
            }`}
            onClick={() => setShowRoster((v) => !v)}
            title="Students in the room — includes anyone who joined mid-quiz"
            aria-label={`${participants.length} students in the room. Show roster.`}
            aria-expanded={showRoster}
            id="roster-btn"
          >
            👥 {participants.length}
          </button>

          <button
            className="btn btn-ghost"
            onClick={toggleSound}
            title={muted ? 'Unmute sound effects' : 'Mute sound effects'}
            aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
            aria-pressed={!muted}
            id="mute-btn"
          >
            {muted ? '🔇' : '🔊'}
          </button>

          <div className="host-bar-spacer" />

          <button className="btn btn-ghost" onClick={endSession} id="end-session-btn">
            Finish early
          </button>

          {phase === 'question' && (
            <button className="btn btn-primary btn--lg" onClick={lockAnswers} id="lock-answers-btn">
              🔒 Close &amp; show results
            </button>
          )}

          {phase === 'results' && (
            <>
              <button className="btn btn-secondary btn--lg" onClick={showLeaderboard} id="show-leaderboard-btn">
                🏆 Show now
              </button>
              <button
                className={`btn btn--lg ${isLastQuestion ? 'btn-danger' : 'btn-primary'}`}
                onClick={next}
                id="next-question-btn"
              >
                {isLastQuestion ? '🏁 Finish' : 'Next question →'}
              </button>
            </>
          )}

          {phase === 'leaderboard' && (
            <button
              className={`btn btn--lg ${isLastQuestion ? 'btn-danger' : 'btn-primary'}`}
              onClick={next}
              id="next-after-lb-btn"
            >
              {isLastQuestion ? '🏁 Finish' : 'Next question →'}
            </button>
          )}
        </div>
      </main>

      {reactions.map((r) => (
        <span
          key={r.id}
          className="floating-reaction"
          style={{
            left: `${r.left}%`,
            '--drift': `${r.drift}px`,
            animationDuration: `${r.duration}s`,
          } as React.CSSProperties}
          aria-hidden="true"
        >
          {r.emoji}
        </span>
      ))}
    </div>
  );
}
