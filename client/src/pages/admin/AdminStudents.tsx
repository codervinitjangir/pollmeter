import React, { useState, useEffect, useMemo } from 'react';
import { searchStudentAudit, adminUpdateStudentBatch, BatchObject } from '../../auth';
import { useAdminData } from './AdminContext';
import AcademicDrilldown, { AcademicDrilldownValue, EMPTY_DRILL } from './AcademicDrilldown';

function formatStudentYear(raw?: string): string {
  if (!raw) return 'General';
  const m = raw.match(/\b([1-9])\b|\b([1-9])(?:st|nd|rd|th)\b/i);
  if (m) {
    const d = m[1] || m[2];
    const suf = d === '1' ? 'st' : d === '2' ? 'nd' : d === '3' ? 'rd' : 'th';
    return `${d}${suf} Year`;
  }
  return raw;
}

export default function AdminStudents() {
  const {
    authUser,
    studentAudit,
    setStudentAudit,
    loading,
    allBatchObjects,
    activeSubjects,
    showToast,
  } = useAdminData();

  const [studentSearch, setStudentSearch] = useState('');
  const [drill, setDrill] = useState<AcademicDrilldownValue>({ ...EMPTY_DRILL });
  const [studentStatusFilter, setStudentStatusFilter] = useState<'all' | 'regular' | 'top'>('all');

  // Academic year edit modal state
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [yearModalValue, setYearModalValue] = useState('');
  const [yearModalSaving, setYearModalSaving] = useState(false);
  const [yearModalError, setYearModalError] = useState('');

  // Handle student audit search debounce
  useEffect(() => {
    if (!authUser || authUser.role !== 'admin') return;
    const timer = setTimeout(() => {
      searchStudentAudit(studentSearch, {
        year: drill.year,
        subject: drill.subject,
      })
        .then((data) => setStudentAudit(data))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [studentSearch, drill.year, drill.subject, authUser, setStudentAudit]);

  // Derived counts
  const regularCount = useMemo(
    () => studentAudit.filter((s) => s.quizCount >= 3).length,
    [studentAudit]
  );
  const topCount = useMemo(
    () => studentAudit.filter((s) => s.avgScore >= 1200).length,
    [studentAudit]
  );
  const activeCount = useMemo(
    () => studentAudit.filter((s) => Boolean(s.lastQuizDate)).length,
    [studentAudit]
  );

  // Filtered students based on status segment
  const displayedStudents = useMemo(() => {
    return studentAudit.filter((s) => {
      if (studentStatusFilter === 'regular') return s.quizCount >= 3;
      if (studentStatusFilter === 'top') return s.avgScore >= 1200;
      return true;
    });
  }, [studentAudit, studentStatusFilter]);

  function openYearModal(email: string, currentBatchName?: string) {
    setEditingEmail(email);
    // Find matching year digit if present
    const m = (currentBatchName || '').match(/\b([1-4])\b|\b([1-4])(?:st|nd|rd|th)\b/i);
    setYearModalValue(m ? m[1] || m[2] : '');
    setYearModalError('');
  }

  async function saveYearChange() {
    if (!editingEmail) return;
    setYearModalSaving(true);
    setYearModalError('');
    try {
      // Find a matching batch object representing this year if one exists, or null
      let targetBatchId: string | null = null;
      if (yearModalValue) {
        const found = allBatchObjects.find((b: BatchObject) => {
          const m = b.displayName.match(/\b([1-4])\b|\b([1-4])(?:st|nd|rd|th)\b/i);
          return m && (m[1] === yearModalValue || m[2] === yearModalValue);
        });
        targetBatchId = found ? found.id : null;
      }

      await adminUpdateStudentBatch(editingEmail, targetBatchId);
      showToast(`Academic Year updated for ${editingEmail}.`);
      setEditingEmail(null);
      // Refresh the list
      const data = await searchStudentAudit(studentSearch, {
        year: drill.year,
        subject: drill.subject,
      });
      setStudentAudit(data);
    } catch (err: any) {
      setYearModalError(err.message || 'Failed to update student academic year.');
    } finally {
      setYearModalSaving(false);
    }
  }

  return (
    <section className="pm-admin-panel-card">
      <AcademicDrilldown
        value={drill}
        onChange={setDrill}
        subjects={activeSubjects}
      />

      {/* ─── Metric Bar ─── */}
      <div className="pm-admin-metrics-bar">
        <div className="pm-admin-metric-chip">
          <span>👥 Total Students:</span>
          <strong>{studentAudit.length}</strong>
        </div>
        <div className="pm-admin-metric-chip pm-admin-metric-chip--success">
          <span>🌟 Regular Participants:</span>
          <strong>{regularCount}</strong>
        </div>
        <div className="pm-admin-metric-chip" style={{ borderColor: 'rgba(99, 102, 241, 0.4)' }}>
          <span style={{ color: '#6366F1' }}>🏆 High Performers:</span>
          <strong style={{ color: '#6366F1' }}>{topCount}</strong>
        </div>
        <div className="pm-admin-metric-chip">
          <span>⚡ Active Takers:</span>
          <strong>{activeCount}</strong>
        </div>
      </div>

      {/* ─── Search & Filter Toolbar ─── */}
      <div className="pm-panel-header-row">
        <div className="pm-panel-toolbar-left" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div className="pm-search-input-wrap">
            <span>🔍</span>
            <input
              type="text"
              placeholder="Audit student by name or university email ID..."
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
            />
            {studentSearch && (
              <button className="pm-search-clear" onClick={() => setStudentSearch('')}>
                ✕
              </button>
            )}
          </div>

          <div className="pm-filter-segmented-group">
            <button
              type="button"
              className={`pm-filter-segmented-btn ${studentStatusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStudentStatusFilter('all')}
            >
              All ({studentAudit.length})
            </button>
            <button
              type="button"
              className={`pm-filter-segmented-btn ${studentStatusFilter === 'regular' ? 'active' : ''}`}
              onClick={() => setStudentStatusFilter('regular')}
            >
              Regulars ({regularCount})
            </button>
            <button
              type="button"
              className={`pm-filter-segmented-btn ${studentStatusFilter === 'top' ? 'active' : ''}`}
              onClick={() => setStudentStatusFilter('top')}
            >
              Top Scorers ({topCount})
            </button>
          </div>
        </div>

        <span className="pm-table-count">
          Showing <strong>{displayedStudents.length}</strong> of <strong>{studentAudit.length}</strong> student{studentAudit.length === 1 ? '' : 's'}
        </span>
      </div>

      {loading ? (
        <div className="pm-history-loading">
          <div className="spinner" />
          <p>Auditing cross-subject student records...</p>
        </div>
      ) : displayedStudents.length === 0 ? (
        <div className="pm-history-empty" style={{ padding: '2.5rem 1rem' }}>
          <span style={{ fontSize: '3rem' }}>🎯</span>
          <h3 style={{ margin: '0.5rem 0 0.2rem', fontWeight: 700 }}>No student records found</h3>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B' }}>
            {studentSearch
              ? `No student matches "${studentSearch}". Try clearing your search.`
              : 'When students participate in live quizzes across any mentor’s class, their scores appear here.'}
          </p>
          {studentSearch && (
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginTop: '0.85rem' }}
              onClick={() => setStudentSearch('')}
            >
              Clear Search
            </button>
          )}
        </div>
      ) : (
        <div className="pm-table-responsive">
          <table className="pm-admin-table">
            <thead>
              <tr>
                <th>Student Name</th>
                <th>College Email</th>
                <th>Academic Year</th>
                <th>Quizzes Attempted</th>
                <th>Average Score</th>
                <th>Last Active Session</th>
                <th>University Standing</th>
              </tr>
            </thead>
            <tbody>
              {displayedStudents.map((s, idx) => {
                const scoreClass =
                  s.avgScore >= 1200
                    ? 'pm-score-high'
                    : s.avgScore >= 700
                    ? 'pm-score-mid'
                    : 'pm-score-low';
                const yearLabel = formatStudentYear(s.batchName);

                return (
                  <tr key={s.email || idx}>
                    <td>
                      <strong className="pm-student-name">{s.realName}</strong>
                    </td>
                    <td>
                      <code className="pm-student-email">{s.email}</code>
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <span className="pm-badge-batch" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                          🎓 {yearLabel}
                          <button
                            type="button"
                            className="pm-search-clear"
                            style={{ fontSize: '0.75rem', marginLeft: '4px', opacity: 0.8, cursor: 'pointer' }}
                            title="Edit student academic year"
                            onClick={() => openYearModal(s.email, s.batchName)}
                          >
                            ✎
                          </button>
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className="pm-count-badge">
                        {s.quizCount} {s.quizCount === 1 ? 'quiz' : 'quizzes'}
                      </span>
                    </td>
                    <td>
                      <span className={`pm-score-pill ${scoreClass}`}>
                        {s.avgScore} pts
                      </span>
                    </td>
                    <td>
                      <span className="pm-date-text">
                        {s.lastQuizDate
                          ? new Date(s.lastQuizDate).toLocaleDateString()
                          : '—'}
                      </span>
                    </td>
                    <td>
                      <span className="pm-badge-standing">
                        {s.quizCount >= 3 ? '🌟 Regular' : '🌱 Active'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Academic Year Edit Modal ─── */}
      {editingEmail && (
        <div
          className="pm-auth-modal-backdrop"
          onClick={() => !yearModalSaving && setEditingEmail(null)}
          style={{ zIndex: 10000 }}
        >
          <div
            className="pm-admin-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '420px', width: '92%' }}
          >
            <div className="pm-admin-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.4rem' }}>🎓</span>
                <div>
                  <h3 className="pm-admin-modal-title">Set Academic Year</h3>
                  <p className="pm-admin-modal-sub">
                    <code style={{ fontSize: '0.78rem' }}>{editingEmail}</code>
                  </p>
                </div>
              </div>
              <button
                className="pm-auth-close-btn"
                onClick={() => setEditingEmail(null)}
                disabled={yearModalSaving}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '1.25rem 1.5rem' }}>
              {yearModalError && (
                <div className="pm-auth-error-alert" style={{ marginBottom: '1rem' }}>
                  <span>⚠️ {yearModalError}</span>
                </div>
              )}

              <label style={{ fontSize: '0.82rem', fontWeight: 700, display: 'block', marginBottom: '0.45rem' }}>
                Academic Year
              </label>
              <select
                className="input pm-host-select"
                value={yearModalValue}
                onChange={(e) => setYearModalValue(e.target.value)}
                disabled={yearModalSaving}
                style={{ width: '100%', marginBottom: '1.25rem', padding: '0.55rem 0.8rem' }}
              >
                <option value="">— General / Not Specified —</option>
                <option value="1">1st Year</option>
                <option value="2">2nd Year</option>
                <option value="3">3rd Year</option>
                <option value="4">4th Year</option>
              </select>

              <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingEmail(null)}
                  disabled={yearModalSaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={saveYearChange}
                  disabled={yearModalSaving}
                >
                  {yearModalSaving ? 'Saving…' : 'Save Academic Year'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
