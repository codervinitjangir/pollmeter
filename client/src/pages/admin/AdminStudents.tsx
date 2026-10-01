import React, { useState, useEffect } from 'react';
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
  } = useAdminData();

  const [studentSearch, setStudentSearch] = useState('');
  /**
   * Browsing axis, independent of the text box below it: the drill-down answers
   * "show me this cohort", the search answers "find this one person".
   */
  const [drill, setDrill] = useState<AcademicDrilldownValue>({ ...EMPTY_DRILL });

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
      setEditingEmail(null);
      // Refresh the list
      const data = await searchStudentAudit(studentSearch, {
        batchId: drill.batchId,
        year: drill.year,
        subject: drill.subject,
      });
      setStudentAudit(data);
    } catch (err: any) {
      setBatchModalError(err.message || 'Failed to update batch.');
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

      <div className="pm-panel-header-row">
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

        <span className="pm-table-count">
          Showing <strong>{studentAudit.length}</strong> student{studentAudit.length === 1 ? '' : 's'}
        </span>
      </div>

      {loading ? (
        <div className="pm-history-loading">
          <div className="spinner" />
          <p>Auditing cross-subject student records...</p>
        </div>
      ) : studentAudit.length === 0 ? (
        <div className="pm-history-empty">
          <span style={{ fontSize: '3rem' }}>🎯</span>
          <h3>No student records found</h3>
          <p>When students take live quizzes across any mentor&apos;s class, their scores appear here.</p>
        </div>
      ) : (
        <div className="pm-table-responsive">
          <table className="pm-admin-table">
            <thead>
              <tr>
                <th>Student Name</th>
                <th>College Email</th>
                <th>Batch</th>
                <th>Quizzes Attempted</th>
                <th>Average Score</th>
                <th>Last Active Session</th>
                <th>University Standing</th>
              </tr>
            </thead>
            <tbody>
              {studentAudit.map((s, idx) => {
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
                        <span className="pm-badge-batch" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                          🎓 {s.batchName}
                          <button
                            className="pm-search-clear"
                            style={{ fontSize: '0.7rem', marginLeft: '4px', opacity: 0.7 }}
                            title="Change batch"
                            onClick={() => openBatchModal(s.email, s.batchId)}
                          >
                            ✎
                          </button>
                        </span>
                      ) : (
                        <button
                          className="pm-host-action-link"
                          style={{ fontSize: '0.78rem' }}
                          onClick={() => openBatchModal(s.email)}
                        >
                          Assign batch
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

      {/* Batch Edit Modal */}
      {editingEmail && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditingEmail(null); }}
        >
          <div style={{
            background: 'var(--surface, #18181B)',
            border: '1px solid var(--border, #27272A)',
            borderRadius: '16px',
            padding: '1.75rem',
            minWidth: '340px',
            maxWidth: '480px',
            width: '90%',
          }}>
            <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.05rem' }}>Edit Student Batch</h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.83rem', color: 'var(--mute, #94A3B8)' }}>
              <code style={{ fontSize: '0.78rem' }}>{editingEmail}</code>
            </p>

            {batchModalError && (
              <p style={{ color: '#EF4444', fontSize: '0.82rem', marginBottom: '0.75rem' }}>⚠️ {batchModalError}</p>
            )}

            <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.4rem' }}>
              New Batch
            </label>
            <select
              className="input pm-host-select"
              value={batchModalValue}
              onChange={(e) => setBatchModalValue(e.target.value)}
              disabled={batchModalSaving}
              style={{ width: '100%', marginBottom: '1rem' }}
            >
              <option value="">— No batch / Clear —</option>
              {allBatches.map((b) => (
                <option key={b.id} value={b.id}>{b.displayName}</option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setEditingEmail(null)}
                disabled={batchModalSaving}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={saveBatchChange}
                disabled={batchModalSaving}
              >
                {batchModalSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
