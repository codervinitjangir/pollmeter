import React from 'react';
import { useAdminData } from './AdminContext';

export default function AdminQuizzes() {
  const { overview } = useAdminData();

  return (
    <section className="pm-admin-panel-card">
      <div className="pm-panel-header-row">
        <div>
          <h3>All Quizzes Hosted Across Departments</h3>
          <p style={{ fontSize: '0.82rem', color: '#64748B', marginTop: '0.2rem' }}>
            Audited classroom quiz sessions hosted by faculty mentors across courses and cohorts.
          </p>
        </div>
        <span className="pm-table-count">
          <strong>{overview?.recentQuizzes?.length ?? 0}</strong> recent sessions
        </span>
      </div>

      {/* Active Academic Subjects & Courses */}
      {overview?.subjects && overview.subjects.length > 0 && (
        <div className="pm-admin-subjects-section" style={{ marginBottom: '0.85rem', marginTop: '0.5rem' }}>
          <span className="pm-subjects-heading">Active Academic Subjects &amp; Courses:</span>
          <div className="pm-subject-tags-list">
            {overview.subjects.map((sub, i) => (
              <div key={i} className="pm-subject-pill">
                <span className="pm-subject-dot" />
                <strong>{sub.subject}</strong>
                <span className="pm-subject-count">
                  {sub.count} {sub.count === 1 ? 'quiz' : 'quizzes'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Academic Cohorts & Batches */}
      {overview?.batches && overview.batches.length > 0 && (
        <div className="pm-admin-subjects-section" style={{ marginBottom: '1.25rem' }}>
          <span className="pm-subjects-heading">Active Academic Cohorts &amp; Batches:</span>
          <div className="pm-subject-tags-list">
            {overview.batches.map((b, i) => (
              <div key={i} className="pm-subject-pill pm-batch-subject-pill">
                <span className="pm-subject-dot pm-batch-dot" />
                <strong>{b.batch}</strong>
                <span className="pm-subject-count pm-batch-count">
                  {b.count} {b.count === 1 ? 'quiz' : 'quizzes'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!overview?.recentQuizzes || overview.recentQuizzes.length === 0 ? (
        <div className="pm-history-empty">
          <span style={{ fontSize: '3rem' }}>📋</span>
          <h3>No classroom quizzes logged yet</h3>
          <p>When faculty mentors launch and end quizzes, university audit records will populate here.</p>
        </div>
      ) : (
        <div className="pm-table-responsive">
          <table className="pm-admin-table">
            <thead>
              <tr>
                <th>Session Code</th>
                <th>Topic &amp; Title</th>
                <th>Subject Specialization</th>
                <th>Target Batch</th>
                <th>Host Mentor</th>
                <th>Students Attended</th>
                <th>Questions</th>
                <th>Date Hosted</th>
              </tr>
            </thead>
            <tbody>
              {overview.recentQuizzes.map((q: any) => (
                <tr key={q.id}>
                  <td>
                    <span className="pm-session-code-pill">#{q.code}</span>
                  </td>
                  <td>
                    <strong className="pm-quiz-topic">{q.topic || 'Classroom Quiz'}</strong>
                  </td>
                  <td>
                    <span className="pm-subject-badge">{q.subject || 'General'}</span>
                  </td>
                  <td>
                    <span className="pm-batch-badge">🎓 {q.batch || 'General'}</span>
                  </td>
                  <td>
                    <div className="pm-mentor-meta">
                      <span>{q.hostName || 'Faculty Mentor'}</span>
                      <small>{q.hostEmail}</small>
                    </div>
                  </td>
                  <td>
                    <span className="pm-count-badge">
                      👥 {q.participantCount || 0}
                    </span>
                  </td>
                  <td>
                    <span>{q.questionCount || 0} Qs</span>
                  </td>
                  <td>
                    <span className="pm-date-text">
                      {new Date(q.createdAt).toLocaleDateString()}
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
