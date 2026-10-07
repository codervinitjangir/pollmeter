import React, { useState, useEffect, useMemo } from 'react';
import { searchStudentAudit, adminUpdateStudentBatch, adminFetchBatches, BatchObject } from '../../auth';
import { useAdminData } from './AdminContext';
import AcademicDrilldown, { AcademicDrilldownValue, EMPTY_DRILL } from './AcademicDrilldown';

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
  /**
   * Browsing axis, independent of the text box below it: the drill-down answers
   * "show me this cohort", the search answers "find this one person".
   */
  const [drill, setDrill] = useState<AcademicDrilldownValue>({ ...EMPTY_DRILL });
  const [studentStatusFilter, setStudentStatusFilter] = useState<'all' | 'assigned' | 'unassigned' | 'regular'>('all');

  // Batch edit modal state
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [allBatches, setAllBatches] = useState<BatchObject[]>([]);
  const [batchModalValue, setBatchModalValue] = useState('');
  const [batchModalSaving, setBatchModalSaving] = useState(false);
  const [batchModalError, setBatchModalError] = useState('');

  // Handle student audit search debounce
  useEffect(() => {
    if (!authUser || authUser.role !== 'admin') return;
    const timer = setTimeout(() => {
      searchStudentAudit(studentSearch, {
        batchId: drill.batchId,
        year: drill.year,
        subject: drill.subject,
      })
        .then((data) => setStudentAudit(data))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [studentSearch, drill.batchId, drill.year, drill.subject, authUser, setStudentAudit]);

  // Derived counts
  const assignedCount = useMemo(
    () => studentAudit.filter((s) => Boolean(s.batchName)).length,
    [studentAudit]
  );
  const unassignedCount = useMemo(
    () => studentAudit.filter((s) => !s.batchName).length,
    [studentAudit]
  );
  const regularCount = useMemo(
    () => studentAudit.filter((s) => s.quizCount >= 3).length,
    [studentAudit]
  );

  // Filtered students based on status segment
  const displayedStudents = useMemo(() => {
    return studentAudit.filter((s) => {
      if (studentStatusFilter === 'assigned') return Boolean(s.batchName);
      if (studentStatusFilter === 'unassigned') return !s.batchName;
      if (studentStatusFilter === 'regular') return s.quizCount >= 3;
      return true;
    });
  }, [studentAudit, studentStatusFilter]);

  function openBatchModal(email: string, currentBatchId?: string) {
    setEditingEmail(email);
    setBatchModalValue(currentBatchId || '');
    setBatchModalError('');
    if (allBatches.length === 0) {
      adminFetchBatches().then(setAllBatches).catch(() => {});
    }
  }

  async function saveBatchChange() {
    if (!editingEmail) return;
    setBatchModalSaving(true);
    setBatchModalError('');
    try {
      await adminUpdateStudentBatch(editingEmail, batchModalValue || null);
      showToast(`Batch updated for ${editingEmail}.`);
      setEditingEmail(null);
      // Refresh the list
      const data = await searchStudentAudit(studentSearch, {
        batchId: drill.batchId,
        year: drill.year,
        subject: drill.subject,
      });
      setStudentAudit(data);
    } catch (err: any) {
      setBatchModalError(err.message || 'Failed to update student batch.');
    } finally {
      setBatchModalSaving(false);
    }
  }

  return (
    <section className="pm-admin-panel-card">
      {/*
        Mentor is not forwarded to the student endpoint — a student belongs to a
        batch, not to a mentor, so the facet would have nothing to match.
      */}
      <AcademicDrilldown
        value={drill}
        onChange={setDrill}
        subjects={activeSubjects}
        batches={allBatchObjects}
      />

      {/* ─── Metric Bar ─── */}
      <div className="pm-admin-metrics-bar">
        <div className="pm-admin-metric-chip">
          <span>👥 Total Students:</span>
          <strong>{studentAudit.length}</strong>
        </div>
        <div className="pm-admin-metric-chip pm-admin-metric-chip--success">
          <span>🎓 Batch Assigned:</span>
          <strong>{assignedCount}</strong>
        </div>
        {unassignedCount > 0 && (
          <div className="pm-admin-metric-chip" style={{ borderColor: 'rgba(245, 158, 11, 0.4)' }}>
            <span style={{ color: '#D97706' }}>⚠️ Unassigned:</span>
            <strong style={{ color: '#D97706' }}>{unassignedCount}</strong>
          </div>
        )}
        <div className="pm-admin-metric-chip">
          <span>🌟 Regular Participants:</span>
          <strong>{regularCount}</strong>
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
              className={`pm-filter-segmented-btn ${studentStatusFilter === 'assigned' ? 'active' : ''}`}
              onClick={() => setStudentStatusFilter('assigned')}
            >
              Assigned ({assignedCount})
            </button>
            <button
              type="button"
              className={`pm-filter-segmented-btn ${studentStatusFilter === 'unassigned' ? 'active' : ''}`}
              onClick={() => setStudentStatusFilter('unassigned')}
            >
              Unassigned ({unassignedCount})
            </button>
            <button
              type="button"
              className={`pm-filter-segmented-btn ${studentStatusFilter === 'regular' ? 'active' : ''}`}
              onClick={() => setStudentStatusFilter('regular')}
            >
              Regulars ({regularCount})
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
                <th>Batch / Cohort</th>
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
                return (
                  <tr key={s.email || idx}>
                    <td>
                      <strong className="pm-student-name">{s.realName}</strong>
                    </td>
                    <td>
                      <code className="pm-student-email">{s.email}</code>
                    </td>
                    <td>
                      {s.batchName ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <span className="pm-badge-batch" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                          🎓 {s.batchName}
                          <button
                            type="button"
                            className="pm-search-clear"
                            style={{ fontSize: '0.75rem', marginLeft: '4px', opacity: 0.8, cursor: 'pointer' }}
                            title="Change student cohort / batch"
                            onClick={() => openBatchModal(s.email, s.batchId)}
                          >
                            ✎
                          </button>
                        </span>
                        {/*
                          Students may sit any batch's exam, so the drill-down
                          lists everyone who took this batch's quiz. Without this
                          marker the row shows one batch under a tile for
                          another and reads as a bug.
                        */}
                        {s.visiting && (
                          <span
                            title="Took this batch's quiz but is enrolled elsewhere"
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              letterSpacing: '0.02em',
                              padding: '0.1rem 0.4rem',
                              borderRadius: '999px',
                              color: '#F59E0B',
                              background: 'rgba(245, 158, 11, 0.12)',
                              border: '1px solid rgba(245, 158, 11, 0.35)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            visiting
                          </span>
                        )}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.74rem', padding: '0.2rem 0.55rem', color: '#D97706', borderColor: 'rgba(245, 158, 11, 0.4)' }}
                          onClick={() => openBatchModal(s.email)}
                        >
                          ＋ Assign batch
                        </button>
                      )}
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

      {/* ─── Batch Edit Modal (Refined for Light & Dark Theme) ─── */}
      {editingEmail && (
        <div
          className="pm-auth-modal-backdrop"
          onClick={() => !batchModalSaving && setEditingEmail(null)}
          style={{ zIndex: 10000 }}
        >
          <div
            className="pm-admin-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '440px', width: '92%' }}
          >
            <div className="pm-admin-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.4rem' }}>🎓</span>
                <div>
                  <h3 className="pm-admin-modal-title">Assign Student Cohort</h3>
                  <p className="pm-admin-modal-sub">
                    <code style={{ fontSize: '0.78rem' }}>{editingEmail}</code>
                  </p>
                </div>
              </div>
              <button
                className="pm-auth-close-btn"
                onClick={() => setEditingEmail(null)}
                disabled={batchModalSaving}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '1.25rem 1.5rem' }}>
              {batchModalError && (
                <div className="pm-auth-error-alert" style={{ marginBottom: '1rem' }}>
                  <span>⚠️ {batchModalError}</span>
                </div>
              )}

              <label style={{ fontSize: '0.82rem', fontWeight: 700, display: 'block', marginBottom: '0.45rem' }}>
                Assigned Cohort / Batch
              </label>
              <select
                className="input pm-host-select"
                value={batchModalValue}
                onChange={(e) => setBatchModalValue(e.target.value)}
                disabled={batchModalSaving}
                style={{ width: '100%', marginBottom: '1.25rem', padding: '0.55rem 0.8rem' }}
              >
                <option value="">— No batch / Clear cohort —</option>
                {allBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.displayName} {b.status === 'inactive' ? '(Archived)' : ''}
                  </option>
                ))}
              </select>

              <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingEmail(null)}
                  disabled={batchModalSaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={saveBatchChange}
                  disabled={batchModalSaving}
                >
                  {batchModalSaving ? 'Saving…' : 'Save Batch'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
