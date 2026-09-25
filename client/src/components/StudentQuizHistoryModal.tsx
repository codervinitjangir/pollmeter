import { useState, useEffect } from 'react';
import { fetchStudentQuizzes, AuthUser } from '../auth';

interface Props {
  isOpen: boolean;
  currentUser: AuthUser | null;
  onClose: () => void;
}

export default function StudentQuizHistoryModal({ isOpen, currentUser, onClose }: Props) {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError('');
    fetchStudentQuizzes()
      .then((data) => setHistory(data))
      .catch((err) => setError(err.message || 'Failed to load your quiz records'))
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="pm-auth-modal-backdrop" onClick={onClose}>
      <div className="pm-history-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="pm-history-header">
          <div className="pm-history-header-left">
            <span className="pm-history-icon">📜</span>
            <div>
              <h2 className="pm-history-title">My Quiz Journey</h2>
              <p className="pm-history-subtitle">
                Performance history for <strong>{currentUser?.realName}</strong> ({currentUser?.email})
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

        <div className="pm-history-content">
          {loading ? (
            <div className="pm-history-loading">
              <div className="pm-spinner" />
              <p>Fetching your past quiz scores...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="pm-history-empty">
              <span style={{ fontSize: '3rem' }}>🎯</span>
              <h3>No quiz records found yet</h3>
              <p>Join live classroom sessions to build your score history and track your ranks!</p>
            </div>
          ) : (
            <div className="pm-quizzes-card-list">
              {history.map(({ session, participant }, idx) => {
                const accuracy =
                  participant.totalQuestions > 0
                    ? Math.round((participant.correctCount / participant.totalQuestions) * 100)
                    : 0;
                return (
                  <div key={participant.id || idx} className="pm-student-history-card">
                    <div className="pm-quiz-card-left">
                      <span className="pm-rank-pill pm-rank-gold">
                        Rank #{participant.rank || '-'}
                      </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <h4 className="pm-quiz-card-topic">{session.topic}</h4>
                          <span className="pm-subject-badge" style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem' }}>
                            {session.subject || 'General'}
                          </span>
                        </div>
                        <span className="pm-quiz-card-date">
                          👨‍🏫 Mentor: <strong>{session.hostName || 'Faculty'}</strong> • Played as <strong>"{participant.screenName}"</strong> on{' '}
                          {new Date(session.createdAt).toLocaleDateString()}
                        </span>
                    </div>

                    <div className="pm-student-card-stats">
                      <div className="pm-quiz-card-stat">
                        <span className="pm-stat-num">{participant.finalScore}</span>
                        <span className="pm-stat-label">Score</span>
                      </div>
                      <div className="pm-quiz-card-stat">
                        <span className="pm-stat-num">{accuracy}%</span>
                        <span className="pm-stat-label">
                          {participant.correctCount}/{participant.totalQuestions} Right
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
