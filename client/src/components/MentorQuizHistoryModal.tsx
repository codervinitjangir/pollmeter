import { useState, useEffect } from 'react';
import { fetchMentorQuizzes, fetchQuizDetails } from '../auth';

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

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError('');
    fetchMentorQuizzes()
      .then((data) => setQuizzes(data))
      .catch((err) => setError(err.message || 'Failed to load past quizzes'))
      .finally(() => setLoading(false));
  }, [isOpen]);

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

  function handleExportCsv() {
    if (!details?.participants?.length) return;

    const session = details.session;
    const rows = [
      ['Rank', 'Real Name (College ID)', 'Screen Name (Used in Quiz)', 'College Email', 'Final Score', 'Correct Answers', 'Total Questions', 'Accuracy %'],
    ];

    details.participants.forEach((p) => {
      const accuracy = p.totalQuestions > 0 ? Math.round((p.correctCount / p.totalQuestions) * 100) : 0;
      rows.push([
        String(p.rank || '-'),
        `"${(p.realName || '').replace(/"/g, '""')}"`,
        `"${(p.screenName || '').replace(/"/g, '""')}"`,
        `"${(p.email || '').replace(/"/g, '""')}"`,
        String(p.finalScore || 0),
        String(p.correctCount || 0),
        String(p.totalQuestions || session?.questionCount || 0),
        `${accuracy}%`,
      ]);
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const filename = `MSU_Quiz_${session?.code || 'report'}_${new Date(session?.createdAt || Date.now()).toISOString().split('T')[0]}.csv`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
                  id="export-csv-btn"
                >
                  📥 Export Gradebook CSV
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
                    <span className="pm-summary-label">Room Code</span>
                    <strong className="pm-summary-value">{details.session?.code}</strong>
                  </div>
                  <div className="pm-history-summary-item">
                    <span className="pm-summary-label">Date &amp; Time</span>
                    <span className="pm-summary-value">
                      {new Date(details.session?.createdAt).toLocaleString()}
                    </span>
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
            {loading ? (
              <div className="pm-history-loading">
                <div className="pm-spinner" />
                <p>Fetching your past quizzes...</p>
              </div>
            ) : quizzes.length === 0 ? (
              <div className="pm-history-empty">
                <span style={{ fontSize: '3rem' }}>📋</span>
                <h3>No past quizzes recorded yet</h3>
                <p>When you host a live quiz and end the session, the complete report and attendance will appear here.</p>
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
                        <h4 className="pm-quiz-card-topic">{q.topic || 'Classroom Quiz'}</h4>
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
