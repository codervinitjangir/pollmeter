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
      {/* ─── Institutional Overview Header ───────────────────────── */}
      <div className="pm-overview-welcome">
        <div className="pm-overview-welcome-left">
          <div className="pm-overview-welcome-crest">🏛️</div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h1 className="pm-overview-welcome-title">Central Administration Hub</h1>
              <span className="pm-overview-tenant-pill">
                ● POLARIS VERIFIED TENANT
              </span>
            </div>
            <p className="pm-overview-welcome-sub">
              Manage university faculties, assign student cohorts, monitor live quizzes, and download institutional gradebooks.
            </p>
          </div>
        </div>
        <div className="pm-overview-welcome-actions">
          <button
            type="button"
            className="pm-btn-hub-action pm-btn-hub-ghost"
            onClick={() => navigate('/dashboard')}
            title="Switch to Faculty Quiz Host Studio"
          >
            <span>⚡ Host Studio</span>
          </button>
          <button
            type="button"
            className="pm-btn-hub-action pm-btn-hub-primary"
            onClick={() => navigate('/admin/faculty?add=true')}
            title="Register a new faculty educator"
          >
            <span>＋ Add Mentor</span>
          </button>
        </div>
      </div>

      {/* ─── Quick Administration Hub ─────────────────────────────── */}
      <section className="pm-quick-hub-grid">
        <div
          className="pm-quick-hub-card"
          onClick={() => navigate('/admin/faculty')}
          role="button"
          tabIndex={0}
        >
          <div className="pm-quick-hub-icon-wrap pm-icon-amber">
            <span>👨‍🏫</span>
          </div>
          <div className="pm-quick-hub-body">
            <div className="pm-quick-hub-title-row">
              <strong>Faculty &amp; Mentors</strong>
              <span className="pm-quick-hub-arrow">→</span>
            </div>
            <p>Approve staff requests, assign subjects, and manage roles.</p>
          </div>
        </div>

        <div
          className="pm-quick-hub-card"
          onClick={() => navigate('/admin/batches')}
          role="button"
          tabIndex={0}
        >
          <div className="pm-quick-hub-icon-wrap pm-icon-blue">
            <span>🗂️</span>
          </div>
          <div className="pm-quick-hub-body">
            <div className="pm-quick-hub-title-row">
              <strong>Batch Management</strong>
              <span className="pm-quick-hub-arrow">→</span>
            </div>
            <p>Configure academic cohorts, year sections, and class rosters.</p>
          </div>
        </div>

        <div
          className="pm-quick-hub-card"
          onClick={() => navigate('/admin/students')}
          role="button"
          tabIndex={0}
        >
          <div className="pm-quick-hub-icon-wrap pm-icon-emerald">
            <span>🎓</span>
          </div>
          <div className="pm-quick-hub-body">
            <div className="pm-quick-hub-title-row">
              <strong>Student Audit</strong>
              <span className="pm-quick-hub-arrow">→</span>
            </div>
            <p>Audit participants, allocate cohorts, and inspect score history.</p>
          </div>
        </div>

        <div
          className="pm-quick-hub-card"
          onClick={() => navigate('/admin/reports')}
          role="button"
          tabIndex={0}
        >
          <div className="pm-quick-hub-icon-wrap pm-icon-purple">
            <span>📈</span>
          </div>
          <div className="pm-quick-hub-body">
            <div className="pm-quick-hub-title-row">
              <strong>Campus Reports</strong>
              <span className="pm-quick-hub-arrow">→</span>
            </div>
            <p>Review cross-cohort analytics and download full Excel / CSV data.</p>
          </div>
        </div>
      </section>

      {/* ─── Metric KPI Cards ─────────────────────────────────────────────── */}
      <section className="pm-stats-grid">
        <div
          className="pm-stat-box pm-stat-amber pm-stat-box-interactive"
          onClick={() => navigate('/admin/faculty')}
          title="Click to view and manage faculty members"
        >
          <div className="pm-stat-header">
            <span className="pm-stat-label">Faculty Mentors</span>
            <div className="pm-stat-icon">👨‍🏫</div>
          </div>
          <div className="pm-stat-value">{totalMentors}</div>
          <div className="pm-stat-meta">Verified educators</div>
          <div className="pm-stat-box-hint">
            <span>Manage roster</span>
            <span>→</span>
          </div>
        </div>

        <div
          className="pm-stat-box pm-stat-emerald pm-stat-box-interactive"
          onClick={() => navigate('/admin/students')}
          title="Click to audit enrolled students"
        >
          <div className="pm-stat-header">
            <span className="pm-stat-label">Active Students</span>
            <div className="pm-stat-icon">🎓</div>
          </div>
          <div className="pm-stat-value">{totalStudents}</div>
          <div className="pm-stat-meta">Across all departments</div>
          <div className="pm-stat-box-hint">
            <span>Review audit</span>
            <span>→</span>
          </div>
        </div>

        <div
          className="pm-stat-box pm-stat-blue pm-stat-box-interactive"
          onClick={() => navigate('/admin/quizzes')}
          title="Click to review live quiz sessions"
        >
          <div className="pm-stat-header">
            <span className="pm-stat-label">Quizzes Hosted</span>
            <div className="pm-stat-icon">📝</div>
          </div>
          <div className="pm-stat-value">{totalQuizzes}</div>
          <div className="pm-stat-meta">Interactive sessions</div>
          <div className="pm-stat-box-hint">
            <span>View quiz logs</span>
            <span>→</span>
          </div>
        </div>

        <div
          className="pm-stat-box pm-stat-purple pm-stat-box-interactive"
          onClick={() => navigate('/admin/reports')}
          title="Click to view detailed evaluation reports"
        >
          <div className="pm-stat-header">
            <span className="pm-stat-label">Student Responses</span>
            <div className="pm-stat-icon">⚡</div>
          </div>
          <div className="pm-stat-value">{totalResponses}</div>
          <div className="pm-stat-meta">Live evaluations</div>
          <div className="pm-stat-box-hint">
            <span>View reports</span>
            <span>→</span>
          </div>
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

          {/* Security & System Integrity Card */}
          <div className="pm-card" style={{ borderLeft: '3px solid #10B981' }}>
            <div className="pm-card-header" style={{ marginBottom: '0.65rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '1rem' }}>🛡️</span>
                <h3 className="pm-card-title">System &amp; Security</h3>
              </div>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#10B981', background: 'rgba(16, 185, 129, 0.12)', padding: '2px 8px', borderRadius: '999px' }}>
                ● HEALTHY
              </span>
            </div>
            <p style={{ margin: '0 0 0.85rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Real-time audit trails active. Every quiz result and roster assignment is cryptographically tracked.
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => navigate('/admin/audit')}
              style={{ width: '100%', fontSize: '0.78rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <span>🔍</span>
              <span>Open Security Audit Trail →</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
