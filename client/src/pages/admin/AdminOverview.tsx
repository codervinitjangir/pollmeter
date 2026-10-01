import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminData } from './AdminContext';

export default function AdminOverview() {
  const navigate = useNavigate();
  const {
    overview,
    facultyList,
    studentAudit,
    standardBatches,
    allBatchObjects,
    pendingCount,
    loading,
  } = useAdminData();

  const totalMentors = overview?.totalMentors ?? facultyList.length;
  const totalStudents = overview?.totalStudents ?? studentAudit.length;
  const totalQuizzes = overview?.totalQuizzes ?? 0;
  const totalResponses = overview?.totalResponses ?? 0;
  const recentQuizzes = overview?.recentQuizzes || [];
  const topSubjects = (overview?.subjects || []).slice(0, 5);
  const topBatches = (overview?.batches || []).slice(0, 8);

  return (
    <div className="pm-overview-container">
      {/* ─── Metric KPI Cards ─────────────────────────────────────────────── */}
      <section className="pm-stats-grid">
        <div className="pm-stat-box pm-stat-amber">
          <div className="pm-stat-header">
            <span className="pm-stat-label">Faculty Mentors</span>
            <div className="pm-stat-icon">👨‍🏫</div>
          </div>
          <div className="pm-stat-value">{totalMentors}</div>
          <div className="pm-stat-meta">Verified educators</div>
        </div>

        <div className="pm-stat-box pm-stat-emerald">
          <div className="pm-stat-header">
            <span className="pm-stat-label">Active Students</span>
            <div className="pm-stat-icon">🎓</div>
          </div>
          <div className="pm-stat-value">{totalStudents}</div>
          <div className="pm-stat-meta">Across all departments</div>
        </div>

        <div className="pm-stat-box pm-stat-blue">
          <div className="pm-stat-header">
            <span className="pm-stat-label">Quizzes Hosted</span>
            <div className="pm-stat-icon">📝</div>
          </div>
          <div className="pm-stat-value">{totalQuizzes}</div>
          <div className="pm-stat-meta">Interactive sessions</div>
        </div>

        <div className="pm-stat-box pm-stat-purple">
          <div className="pm-stat-header">
            <span className="pm-stat-label">Student Responses</span>
            <div className="pm-stat-icon">⚡</div>
          </div>
          <div className="pm-stat-value">{totalResponses}</div>
          <div className="pm-stat-meta">Live evaluations</div>
        </div>
      </section>

      {/* Pending Account Alert */}
      {pendingCount > 0 && (
        <div className="pm-pending-alert">
          <div className="pm-pending-alert-content">
            <span className="pm-pending-icon">⚠️</span>
            <div>
              <strong>{pendingCount} faculty account{pendingCount === 1 ? '' : 's'} awaiting approval</strong>
              <p>Review credentials and activate quiz hosting clearance.</p>
            </div>
          </div>
          <button
            className="pm-btn-alert-action"
            onClick={() => navigate('/admin/faculty')}
          >
            Review Faculty →
          </button>
        </div>
      )}

      {/* ─── Main Content Grid ────────────────────────────────────────────── */}
      <div className="pm-dashboard-layout">
        {/* Left Column: Recent Quizzes */}
        <div className="pm-dashboard-main">
          <div className="pm-card pm-table-card">
            <div className="pm-card-header">
              <div>
                <h3 className="pm-card-title">Recent Classroom Quizzes</h3>
                <p className="pm-card-sub">Latest interactive quiz sessions conducted by faculty</p>
              </div>
              <button
                className="pm-card-action-btn"
                onClick={() => navigate('/admin/quizzes')}
              >
                View all quizzes →
              </button>
            </div>

            {loading ? (
              <div className="pm-card-loading">
                <div className="spinner" />
                <span>Loading sessions...</span>
              </div>
            ) : recentQuizzes.length === 0 ? (
              <div className="pm-card-empty">
                <span className="pm-empty-icon">📋</span>
                <h4>No quizzes hosted yet</h4>
                <p>Quizzes hosted by faculty mentors will appear here automatically.</p>
              </div>
            ) : (
              <div className="pm-table-wrapper">
                <table className="pm-modern-table">
                  <thead>
                    <tr>
                      <th style={{ width: '80px' }}>PIN</th>
                      <th>Topic &amp; Title</th>
                      <th>Subject</th>
                      <th>Batch</th>
                      <th>Mentor</th>
                      <th style={{ width: '70px', textAlign: 'center' }}>Students</th>
                      <th style={{ width: '90px', textAlign: 'right' }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentQuizzes.slice(0, 7).map((q: any) => (
                      <tr key={q.id}>
                        <td>
                          <span className="pm-pin-badge">#{q.code}</span>
                        </td>
                        <td>
                          <span className="pm-quiz-title-text" title={q.topic || 'Classroom Quiz'}>
                            {q.topic || 'Classroom Quiz'}
                          </span>
                        </td>
                        <td>
                          <span className="pm-tag pm-tag-subject" title={q.subject || 'General'}>
                            {q.subject || 'General'}
                          </span>
                        </td>
                        <td>
                          <span className="pm-tag pm-tag-batch" title={q.batch || 'All'}>
                            {q.batch || 'All'}
                          </span>
                        </td>
                        <td>
                          <span className="pm-mentor-name">
                            {q.hostName || q.hostEmail?.split('@')[0] || 'Faculty'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="pm-student-count-pill">
                            {q.studentsAttended ?? q.participantsCount ?? 0}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="pm-date-cell">
                            {q.createdAt ? new Date(q.createdAt).toLocaleDateString() : 'Today'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Analytics & Cohorts */}
        <div className="pm-dashboard-aside">
          {/* Top Subjects */}
          <div className="pm-card">
            <div className="pm-card-header">
              <h3 className="pm-card-title">Top Subjects</h3>
              <button
                className="pm-card-link-btn"
                onClick={() => navigate('/admin/quizzes')}
              >
                All →
              </button>
            </div>

            {topSubjects.length === 0 ? (
              <p className="pm-card-empty-text">No subject metrics recorded yet.</p>
            ) : (
              <div className="pm-progress-list">
                {topSubjects.map((sub, i) => {
                  const maxCount = Math.max(...topSubjects.map((s) => s.count), 1);
                  const pct = Math.round((sub.count / maxCount) * 100);
                  return (
                    <div key={i} className="pm-progress-item">
                      <div className="pm-progress-labels">
                        <span className="pm-progress-name" title={sub.subject}>{sub.subject}</span>
                        <span className="pm-progress-value">{sub.count} {sub.count === 1 ? 'quiz' : 'quizzes'}</span>
                      </div>
                      <div className="pm-progress-track">
                        <div
                          className="pm-progress-bar"
                          style={{ width: `${Math.max(pct, 6)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active Cohorts */}
          <div className="pm-card">
            <div className="pm-card-header">
              <h3 className="pm-card-title">Active Cohorts</h3>
              <button
                className="pm-card-link-btn"
                onClick={() => navigate('/admin/batches')}
              >
                Manage →
              </button>
            </div>

            <div className="pm-cohort-tags-wrap">
              {(topBatches.length > 0 ? topBatches.map((b) => b.batch) : standardBatches.slice(0, 8)).map((batchName, idx) => (
                <span key={idx} className="pm-cohort-pill" title={batchName}>
                  <span className="pm-cohort-bullet" />
                  <span className="pm-cohort-name">{batchName}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
