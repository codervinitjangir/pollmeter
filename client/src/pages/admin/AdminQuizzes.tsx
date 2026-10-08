import React, { useState, useMemo } from 'react';
import { useAdminData } from './AdminContext';

export default function AdminQuizzes() {
  const { overview } = useAdminData();
  const [showAllCohorts, setShowAllCohorts] = useState(false);
  const [quizSearch, setQuizSearch] = useState('');
  const [quizSubjectFilter, setQuizSubjectFilter] = useState('all');

  const subjects = overview?.subjects || [];
  const batches = overview?.batches || [];
  const recentQuizzes = overview?.recentQuizzes || [];
  const visibleBatches = showAllCohorts ? batches : batches.slice(0, 8);

  // Filter quizzes by search and subject
  const filteredQuizzes = useMemo(() => {
    return recentQuizzes.filter((q: any) => {
      if (quizSubjectFilter !== 'all' && q.subject !== quizSubjectFilter) {
        return false;
      }
      if (!quizSearch.trim()) return true;
      const term = quizSearch.toLowerCase().trim();
      return (
        (q.topic && q.topic.toLowerCase().includes(term)) ||
        (q.code && q.code.toString().includes(term)) ||
        (q.subject && q.subject.toLowerCase().includes(term)) ||
        (q.batch && q.batch.toLowerCase().includes(term)) ||
        (q.hostName && q.hostName.toLowerCase().includes(term)) ||
        (q.hostEmail && q.hostEmail.toLowerCase().includes(term))
      );
    });
  }, [recentQuizzes, quizSearch, quizSubjectFilter]);

  // Aggregate stats
  const totalAttendees = useMemo(() => {
    return recentQuizzes.reduce((sum: number, q: any) => sum + (q.studentsAttended ?? q.participantsCount ?? 0), 0);
  }, [recentQuizzes]);

  const avgAttendees = useMemo(() => {
    if (recentQuizzes.length === 0) return 0;
    return Math.round(totalAttendees / recentQuizzes.length);
  }, [recentQuizzes, totalAttendees]);

  return (
    <section className="pm-admin-panel-card">
      <div className="pm-panel-header-row">
        <div>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Classroom Quiz Logs</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0' }}>
            Audited live quiz sessions across all cohorts and academic subjects
          </p>
        </div>
        <span className="pm-table-count">
          Showing <strong>{filteredQuizzes.length}</strong> of <strong>{recentQuizzes.length}</strong> sessions
        </span>
      </div>

      {/* ─── Metric Bar ─── */}
      <div className="pm-admin-metrics-bar">
        <div className="pm-admin-metric-chip">
          <span>📊 Total Sessions:</span>
          <strong>{recentQuizzes.length}</strong>
        </div>
        <div className="pm-admin-metric-chip pm-admin-metric-chip--success">
          <span>👥 Total Attendees:</span>
          <strong>{totalAttendees}</strong>
        </div>
        <div className="pm-admin-metric-chip">
          <span>📈 Avg Attendees / Quiz:</span>
          <strong>{avgAttendees}</strong>
        </div>
      </div>

      {/* Active Academic Subjects */}
      {subjects.length > 0 && (
        <div className="pm-admin-subjects-section" style={{ marginBottom: '0.75rem', marginTop: '0.75rem', padding: '0 1.25rem' }}>
          <span className="pm-subjects-heading">Active Subjects:</span>
          <div className="pm-subject-tags-list">
            {subjects.map((sub, i) => (
              <div
                key={i}
                className="pm-subject-pill"
                onClick={() => setQuizSubjectFilter(quizSubjectFilter === sub.subject ? 'all' : sub.subject)}
                style={{ cursor: 'pointer', opacity: quizSubjectFilter === 'all' || quizSubjectFilter === sub.subject ? 1 : 0.5 }}
                title={`Click to filter by ${sub.subject}`}
              >
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
        <div className="pm-admin-subjects-section" style={{ marginBottom: '1rem', padding: '0 1.25rem' }}>
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

      {/* ─── Search & Subject Filter Toolbar ─── */}
      <div className="pm-panel-header-row" style={{ background: 'transparent' }}>
        <div className="pm-panel-toolbar-left" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div className="pm-search-input-wrap">
            <span>🔍</span>
            <input
              type="text"
              placeholder="Search by topic, PIN code, host mentor, or subject..."
              value={quizSearch}
              onChange={(e) => setQuizSearch(e.target.value)}
            />
            {quizSearch && (
              <button className="pm-search-clear" onClick={() => setQuizSearch('')}>
                ✕
              </button>
            )}
          </div>

          {subjects.length > 0 && (
            <select
              className="pm-filter-select"
              value={quizSubjectFilter}
              onChange={(e) => setQuizSubjectFilter(e.target.value)}
              title="Filter by Subject"
            >
              <option value="all">📚 All Subjects ({recentQuizzes.length})</option>
              {subjects.map((s) => (
                <option key={s.subject} value={s.subject}>
                  {s.subject} ({s.count})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {recentQuizzes.length === 0 ? (
        <div className="pm-history-empty">
          <span style={{ fontSize: '2.5rem' }}>📋</span>
          <h3>No classroom quizzes logged yet</h3>
          <p>When faculty mentors launch and end quizzes, records populate here.</p>
        </div>
      ) : filteredQuizzes.length === 0 ? (
        <div className="pm-history-empty" style={{ padding: '2.5rem 1rem' }}>
          <span style={{ fontSize: '2.4rem' }}>🔍</span>
          <h4 style={{ margin: '0.5rem 0 0.2rem', fontWeight: 700 }}>No matching quizzes found</h4>
          <p style={{ margin: 0, fontSize: '0.84rem', color: '#64748B' }}>
            No quiz matches &quot;{quizSearch}&quot;. Try adjusting your search query or subject filter.
          </p>
          {(quizSearch || quizSubjectFilter !== 'all') && (
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginTop: '0.85rem' }}
              onClick={() => {
                setQuizSearch('');
                setQuizSubjectFilter('all');
              }}
            >
              Reset Filters
            </button>
          )}
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
              {filteredQuizzes.map((q: any) => (
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
                      {(q.year ? `Year ${q.year} • ` : '') + (q.subject || 'General')}
                    </span>
                  </td>
                  <td>
                    <span className="pm-batch-badge" style={{ fontSize: '0.72rem' }}>
                      {q.year ? `Year ${q.year}` : (q.batch || 'Campus')}
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
