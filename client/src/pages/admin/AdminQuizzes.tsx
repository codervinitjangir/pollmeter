import React, { useState } from 'react';
import { useAdminData } from './AdminContext';

export default function AdminQuizzes() {
  const { overview } = useAdminData();
  const [showAllCohorts, setShowAllCohorts] = useState(false);

  const subjects = overview?.subjects || [];
  const batches = overview?.batches || [];
  const recentQuizzes = overview?.recentQuizzes || [];
  const visibleBatches = showAllCohorts ? batches : batches.slice(0, 8);

  return (
    <section className="pm-admin-panel-card">
      <div className="pm-panel-header-row">
        <div>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Classroom Quiz Logs</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0' }}>
            Audited live quiz sessions across all cohorts
          </p>
        </div>
        <span className="pm-table-count">
          <strong>{recentQuizzes.length}</strong> sessions logged
        </span>
      </div>

      {/* Active Academic Subjects */}
      {subjects.length > 0 && (
        <div className="pm-admin-subjects-section" style={{ marginBottom: '0.75rem', marginTop: '0.4rem' }}>
          <span className="pm-subjects-heading">Active Subjects:</span>
          <div className="pm-subject-tags-list">
            {subjects.map((sub, i) => (
              <div key={i} className="pm-subject-pill">
                <span className="pm-subject-dot" />
                <strong>{sub.subject}</strong>
                <span className="pm-subject-count">{sub.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Academic Cohorts */}
      {batches.length > 0 && (
        <div className="pm-admin-subjects-section" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
            <span className="pm-subjects-heading">Active Cohorts:</span>
            {batches.length > 8 && (
              <button
                type="button"
                className="pm-drill-crumb-clear"
                style={{ fontSize: '0.75rem' }}
                onClick={() => setShowAllCohorts(!showAllCohorts)}
              >
                {showAllCohorts ? 'Show Less' : `+${batches.length - 8} More Cohorts`}
              </button>
            )}
          </div>
          <div className="pm-subject-tags-list">
            {visibleBatches.map((b, i) => (
              <div key={i} className="pm-subject-pill pm-batch-subject-pill">
                <span className="pm-subject-dot pm-batch-dot" />
                <strong>{b.batch}</strong>
                <span className="pm-subject-count pm-batch-count">{b.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {recentQuizzes.length === 0 ? (
        <div className="pm-history-empty">
          <span style={{ fontSize: '2.5rem' }}>📋</span>
          <h3>No classroom quizzes logged yet</h3>
          <p>When faculty mentors launch and end quizzes, records populate here.</p>
        </div>
      ) : (
        <div className="pm-table-responsive">
          <table className="pm-admin-table">
            <thead>
              <tr>
                <th>PIN</th>
                <th>Topic &amp; Title</th>
                <th>Subject</th>
                <th>Batch</th>
                <th>Host Mentor</th>
                <th>Students</th>
                <th>Questions</th>
                <th>Date Hosted</th>
              </tr>
            </thead>
            <tbody>
              {recentQuizzes.map((q: any) => (
                <tr key={q.id}>
                  <td>
                    <span className="pm-session-code-pill">#{q.code}</span>
                  </td>
                  <td>
                    <strong className="pm-quiz-topic" style={{ fontSize: '0.85rem' }}>
                      {q.topic || 'Classroom Quiz'}
                    </strong>
                  </td>
                  <td>
                    <span className="pm-subject-badge" style={{ fontSize: '0.75rem' }}>
                      {q.subject || 'General'}
                    </span>
                  </td>
                  <td>
                    <span className="pm-batch-badge" style={{ fontSize: '0.72rem' }}>
                      {q.batch || 'General'}
                    </span>
                  </td>
                  <td>
                    <div className="pm-mentor-meta">
                      <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{q.hostName || 'Faculty Mentor'}</span>
                      <small style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{q.hostEmail}</small>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                      {q.studentsAttended ?? q.participantsCount ?? 0}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{q.questionCount ?? '—'}</span>
                  </td>
                  <td>
                    <span className="pm-date-text" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                      {new Date(q.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
