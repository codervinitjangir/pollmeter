import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchMentorQuizzes,
  fetchQuizDetails,
  fetchBatches,
  fetchBatchObjects,
  downloadQuizCsv,
  createQuizDraft,
  getAuthToken,
  BatchObject,
} from '../auth';
import { apiUrl } from '../api';
import { setStoredHost } from '../pages/mentor/hostSession';
import BatchPicker from './BatchPicker';

interface Props {
  isOpen?: boolean;
  onClose?: () => void;
  embedded?: boolean;
  onBack?: () => void;
  onLoadInBuilder?: (quiz: {
    title: string;
    subject?: string;
    batchId?: string;
    batch?: string;
    questions: any[];
    sourceDraftId?: string;
  }) => void;
  availableBatches?: BatchObject[];
}

function parseQuestions(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [];
}

export default function MentorQuizHistoryModal({
  isOpen = false,
  onClose,
  embedded = false,
  onBack,
  onLoadInBuilder,
  availableBatches,
}: Props) {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const [details, setDetails] = useState<{
    session: any;
    participants: any[];
    responses: any[];
  } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showQuestionsList, setShowQuestionsList] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Multi-horizon date and batch filter states
  const [timeRange, setTimeRange] = useState<string>('all');
  const [selectedBatch, setSelectedBatch] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [batchOptions, setBatchOptions] = useState<string[]>([]);
  const [allBatchObjects, setAllBatchObjects] = useState<BatchObject[]>(availableBatches || []);

  // Go live modal state
  const [goLiveModalQuiz, setGoLiveModalQuiz] = useState<any | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [selectedBatchName, setSelectedBatchName] = useState('');
  const [startingSession, setStartingSession] = useState(false);
  const [goLiveError, setGoLiveError] = useState('');

  // Load available batches dynamically
  useEffect(() => {
    if (!isOpen && !embedded) return;
    fetchBatches()
      .then((b) => {
        if (b && b.length > 0) setBatchOptions(b);
      })
      .catch(() => {});

    if (allBatchObjects.length === 0) {
      fetchBatchObjects()
        .then((objs) => {
          if (objs && objs.length > 0) setAllBatchObjects(objs);
        })
        .catch(() => {});
    }
  }, [isOpen, embedded, allBatchObjects.length]);

  // Load mentor-scoped quizzes with active filters
  useEffect(() => {
    if (!isOpen && !embedded) return;
    setLoading(true);
    setError('');
    fetchMentorQuizzes({
      batch: selectedBatch !== 'all' ? selectedBatch : undefined,
      timeRange: timeRange !== 'all' ? timeRange : undefined,
      startDate: timeRange === 'custom' && startDate ? startDate : undefined,
      endDate: timeRange === 'custom' && endDate ? endDate : undefined,
    })
      .then((data) => setQuizzes(data))
      .catch((err) => setError(err.message || 'Failed to load past quizzes'))
      .finally(() => setLoading(false));
  }, [isOpen, embedded, timeRange, selectedBatch, startDate, endDate]);

  async function handleSelectQuiz(id: string) {
    setSelectedQuizId(id);
    setLoadingDetails(true);
    setShowQuestionsList(false);
    try {
      const data = await fetchQuizDetails(id);
      setDetails(data);
    } catch (err) {
      setError((err as Error).message || 'Failed to load session details');
    } finally {
      setLoadingDetails(false);
    }
  }

  async function handleExportCsv() {
    if (!selectedQuizId) return;
    setExporting(true);
    setError('');
    try {
      await downloadQuizCsv(
        selectedQuizId,
        `${details?.session?.code || 'report'}-${details?.session?.batch || 'class'}`
      );
    } catch (err) {
      setError((err as Error).message || 'Failed to export quiz results');
    } finally {
      setExporting(false);
    }
  }

  async function handleEditInBuilder(q: any) {
    let qs = parseQuestions(q.questions || details?.session?.questions);
    if (!qs || qs.length === 0) {
      try {
        const d = await fetchQuizDetails(q.id);
        qs = parseQuestions(d?.session?.questions);
      } catch {}
    }
    if (!qs || qs.length === 0) {
      setError('Could not find questions in this quiz.');
      return;
    }
    if (onLoadInBuilder) {
      onLoadInBuilder({
        title: q.topic || details?.session?.topic || 'Classroom Quiz',
        subject: q.subject || details?.session?.subject,
        batchId: q.batchId || details?.session?.batchId,
        batch: q.batch || details?.session?.batch,
        questions: qs,
        sourceDraftId: q.sourceDraftId || details?.session?.sourceDraftId,
      });
    } else {
      onBack?.();
    }
  }

  async function handleSaveAsDraft(q: any) {
    setActionLoadingId(q.id);
    setError('');
    setSuccessMsg('');
    try {
      let qs = parseQuestions(q.questions || details?.session?.questions);
      if (!qs || qs.length === 0) {
        try {
          const d = await fetchQuizDetails(q.id);
          qs = parseQuestions(d?.session?.questions);
        } catch {}
      }
      if (!qs || qs.length === 0) {
        throw new Error('No questions found in this quiz session.');
      }
      const title = `${q.topic || details?.session?.topic || 'Quiz'} (Copy)`;
      await createQuizDraft({
        title,
        subject: q.subject || details?.session?.subject || 'General',
        questions: qs,
      });
      setSuccessMsg(`✓ Saved "${title}" to your Quiz Library as a draft!`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to save quiz as draft.');
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleOpenHostAgain(q: any) {
    let qs = parseQuestions(q.questions || details?.session?.questions);
    if (!qs || qs.length === 0) {
      try {
        const d = await fetchQuizDetails(q.id);
        qs = parseQuestions(d?.session?.questions);
      } catch {}
    }
    if (!qs || qs.length === 0) {
      setError('No questions found to host.');
      return;
    }
    setGoLiveModalQuiz({
      ...q,
      questions: qs,
      topic: q.topic || details?.session?.topic || 'Classroom Quiz',
      subject: q.subject || details?.session?.subject || 'General',
    });
    setSelectedBatchId(q.batchId || details?.session?.batchId || '');
    setSelectedBatchName(q.batch || details?.session?.batch || '');
    setGoLiveError('');
  }

  async function handleLaunchHostAgain() {
    if (!goLiveModalQuiz) return;
    if (!selectedBatchId) {
      setGoLiveError('Please select or create a batch before launching.');
      return;
    }
    setStartingSession(true);
    setGoLiveError('');
    try {
      const token = getAuthToken();
      if (!token) throw new Error('Authentication required');
      const res = await fetch(apiUrl('/api/sessions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          questions: goLiveModalQuiz.questions,
          topic: goLiveModalQuiz.topic,
          subject: goLiveModalQuiz.subject || 'General',
          batchId: selectedBatchId,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        throw new Error(d.error || 'Failed to start live session.');
      }
      setStoredHost({ code: d.code, hostId: d.hostId });
      navigate('/dashboard/live/' + d.code);
    } catch (err: any) {
      setGoLiveError(err.message || 'Failed to start live session.');
      setStartingSession(false);
    }
  }

  if (!isOpen && !embedded) return null;

  const cardContent = (
    <div className={embedded ? "pm-reports-workspace-card" : "pm-history-modal-card"} onClick={(e) => e.stopPropagation()}>
      <div className="pm-history-header">
        <div className="pm-history-header-left">
          <span className="pm-history-icon">📊</span>
          <div>
            <h2 className="pm-history-title">
              {selectedQuizId ? 'Quiz Session Report' : 'Past Hosted Quizzes & Analytics'}
            </h2>
            <p className="pm-history-subtitle">
              {selectedQuizId
                ? 'Deanonymized student records, scores, real attendance & question review'
                : 'Review past sessions, re-host for another batch, or edit questions in builder'}
            </p>
          </div>
        </div>
        {embedded && onBack ? (
          <button className="btn btn-secondary btn--sm" onClick={onBack} type="button" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span>←</span> Back to Quiz Builder
          </button>
        ) : onClose ? (
          <button className="pm-auth-close-btn" onClick={onClose} aria-label="Close" type="button">
            ✕
          </button>
        ) : null}
      </div>

      {error && (
        <div className="pm-auth-error-alert" style={{ margin: '16px 24px 0' }}>
          <span>⚠️ {error}</span>
        </div>
      )}

      {successMsg && (
        <div className="alert alert-success" style={{ margin: '16px 24px 0', padding: '0.75rem 1.25rem', borderRadius: '10px', background: '#064E3B', color: '#6EE7B7', border: '1px solid #059669' }}>
          {successMsg}
        </div>
      )}

      {/* Detail View */}
      {selectedQuizId ? (
        <div className="pm-history-content">
          <div className="pm-history-toolbar" style={{ flexWrap: 'wrap', gap: '0.6rem' }}>
            <button
              className="pm-btn pm-btn-ghost pm-history-back-btn"
              onClick={() => {
                setSelectedQuizId(null);
                setDetails(null);
              }}
            >
              ← Back to All Quizzes
            </button>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary btn--sm"
                onClick={() => handleEditInBuilder(details?.session)}
                title="Load questions into Quiz Builder to edit or update"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                <span>✏️</span> Edit in Builder
              </button>

              <button
                className="btn btn-success btn--sm"
                onClick={() => handleOpenHostAgain(details?.session)}
                title="Launch a new session with these questions for another class"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                <span>▶</span> Host Again
              </button>

              <button
                className="btn btn-secondary btn--sm"
                onClick={() => handleSaveAsDraft(details?.session)}
                disabled={actionLoadingId === selectedQuizId}
                title="Save as reusable draft in Quiz Library"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                <span>📋</span> Save as Draft
              </button>

              {details?.participants?.length ? (
                <button
                  className="pm-btn pm-btn-secondary pm-export-csv-btn"
                  onClick={handleExportCsv}
                  disabled={exporting}
                  id="export-csv-btn"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                >
                  {exporting ? '⏳ Preparing CSV...' : '📥 Export CSV'}
                </button>
              ) : null}
            </div>
          </div>

          {loadingDetails ? (
            <div className="pm-history-loading">
              <div className="spinner" />
              <p>Loading session report...</p>
            </div>
          ) : details ? (
            <div className="pm-history-detail-body">
              {/* Session Summary Card */}
              <div className="pm-history-summary-grid">
                <div className="pm-history-summary-item">
                  <span className="pm-summary-label">Topic</span>
                  <strong className="pm-summary-value">{details.session?.topic}</strong>
                </div>
                <div className="pm-history-summary-item">
                  <span className="pm-summary-label">Target Batch</span>
                  <strong className="pm-summary-value" style={{ color: 'var(--accent, #818CF8)' }}>
                    🎓 {details.session?.batch || 'General'}
                  </strong>
                </div>
                <div className="pm-history-summary-item">
                  <span className="pm-summary-label">Room Code</span>
                  <strong className="pm-summary-value">#{details.session?.code}</strong>
                </div>
                <div className="pm-history-summary-item">
                  <span className="pm-summary-label">Students Attended</span>
                  <strong className="pm-summary-value">
                    {details.participants?.length || 0}
                  </strong>
                </div>
              </div>

              {/* Deanonymized Student Table */}
              <div className="pm-history-table-container">
                <div className="pm-history-table-caption">
                  <span>👥 Student Records &amp; Nickname Mapping</span>
                  <span className="pm-history-deanonymized-tag">
                    Verified College IDs
                  </span>
                </div>
                {details.participants?.length === 0 ? (
                  <div className="pm-history-empty">
                    No student records recorded for this session.
                  </div>
                ) : (
                  <table className="pm-history-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Real Name (College ID)</th>
                        <th>Screen Name (Quiz)</th>
                        <th>College Domain Email</th>
                        <th>Score</th>
                        <th>Accuracy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.participants.map((p, idx) => {
                        const accuracy =
                          p.totalQuestions > 0
                            ? Math.round((p.correctCount / p.totalQuestions) * 100)
                            : 0;
                        return (
                          <tr key={p.id || idx}>
                            <td>
                              <span className={`pm-rank-pill ${idx === 0 ? 'pm-rank-gold' : idx === 1 ? 'pm-rank-silver' : idx === 2 ? 'pm-rank-bronze' : ''}`}>
                                #{p.rank || idx + 1}
                              </span>
                            </td>
                            <td>
                              <strong className="pm-real-name-highlight">
                                {p.realName || 'Unknown Student'}
                              </strong>
                            </td>
                            <td>
                              <span className="pm-screen-name-tag">
                                {p.screenName}
                              </span>
                            </td>
                            <td className="pm-table-email">{p.email}</td>
                            <td>
                              <strong>{p.finalScore}</strong>
                            </td>
                            <td>
                              <div className="pm-accuracy-bar-wrapper">
                                <div
                                  className="pm-accuracy-bar-fill"
                                  style={{ width: `${accuracy}%` }}
                                />
                                <span>{accuracy}% ({p.correctCount}/{p.totalQuestions || details.session?.questionCount})</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Question Preview Accordion */}
              {details.session?.questions && (
                <div
                  style={{
                    marginTop: '1.5rem',
                    background: 'var(--surface-2, rgba(255, 255, 255, 0.03))',
                    border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
                    borderRadius: '12px',
                    padding: '1.25rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                    }}
                    onClick={() => setShowQuestionsList(!showQuestionsList)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ fontSize: '1.2rem' }}>📝</span>
                      <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>
                        Questions in this Quiz ({parseQuestions(details.session.questions).length})
                      </strong>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn--sm"
                      style={{ fontSize: '0.85rem' }}
                    >
                      {showQuestionsList ? '▲ Hide Questions' : '▼ Show Questions'}
                    </button>
                  </div>

                  {showQuestionsList && (
                    <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {parseQuestions(details.session.questions).map((q: any, i: number) => (
                        <div
                          key={q.id || i}
                          style={{
                            background: 'var(--surface, #18181B)',
                            padding: '1rem',
                            borderRadius: '10px',
                            border: '1px solid var(--border, #27272A)',
                          }}
                        >
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                            <span className="badge badge-neutral t-label-sm">Q{i + 1}</span>
                            <span className="badge badge-primary t-label-sm">{q.type === 'mcq' ? 'MCQ' : 'Open Text'}</span>
                            <span className="badge badge-neutral t-label-sm">{q.timeLimitSeconds || 30}s</span>
                            {q.correctAnswer && <span className="badge badge-success t-label-sm">Scored</span>}
                          </div>
                          <p style={{ margin: '0 0 0.5rem', fontWeight: 600, fontSize: '0.95rem' }}>{q.text}</p>
                          {q.options && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.4rem' }}>
                              {q.options.map((opt: string, optIdx: number) => {
                                const isCorrect = opt === q.correctAnswer;
                                return (
                                  <span
                                    key={optIdx}
                                    style={{
                                      padding: '0.3rem 0.65rem',
                                      borderRadius: '6px',
                                      fontSize: '0.85rem',
                                      background: isCorrect ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                      color: isCorrect ? '#10B981' : 'var(--text-secondary)',
                                      border: isCorrect ? '1px solid #10B981' : '1px solid transparent',
                                      fontWeight: isCorrect ? 600 : 400,
                                    }}
                                  >
                                    {isCorrect ? '✓ ' : ''}{opt}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                          {q.why && (
                            <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                              💡 <em>{q.why}</em>
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : (
        /* List of all quizzes */
        <div className="pm-history-content">
          {/* Multi-horizon Filter Toolbar */}
          <div className="pm-filter-toolbar">
            <div className="pm-filter-chips-group">
              {[
                { id: 'all', label: 'All Time' },
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: '7d', label: 'Last 7 Days' },
                { id: '30d', label: 'Last 30 Days' },
                { id: 'custom', label: 'Custom Range' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`pm-filter-chip ${timeRange === t.id ? 'active' : ''}`}
                  onClick={() => setTimeRange(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="pm-filter-right">
              {timeRange === 'custom' && (
                <div className="pm-filter-date-inputs">
                  <input
                    type="date"
                    className="pm-filter-date-input"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    title="Start Date"
                  />
                  <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>→</span>
                  <input
                    type="date"
                    className="pm-filter-date-input"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    title="End Date"
                  />
                </div>
              )}

              <select
                className="pm-filter-select"
                value={selectedBatch}
                onChange={(e) => setSelectedBatch(e.target.value)}
              >
                <option value="all">🎓 All Batches</option>
                {batchOptions.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="pm-history-loading">
              <div className="spinner" />
              <p>Fetching your past quizzes...</p>
            </div>
          ) : quizzes.length === 0 ? (
            <div className="pm-history-empty">
              <span style={{ fontSize: '3rem' }}>📋</span>
              <h3>No quizzes match your filter</h3>
              <p>Try switching time horizons or choosing "All Batches" to see your past sessions.</p>
            </div>
          ) : (
            <div className="pm-quizzes-card-list">
              {quizzes.map((q) => {
                const isActing = actionLoadingId === q.id;

                return (
                  <div
                    key={q.id}
                    className="pm-quiz-history-card"
                    style={{ flexWrap: 'wrap', gap: '1rem' }}
                    onClick={() => handleSelectQuiz(q.id)}
                  >
                    <div className="pm-quiz-card-left" style={{ flex: '1 1 320px' }}>
                      <span className="pm-quiz-card-code">#{q.code}</span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <h4 className="pm-quiz-card-topic" style={{ margin: 0 }}>{q.topic || 'Classroom Quiz'}</h4>
                          <span className="pm-subject-badge" style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem' }}>
                            {q.subject || 'General'}
                          </span>
                          <span className="pm-batch-badge" style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem' }}>
                            🎓 {q.batch || 'General'}
                          </span>
                        </div>
                        <span className="pm-quiz-card-date">
                          📅 {new Date(q.createdAt).toLocaleDateString()} at{' '}
                          {new Date(q.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    <div className="pm-quiz-card-right" style={{ flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
                      <div className="pm-quiz-card-stat">
                        <span className="pm-stat-num">{q.participantCount || 0}</span>
                        <span className="pm-stat-label">Students</span>
                      </div>
                      <div className="pm-quiz-card-stat">
                        <span className="pm-stat-num">{q.questionCount || 0}</span>
                        <span className="pm-stat-label">Questions</span>
                      </div>

                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn btn-primary btn--sm"
                          onClick={() => handleSelectQuiz(q.id)}
                          title="View student results and analytics"
                          style={{ fontWeight: 600 }}
                        >
                          📊 Report
                        </button>

                        <button
                          type="button"
                          className="btn btn-secondary btn--sm"
                          onClick={() => handleEditInBuilder(q)}
                          title="Open questions in Quiz Builder to edit or update"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <span>✏️</span> Edit
                        </button>

                        <button
                          type="button"
                          className="btn btn-success btn--sm"
                          onClick={() => handleOpenHostAgain(q)}
                          title="Re-run this quiz for another batch"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <span>▶</span> Host Again
                        </button>

                        <button
                          type="button"
                          className="btn btn-ghost btn--sm"
                          onClick={() => handleSaveAsDraft(q)}
                          disabled={isActing}
                          title="Duplicate as reusable draft in Quiz Library"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <span>📋</span> Draft
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Host Again Batch Picker Modal */}
      {goLiveModalQuiz && (
        <div
          className="modal-overlay"
          style={{ zIndex: 350 }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !startingSession) setGoLiveModalQuiz(null);
          }}
        >
          <div
            className="modal stack stack-4"
            role="dialog"
            aria-label="Host Quiz Again"
            style={{ maxWidth: '480px', width: '92%' }}
          >
            <div className="modal-header">
              <div className="stack stack-1">
                <p className="t-title" style={{ fontSize: '1.25rem', margin: 0 }}>
                  🚀 Host Quiz Again
                </p>
                <p className="t-body-sm text-secondary" style={{ margin: 0 }}>
                  Re-launch &quot;{goLiveModalQuiz.topic}&quot; ({parseQuestions(goLiveModalQuiz.questions).length} questions) for a new batch
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn--icon"
                onClick={() => !startingSession && setGoLiveModalQuiz(null)}
                aria-label="Close"
                disabled={startingSession}
              >
                ✕
              </button>
            </div>

            <div style={{ margin: '0.5rem 0' }}>
              <BatchPicker
                batches={allBatchObjects}
                selectedBatchId={selectedBatchId}
                onSelect={(id, name) => {
                  setSelectedBatchId(id);
                  setSelectedBatchName(name);
                  setGoLiveError('');
                }}
                onBatchCreated={(b) => {
                  setAllBatchObjects((prev) => [...prev, b]);
                  setSelectedBatchId(b.id);
                  setSelectedBatchName(b.displayName);
                }}
                label="Select Class / Batch to Host for:"
              />
            </div>

            {goLiveError && (
              <div className="alert alert-error" style={{ padding: '0.65rem 0.9rem', fontSize: '0.85rem' }}>
                ⚠️ {goLiveError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setGoLiveModalQuiz(null)}
                disabled={startingSession}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleLaunchHostAgain}
                disabled={startingSession || !selectedBatchId}
                style={{
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, #10B981, #059669)',
                  border: 'none',
                }}
              >
                {startingSession ? '🚀 Starting Session…' : '▶ Start Live Session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (embedded) {
    return cardContent;
  }

  return (
    <div className="pm-auth-modal-backdrop" onClick={onClose}>
      {cardContent}
    </div>
  );
}

