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
    loadAllData,
  } = useAdminData();

  const totalMentors = overview?.totalMentors ?? facultyList.length;
  const totalStudents = overview?.totalStudents ?? studentAudit.length;
  const totalQuizzes = overview?.totalQuizzes ?? 0;
  const totalResponses = overview?.totalResponses ?? 0;
  const recentQuizzes = overview?.recentQuizzes || [];
  const topSubjects = (overview?.subjects || []).slice(0, 5);
  const topBatches = (overview?.batches || []).slice(0, 6);

  return (
    <div className="pm-admin-overview-page">
      {/* ─── Metric KPI Cards (Only on Main Dashboard) ────────────────────── */}
      <section className="pm-admin-kpi-grid">
        <div className="pm-kpi-card pm-kpi-card-amber">
          <div className="pm-kpi-icon-wrap">
            <span>👨‍🏫</span>
          </div>
          <div className="pm-kpi-body">
            <span className="pm-kpi-label">Faculty Mentors</span>
            <div className="pm-kpi-val-row">
              <span className="pm-kpi-number">{totalMentors}</span>
              <button
                className="pm-kpi-quick-action"
                onClick={() => navigate('/admin/faculty?add=true')}
                id="overview-add-mentor-btn"
              >
                + Add Mentor
              </button>
            </div>
            <span className="pm-kpi-caption">Verified subject specialists</span>
          </div>
        </div>

        <div className="pm-kpi-card pm-kpi-card-emerald">
          <div className="pm-kpi-icon-wrap">
            <span>🎓</span>
          </div>
          <div className="pm-kpi-body">
            <span className="pm-kpi-label">Active Students</span>
            <span className="pm-kpi-number">{totalStudents}</span>
            <span className="pm-kpi-caption">Unified across all departments</span>
          </div>
        </div>

        <div className="pm-kpi-card pm-kpi-card-blue">
          <div className="pm-kpi-icon-wrap">
            <span>📝</span>
          </div>
          <div className="pm-kpi-body">
            <span className="pm-kpi-label">Quizzes Hosted</span>
            <span className="pm-kpi-number">{totalQuizzes}</span>
            <span className="pm-kpi-caption">Classroom sessions conducted</span>
          </div>
        </div>

        <div className="pm-kpi-card pm-kpi-card-purple">
          <div className="pm-kpi-icon-wrap">
            <span>⚡</span>
          </div>
          <div className="pm-kpi-body">
            <span className="pm-kpi-label">Student Responses</span>
            <span className="pm-kpi-number">{totalResponses}</span>
            <span className="pm-kpi-caption">Live interactions evaluated</span>
          </div>
        </div>
      </section>

      {/* Pending Account Alert */}
      {pendingCount > 0 && (
        <div className="pm-pending-banner" style={{ marginBottom: '1.25rem' }}>
          <span className="pm-pending-banner-icon">⚠️</span>
          <div style={{ flex: 1 }}>
            <strong>{pendingCount} faculty account{pendingCount === 1 ? '' : 's'} awaiting administrative approval</strong>
            <span>Review credentials and grant quiz-hosting clearance in the Faculty Directory.</span>
          </div>
          <button
            className="pm-admin-add-btn"
            style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
            onClick={() => navigate('/admin/faculty')}
          >
            Review Faculty →
          </button>
        </div>
      )}

      {/* ─── Two-Column Overview Dashboard ────────────────────────────────── */}
      <div className="pm-overview-grid">
        {/* Left Column: Recent Activity & Quick Navigation */}
        <div className="pm-overview-main-col">
          <section className="pm-admin-panel-card" style={{ marginBottom: '1.5rem' }}>
            <div className="pm-panel-header-row">
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Recent Classroom Quizzes</h3>
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Latest interactive quiz sessions conducted by faculty
                </p>
              </div>
              <button
                className="pm-btn-secondary"
                style={{ fontSize: '0.8rem', padding: '0.35rem 0.8rem', borderRadius: '8px' }}
                onClick={() => navigate('/admin/quizzes')}
              >
                View All Quizzes →
              </button>
            </div>

            {loading ? (
              <div className="pm-history-loading" style={{ padding: '2rem 1rem' }}>
                <div className="spinner" />
                <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Loading recent sessions...</p>
              </div>
            ) : recentQuizzes.length === 0 ? (
              <div className="pm-history-empty" style={{ padding: '2.5rem 1rem' }}>
                <span style={{ fontSize: '2.2rem' }}>📋</span>
                <h4 style={{ margin: '0.4rem 0 0.2rem', fontSize: '0.95rem' }}>No quizzes hosted yet</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Quizzes hosted by faculty mentors will populate here automatically.
                </p>
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
                      <th>Mentor</th>
                      <th>Students</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentQuizzes.slice(0, 6).map((q: any) => (
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
                          <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                            {q.hostName || q.hostEmail?.split('@')[0] || 'Faculty'}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                            {q.studentsAttended ?? q.participantsCount ?? 0}
                          </span>
                        </td>
                        <td>
                          <span className="pm-date-text" style={{ fontSize: '0.75rem' }}>
                            {q.createdAt ? new Date(q.createdAt).toLocaleDateString() : 'Today'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Quick Launch Cards */}
          <div className="pm-quick-actions-row">
            <div
              className="pm-action-tile"
              onClick={() => navigate('/admin/faculty')}
              role="button"
              tabIndex={0}
            >
              <div className="pm-action-tile-icon" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#F59E0B' }}>
                👨‍🏫
              </div>
              <div className="pm-action-tile-body">
                <strong>Manage Faculty</strong>
                <span>Assign subjects, edit batches &amp; permissions</span>
              </div>
              <span className="pm-action-tile-arrow">→</span>
            </div>

            <div
              className="pm-action-tile"
              onClick={() => navigate('/admin/students')}
              role="button"
              tabIndex={0}
            >
              <div className="pm-action-tile-icon" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10B981' }}>
                🎓
              </div>
              <div className="pm-action-tile-body">
                <strong>Student Audit</strong>
                <span>Inspect student scores, attendance &amp; batch tags</span>
              </div>
              <span className="pm-action-tile-arrow">→</span>
            </div>

            <div
              className="pm-action-tile"
              onClick={() => navigate('/admin/batches')}
              role="button"
              tabIndex={0}
            >
              <div className="pm-action-tile-icon" style={{ background: 'rgba(99, 102, 241, 0.12)', color: '#6366F1' }}>
                🗂️
              </div>
              <div className="pm-action-tile-body">
                <strong>Cohorts &amp; Batches</strong>
                <span>Configure academic years &amp; sections</span>
              </div>
              <span className="pm-action-tile-arrow">→</span>
            </div>
          </div>
        </div>

        {/* Right Column: Breakdown & Quick Analytics */}
        <div className="pm-overview-side-col">
          {/* Active Academic Subjects */}
          <section className="pm-admin-panel-card" style={{ marginBottom: '1.25rem' }}>
            <div className="pm-panel-header-row" style={{ marginBottom: '0.75rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>Top Subjects</h4>
              <button
                className="pm-drill-crumb-clear"
                style={{ fontSize: '0.75rem' }}
                onClick={() => navigate('/admin/quizzes')}
              >
                All →
              </button>
            </div>

            {topSubjects.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                No subject statistics logged yet.
              </p>
            ) : (
              <div className="pm-subject-bars-list">
                {topSubjects.map((sub, i) => {
                  const maxCount = Math.max(...topSubjects.map((s) => s.count), 1);
                  const pct = Math.round((sub.count / maxCount) * 100);
                  return (
                    <div key={i} className="pm-subject-bar-item">
                      <div className="pm-subject-bar-header">
                        <span className="pm-subject-bar-title">{sub.subject}</span>
                        <span className="pm-subject-bar-val">{sub.count} quizzes</span>
                      </div>
                      <div className="pm-subject-bar-track">
                        <div className="pm-subject-bar-fill" style={{ width: `${Math.max(pct, 8)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Active Cohorts & Batches */}
          <section className="pm-admin-panel-card" style={{ marginBottom: '1.25rem' }}>
            <div className="pm-panel-header-row" style={{ marginBottom: '0.75rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>Active Cohorts</h4>
              <button
                className="pm-drill-crumb-clear"
                style={{ fontSize: '0.75rem' }}
                onClick={() => navigate('/admin/batches')}
              >
                Manage ({allBatchObjects.length || standardBatches.length}) →
              </button>
            </div>

            <div className="pm-cohorts-chip-grid">
              {(topBatches.length > 0 ? topBatches.map((b) => b.batch) : standardBatches.slice(0, 6)).map((batchName, idx) => (
                <div key={idx} className="pm-cohort-chip">
                  <span className="pm-cohort-dot" />
                  <span>{batchName}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Institutional Compliance Seal */}
          <div className="pm-compliance-summary-card">
            <div className="pm-compliance-icon">🛡️</div>
            <div>
              <strong style={{ fontSize: '0.85rem', display: 'block', color: 'var(--text-primary)' }}>
                MSU Domain Cryptography
              </strong>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4, display: 'block', marginTop: '2px' }}>
                Strict SSO active for <code>@polariscampus.com</code> &amp; <code>@medhaviskillsuniversity.edu.in</code>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
