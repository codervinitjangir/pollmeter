import { useState, useEffect } from 'react';
import { fetchMentorQuizzes, fetchQuizDetails, fetchBatches, downloadQuizCsv } from '../auth';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function MentorQuizHistoryModal({ isOpen, onClose }: Props) {
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const [details, setDetails] = useState<{
    session: any;
    participants: any[];
    responses: any[];
  } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Multi-horizon date and batch filter states
  const [timeRange, setTimeRange] = useState<string>('all');
  const [selectedBatch, setSelectedBatch] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [batchOptions, setBatchOptions] = useState<string[]>([
    '1st Year - Batch A',
    '1st Year - Batch B',
    '1st Year - Batch C',
    '2nd Year - Batch A',
    '2nd Year - Batch B',
    '2nd Year - Batch C',
    '3rd Year - Batch A',
  ]);

  // Load available batches dynamically
  useEffect(() => {
    if (!isOpen) return;
    fetchBatches()
      .then((b) => {
        if (b && b.length > 0) setBatchOptions(b);
      })
      .catch(() => {});
  }, [isOpen]);

  // Load mentor-scoped quizzes with active filters
  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen, timeRange, selectedBatch, startDate, endDate]);

  async function handleSelectQuiz(id: string) {
    setSelectedQuizId(id);
    setLoadingDetails(true);
    try {
      const data = await fetchQuizDetails(id);
      setDetails(data);
    } catch (err) {
      setError((err as Error).message || 'Failed to load session details');
    } finally {
      setLoadingDetails(false);
    }
  }

  /**
   * Downloads the gradebook from the server rather than assembling it here.
   *
   * The previous version built the CSV out of the already-fetched participant
   * summaries and handed it to the browser as a `data:` URI. Three things were
   * wrong with that: `encodeURI` silently truncates the file at the first `#`
   * in a student's answer, there was no UTF-8 BOM so Excel rendered Devanagari
   * names as mojibake, and a value beginning with `=` was still a live formula
   * when the file was opened. The server route escapes those, emits per-answer
   * rows instead of per-student totals, and records the export in the audit log
   * itself — so the separate audit POST that used to live here is gone too.
   */
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

  if (!isOpen) return null;

  return (
    <div className="pm-auth-modal-backdrop" onClick={onClose}>
      <div className="pm-history-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="pm-history-header">
          <div className="pm-history-header-left">
            <span className="pm-history-icon">📊</span>
            <div>
              <h2 className="pm-history-title">
                {selectedQuizId ? 'Quiz Session Report' : 'Past Hosted Quizzes & Analytics'}
              </h2>
              <p className="pm-history-subtitle">
                {selectedQuizId
                  ? 'Deanonymized student records, scores, and real attendance'
                  : 'Track longitudinal student performance and classroom attendance'}
              </p>
            </div>
          </div>
          <button className="pm-auth-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {error && (
          <div className="pm-auth-error-alert" style={{ margin: '16px 24px 0' }}>
            <span>⚠️ {error}</span>
          </div>
        )}

        {/* Detail View */}
        {selectedQuizId ? (
          <div className="pm-history-content">
            <div className="pm-history-toolbar">
              <button
                className="pm-btn pm-btn-ghost pm-history-back-btn"
                onClick={() => {
                  setSelectedQuizId(null);
                  setDetails(null);
                }}
              >
                ← Back to All Quizzes
              </button>
              {details?.participants?.length ? (
                <button
                  className="pm-btn pm-btn-primary pm-export-csv-btn"
                  onClick={handleExportCsv}
                  disabled={exporting}
                  id="export-csv-btn"
                >
                  {exporting ? '⏳ Preparing CSV...' : '📥 Export Gradebook CSV'}
                </button>
              ) : null}
            </div>

            {loadingDetails ? (
              <div className="pm-history-loading">
                <div className="pm-spinner" />
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
                    <strong className="pm-summary-value" style={{ color: '#4338CA' }}>
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
                <div className="pm-spinner" />
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
                {quizzes.map((q) => (
                  <div
                    key={q.id}
                    className="pm-quiz-history-card"
                    onClick={() => handleSelectQuiz(q.id)}
                  >
                    <div className="pm-quiz-card-left">
                      <span className="pm-quiz-card-code">#{q.code}</span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <h4 className="pm-quiz-card-topic">{q.topic || 'Classroom Quiz'}</h4>
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
                    <div className="pm-quiz-card-right">
                      <div className="pm-quiz-card-stat">
                        <span className="pm-stat-num">{q.participantCount || 0}</span>
                        <span className="pm-stat-label">Students</span>
                      </div>
                      <div className="pm-quiz-card-stat">
                        <span className="pm-stat-num">{q.questionCount || 0}</span>
                        <span className="pm-stat-label">Questions</span>
                      </div>
                      <button className="pm-btn pm-btn-secondary pm-btn-sm">
                        View Report →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

