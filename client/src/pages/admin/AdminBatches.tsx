import React, { useState } from 'react';
import { adminCreateBatch, adminDeactivateBatch } from '../../auth';
import { useAdminData } from './AdminContext';

export default function AdminBatches() {
  const {
    overview,
    standardBatches,
    allBatchObjects,
    setAllBatchObjects,
    setStandardBatches,
    showToast,
  } = useAdminData();

  const [newBatchName, setNewBatchName] = useState('');
  const [addingBatch, setAddingBatch] = useState(false);
  const [batchMgmtError, setBatchMgmtError] = useState('');

  const handleAdminCreateBatch = async () => {
    const name = newBatchName.trim();
    if (!name) {
      setBatchMgmtError('Please enter a batch name.');
      return;
    }
    if (name.length > 100) {
      setBatchMgmtError('Name must be 100 characters or fewer.');
      return;
    }
    setAddingBatch(true);
    setBatchMgmtError('');
    try {
      const created = await adminCreateBatch(name);
      setAllBatchObjects((prev) => {
        const filtered = prev.filter((b) => b.id !== created.id);
        return [...filtered, created].sort(
          (a, b) =>
            (a.year || '').localeCompare(b.year || '') ||
            a.label.localeCompare(b.label)
        );
      });
      setStandardBatches((prev) => {
        const updated = [
          ...prev.filter((b) => b !== created.displayName),
          created.displayName,
        ];
        return updated.sort();
      });
      setNewBatchName('');
      showToast(`Batch '${created.displayName}' created successfully.`);
    } catch (err: any) {
      setBatchMgmtError(err.message || 'Failed to create batch.');
    } finally {
      setAddingBatch(false);
    }
  };

  const handleDeactivateBatch = async (id: string, displayName: string) => {
    if (
      !window.confirm(
        `Deactivate batch '${displayName}'? Historical sessions will keep the name, but it won't appear in new quiz dropdowns.`
      )
    )
      return;
    try {
      await adminDeactivateBatch(id);
      setAllBatchObjects((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: 'inactive' as const } : b))
      );
      setStandardBatches((prev) => prev.filter((b) => b !== displayName));
      showToast(`Batch '${displayName}' deactivated.`);
    } catch (err: any) {
      showToast(err.message || 'Failed to deactivate batch.', 'error');
    }
  };

  return (
    <section className="pm-admin-panel-card">
      <div className="pm-panel-header-row">
        <div>
          <h3>🗂️ Batch Management</h3>
          <p style={{ fontSize: '0.82rem', color: '#64748B', marginTop: '0.2rem' }}>
            Create, review and deactivate academic batches. Mentors can also create batches inline from the quiz builder.
          </p>
        </div>
      </div>

      {/* Active Academic Cohorts & Batches */}
      {overview?.batches && overview.batches.length > 0 && (
        <div className="pm-admin-subjects-section" style={{ marginBottom: '1.25rem', marginTop: '0.5rem' }}>
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

      {/* Add new batch */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.6rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <input
          type="text"
          className="input"
          placeholder="New batch name, e.g. 4th Year – Batch A"
          value={newBatchName}
          onChange={(e) => {
            setNewBatchName(e.target.value);
            setBatchMgmtError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdminCreateBatch();
          }}
          disabled={addingBatch}
          style={{ flex: '1 1 280px', minWidth: '200px', fontSize: '0.9rem', padding: '0.55rem 0.8rem', borderRadius: '10px' }}
        />
        <button
          className="btn btn-primary"
          onClick={handleAdminCreateBatch}
          disabled={addingBatch || !newBatchName.trim()}
          style={{ padding: '0.55rem 1.2rem', fontSize: '0.9rem', whiteSpace: 'nowrap' }}
        >
          {addingBatch ? 'Adding…' : '＋ Add Batch'}
        </button>
      </div>
      {batchMgmtError && (
        <div className="pm-auth-error-alert" style={{ marginBottom: '1rem' }}>
          <span>⚠️ {batchMgmtError}</span>
        </div>
      )}

      {/* Batch list */}
      {allBatchObjects.length === 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
          {standardBatches.map((name) => (
            <span key={name} className="pm-subject-pill pm-batch-subject-pill" style={{ opacity: 0.7 }}>
              <span className="pm-subject-dot pm-batch-dot" />
              {name}
              <span className="pm-subject-count pm-batch-count" style={{ marginLeft: '0.4rem', color: '#94A3B8' }}>
                DB pending
              </span>
            </span>
          ))}
        </div>
      ) : (
        <div className="pm-table-responsive">
          <table className="pm-admin-table">
            <thead>
              <tr>
                <th>Batch Name</th>
                <th>Year</th>
                <th>Label</th>
                <th>Created By</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {allBatchObjects.map((b) => (
                <tr key={b.id} style={{ opacity: b.status === 'inactive' ? 0.5 : 1 }}>
                  <td>
                    <strong>{b.displayName}</strong>
                  </td>
                  <td>{b.year || '—'}</td>
                  <td>{b.label}</td>
                  <td style={{ fontSize: '0.8rem', color: '#64748B' }}>
                    {b.createdBy || 'system'} <em>({b.createdByRole || 'admin'})</em>
                  </td>
                  <td>
                    <span className={`pm-role-pill ${b.status === 'active' ? 'pm-badge-role' : 'pm-role-admin'}`}>
                      {b.status}
                    </span>
                  </td>
                  <td>
                    {b.status === 'active' && (
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.76rem', padding: '0.25rem 0.6rem' }}
                        onClick={() => handleDeactivateBatch(b.id, b.displayName)}
                      >
                        Deactivate
                      </button>
                    )}
                    {b.status === 'inactive' && (
                      <span style={{ fontSize: '0.78rem', color: '#64748B' }}>Archived</span>
                    )}
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
