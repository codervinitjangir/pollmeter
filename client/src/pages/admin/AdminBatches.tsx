import React, { useState, useMemo } from 'react';
import { adminCreateBatch, adminDeactivateBatch, adminRenameBatch, BatchObject } from '../../auth';
import { useAdminData } from './AdminContext';

const PRESET_FORMATS = [
  '1st Year - Batch A',
  '1st Year - Batch B',
  '2nd Year - Batch A',
  '3rd Year - Batch A',
  '4th Year - Batch A',
];

export default function AdminBatches() {
  const {
    overview,
    standardBatches,
    allBatchObjects,
    setAllBatchObjects,
    setStandardBatches,
    showToast,
    showConfirmDialog,
  } = useAdminData();

  const [newBatchName, setNewBatchName] = useState('');
  const [addingBatch, setAddingBatch] = useState(false);
  const [batchMgmtError, setBatchMgmtError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Rename Modal State
  const [editingBatch, setEditingBatch] = useState<BatchObject | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState('');

  // Quick lookup of quiz count per batch from institutional overview
  const quizCountsByBatch = useMemo(() => {
    const map: Record<string, number> = {};
    if (overview?.batches) {
      for (const b of overview.batches) {
        map[b.batch.toLowerCase()] = b.count;
      }
    }
    return map;
  }, [overview?.batches]);

  const activeCount = useMemo(
    () => allBatchObjects.filter((b) => b.status === 'active').length,
    [allBatchObjects]
  );
  const archivedCount = useMemo(
    () => allBatchObjects.filter((b) => b.status === 'inactive').length,
    [allBatchObjects]
  );
  const totalQuizzes = useMemo(
    () => overview?.batches?.reduce((acc, b) => acc + (b.count || 0), 0) || 0,
    [overview?.batches]
  );

  // Filtered batch objects
  const filteredBatches = useMemo(() => {
    return allBatchObjects.filter((b) => {
      if (statusFilter === 'active' && b.status !== 'active') return false;
      if (statusFilter === 'inactive' && b.status !== 'inactive') return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        b.displayName.toLowerCase().includes(q) ||
        (b.year && b.year.toLowerCase().includes(q)) ||
        (b.label && b.label.toLowerCase().includes(q)) ||
        (b.createdBy && b.createdBy.toLowerCase().includes(q))
      );
    });
  }, [allBatchObjects, statusFilter, searchQuery]);

  // Create Batch Handler
  const handleAdminCreateBatch = async (nameOverride?: string) => {
    const name = (nameOverride ?? newBatchName).trim();
    if (!name) {
      setBatchMgmtError('Please enter a cohort / batch name.');
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

  // Deactivate Batch Handler
  const handleDeactivateBatch = (id: string, displayName: string) => {
    showConfirmDialog({
      title: 'Deactivate Batch?',
      message: `Deactivate batch '${displayName}'? Historical sessions will keep this cohort tag, but it will be hidden from new quiz dropdowns.`,
      confirmLabel: 'Deactivate Batch',
      isDestructive: true,
      onConfirm: async () => {
        setActionLoadingId(id);
        try {
          await adminDeactivateBatch(id);
          setAllBatchObjects((prev) =>
            prev.map((b) => (b.id === id ? { ...b, status: 'inactive' as const } : b))
          );
          setStandardBatches((prev) => prev.filter((b) => b !== displayName));
          showToast(`Batch '${displayName}' deactivated.`);
        } catch (err: any) {
          showToast(err.message || 'Failed to deactivate batch.', 'error');
        } finally {
          setActionLoadingId(null);
        }
      },
    });
  };

  // Re-activate Batch Handler
  const handleReactivateBatch = async (id: string, displayName: string) => {
    setActionLoadingId(id);
    try {
      const updated = await adminRenameBatch(id, displayName, 'active');
      setAllBatchObjects((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: 'active' as const } : b))
      );
      setStandardBatches((prev) => {
        const set = new Set([...prev, updated.displayName]);
        return Array.from(set).sort();
      });
      showToast(`Batch '${displayName}' re-activated successfully!`);
    } catch (err: any) {
      showToast(err.message || 'Failed to re-activate batch.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Rename Batch
  const openRenameModal = (batch: BatchObject) => {
    setEditingBatch(batch);
    setRenameValue(batch.displayName);
    setRenameError('');
  };

  const handleSaveRename = async () => {
    if (!editingBatch) return;
    const cleanName = renameValue.trim();
    if (!cleanName) {
      setRenameError('Batch name cannot be empty.');
      return;
    }
    setRenameSaving(true);
    setRenameError('');
    try {
      const updated = await adminRenameBatch(editingBatch.id, cleanName);
      setAllBatchObjects((prev) =>
        prev.map((b) => (b.id === editingBatch.id ? updated : b))
      );
      setStandardBatches((prev) => {
        const withoutOld = prev.filter((b) => b !== editingBatch.displayName);
        return [...withoutOld, updated.displayName].sort();
      });
      showToast(`Batch updated to '${updated.displayName}'.`);
      setEditingBatch(null);
    } catch (err: any) {
      setRenameError(err.message || 'Failed to rename batch.');
    } finally {
      setRenameSaving(false);
    }
  };

  return (
    <section className="pm-admin-panel-card">
      {/* ─── Header Row ─── */}
      <div className="pm-panel-header-row">
        <div>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
            🗂️ Academic Cohorts &amp; Batches
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '0.2rem' }}>
            Configure institutional student groupings across years and departments.
          </p>
        </div>
      </div>

      {/* ─── Quick Summary Metric Bar ─── */}
      <div className="pm-admin-metrics-bar">
        <div className="pm-admin-metric-chip">
          <span>📚 Total Cohorts:</span>
          <strong>{allBatchObjects.length || standardBatches.length}</strong>
        </div>
        <div className="pm-admin-metric-chip pm-admin-metric-chip--success">
          <span className="pm-pulse-dot pm-pulse-dot--active" />
          <span>Active:</span>
          <strong>{activeCount}</strong>
        </div>
        <div className="pm-admin-metric-chip pm-admin-metric-chip--muted">
          <span className="pm-pulse-dot pm-pulse-dot--inactive" />
          <span>Archived:</span>
          <strong>{archivedCount}</strong>
        </div>
        <div className="pm-admin-metric-chip">
          <span>🎯 Total Quizzes Linked:</span>
          <strong>{totalQuizzes}</strong>
        </div>
      </div>

      {/* ─── Create New Batch Box ─── */}
      <div className="pm-batch-creation-box">
        <label style={{ fontSize: '0.82rem', fontWeight: 700, display: 'block', marginBottom: '0.45rem' }}>
          ＋ Create New Academic Batch
        </label>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="input"
            placeholder="e.g. 4th Year - Batch A or MCA - Section B"
            value={newBatchName}
            onChange={(e) => {
              setNewBatchName(e.target.value);
              setBatchMgmtError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdminCreateBatch();
            }}
            disabled={addingBatch}
            style={{ flex: '1 1 300px', minWidth: '220px', fontSize: '0.88rem', padding: '0.5rem 0.85rem' }}
          />
          <button
            className="btn btn-primary"
            onClick={() => handleAdminCreateBatch()}
            disabled={addingBatch || !newBatchName.trim()}
            style={{ padding: '0.52rem 1.25rem', fontSize: '0.86rem', whiteSpace: 'nowrap' }}
          >
            {addingBatch ? 'Creating…' : '＋ Add Batch'}
          </button>
        </div>

        {/* Quick Format Suggestion Chips */}
        <div className="pm-batch-preset-chips">
          <span className="pm-batch-preset-label">Format presets:</span>
          {PRESET_FORMATS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="pm-batch-preset-chip"
              onClick={() => setNewBatchName(preset)}
              title={`Click to fill: ${preset}`}
            >
              ＋ {preset}
            </button>
          ))}
        </div>

        {batchMgmtError && (
          <div className="pm-auth-error-alert" style={{ marginTop: '0.75rem' }}>
            <span>⚠️ {batchMgmtError}</span>
          </div>
        )}
      </div>

      {/* ─── Filter & Search Toolbar ─── */}
      <div className="pm-panel-header-row" style={{ background: 'transparent' }}>
        <div className="pm-panel-toolbar-left" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div className="pm-search-input-wrap">
            <span>🔍</span>
            <input
              type="text"
              placeholder="Search batches by name, year, or label..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="pm-search-clear" onClick={() => setSearchQuery('')}>
                ✕
              </button>
            )}
          </div>

          {/* Segmented Filter: All / Active / Archived */}
          <div className="pm-filter-segmented-group">
            <button
              type="button"
              className={`pm-filter-segmented-btn ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              All ({allBatchObjects.length})
            </button>
            <button
              type="button"
              className={`pm-filter-segmented-btn ${statusFilter === 'active' ? 'active' : ''}`}
              onClick={() => setStatusFilter('active')}
            >
              Active ({activeCount})
            </button>
            <button
              type="button"
              className={`pm-filter-segmented-btn ${statusFilter === 'inactive' ? 'active' : ''}`}
              onClick={() => setStatusFilter('inactive')}
            >
              Archived ({archivedCount})
            </button>
          </div>
        </div>

        <span className="pm-table-count">
          Showing <strong>{filteredBatches.length}</strong> of <strong>{allBatchObjects.length}</strong> batches
        </span>
      </div>

      {/* ─── Batch Table ─── */}
      {allBatchObjects.length === 0 ? (
        <div style={{ padding: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
          {standardBatches.map((name) => (
            <span key={name} className="pm-subject-pill pm-batch-subject-pill" style={{ opacity: 0.75 }}>
              <span className="pm-subject-dot pm-batch-dot" />
              {name}
              <span className="pm-subject-count pm-batch-count" style={{ marginLeft: '0.4rem', color: '#94A3B8' }}>
                Standard
              </span>
            </span>
          ))}
        </div>
      ) : filteredBatches.length === 0 ? (
        <div className="pm-history-empty" style={{ padding: '2.5rem 1rem' }}>
          <span style={{ fontSize: '2.4rem' }}>🔍</span>
          <h4 style={{ margin: '0.5rem 0 0.2rem', fontWeight: 700 }}>No matching batches found</h4>
          <p style={{ margin: 0, fontSize: '0.84rem', color: '#64748B' }}>
            No cohorts match &quot;{searchQuery}&quot;. Try adjusting your filter or create a new batch above.
          </p>
          {searchQuery && (
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginTop: '0.85rem' }}
              onClick={() => setSearchQuery('')}
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
                <th>Cohort / Batch Name</th>
                <th>Academic Year</th>
                <th>Section / Label</th>
                <th>Quizzes Run</th>
                <th>Created By</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBatches.map((b) => {
                const quizCount = quizCountsByBatch[b.displayName.toLowerCase()] ?? 0;
                const isLoading = actionLoadingId === b.id;

                return (
                  <tr key={b.id} style={{ opacity: b.status === 'inactive' ? 0.65 : 1 }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span style={{ fontSize: '1rem' }}>🎓</span>
                        <strong>{b.displayName}</strong>
                      </div>
                    </td>
                    <td>
                      {b.year ? (
                        <span className="pm-batch-badge" style={{ fontSize: '0.75rem' }}>
                          {b.year}
                        </span>
                      ) : (
                        <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                        {b.label || '—'}
                      </span>
                    </td>
                    <td>
                      <span className="pm-count-badge" style={{ fontSize: '0.75rem' }}>
                        {quizCount} {quizCount === 1 ? 'quiz' : 'quizzes'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#64748B' }}>
                      {b.createdBy || 'system'}
                      {b.createdByRole && (
                        <span style={{ marginLeft: '4px', opacity: 0.8 }}>({b.createdByRole})</span>
                      )}
                    </td>
                    <td>
                      {b.status === 'active' ? (
                        <span className="pm-status-pill-active">
                          <span className="pm-pulse-dot pm-pulse-dot--active" />
                          Active
                        </span>
                      ) : (
                        <span className="pm-status-pill-inactive">
                          <span className="pm-pulse-dot pm-pulse-dot--inactive" />
                          Archived
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                        {b.status === 'active' ? (
                          <>
                            <button
                              type="button"
                              className="pm-btn-icon-action"
                              onClick={() => openRenameModal(b)}
                              title="Rename cohort"
                              disabled={isLoading}
                              style={{ fontSize: '0.76rem', padding: '0.24rem 0.55rem' }}
                            >
                              ✏️ Rename
                            </button>
                            <button
                              type="button"
                              className="pm-btn-icon-action pm-action-danger"
                              onClick={() => handleDeactivateBatch(b.id, b.displayName)}
                              disabled={isLoading}
                              title="Deactivate cohort from quiz menus"
                              style={{ fontSize: '0.76rem', padding: '0.24rem 0.55rem' }}
                            >
                              {isLoading ? '…' : 'Deactivate'}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="pm-btn-icon-action pm-action-approve"
                            onClick={() => handleReactivateBatch(b.id, b.displayName)}
                            disabled={isLoading}
                            title="Re-activate this archived batch"
                            style={{ fontSize: '0.76rem', padding: '0.24rem 0.65rem' }}
                          >
                            {isLoading ? '…' : '⚡ Re-activate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Rename Modal ─── */}
      {editingBatch && (
        <div
          className="pm-auth-modal-backdrop"
          onClick={() => !renameSaving && setEditingBatch(null)}
          style={{ zIndex: 10000 }}
        >
          <div
            className="pm-admin-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '440px', width: '92%' }}
          >
            <div className="pm-admin-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.4rem' }}>✏️</span>
                <div>
                  <h3 className="pm-admin-modal-title">Rename Cohort</h3>
                  <p className="pm-admin-modal-sub">
                    Update display label for {editingBatch.displayName}
                  </p>
                </div>
              </div>
              <button
                className="pm-auth-close-btn"
                onClick={() => setEditingBatch(null)}
                disabled={renameSaving}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '1.25rem 1.5rem' }}>
              {renameError && (
                <div className="pm-auth-error-alert" style={{ marginBottom: '1rem' }}>
                  <span>⚠️ {renameError}</span>
                </div>
              )}

              <label style={{ fontSize: '0.82rem', fontWeight: 700, display: 'block', marginBottom: '0.4rem' }}>
                Cohort Display Name
              </label>
              <input
                type="text"
                className="input"
                value={renameValue}
                onChange={(e) => {
                  setRenameValue(e.target.value);
                  setRenameError('');
                }}
                disabled={renameSaving}
                placeholder="e.g. 4th Year - Batch A"
                style={{ width: '100%', marginBottom: '1.25rem' }}
                autoFocus
              />

              <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingBatch(null)}
                  disabled={renameSaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSaveRename}
                  disabled={renameSaving || !renameValue.trim()}
                >
                  {renameSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
