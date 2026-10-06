import React, { useState, useEffect, useMemo } from 'react';
import { BatchObject, createMentorBatch } from '../auth';

interface BatchPickerProps {
  batches: BatchObject[];
  selectedBatchId: string;
  onSelect: (batchId: string, displayName: string) => void;
  onBatchCreated?: (batch: BatchObject) => void;
  label?: string | null;
  disabled?: boolean;
  /** When false, hides the "+  Create new batch" toggle entirely. Default: true. */
  allowCreate?: boolean;
}

export default function BatchPicker({
  batches,
  selectedBatchId,
  onSelect,
  onBatchCreated,
  label = 'Target Batch / Class',
  disabled = false,
  allowCreate = true,
}: BatchPickerProps) {
  const [showNewBatchInput, setShowNewBatchInput] = useState(batches.length === 0);
  const [newBatchName, setNewBatchName] = useState('');
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [batchError, setBatchError] = useState('');

  // Group batches by year for optgroup dropdown
  const groupedBatches = useMemo(() => {
    const map = new Map<string, BatchObject[]>();
    for (const b of batches) {
      const yr = b.year?.trim() || 'Other Batches';
      if (!map.has(yr)) map.set(yr, []);
      map.get(yr)!.push(b);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [batches]);

  // Pre-select if there is exactly one batch available
  useEffect(() => {
    if (batches.length === 1 && !selectedBatchId) {
      onSelect(batches[0].id, batches[0].displayName);
    }
  }, [batches, selectedBatchId, onSelect]);

  const handleCreateBatch = async () => {
    const name = newBatchName.trim();
    if (!name) return;
    setCreatingBatch(true);
    setBatchError('');
    try {
      const created = await createMentorBatch(name);
      if (onBatchCreated) {
        onBatchCreated(created);
      }
      onSelect(created.id, created.displayName);
      setNewBatchName('');
      setShowNewBatchInput(false);
    } catch (err: any) {
      setBatchError(err.message || 'Failed to create batch.');
    } finally {
      setCreatingBatch(false);
    }
  };

  return (
    <div className="pm-host-field-group">
      {(label || (allowCreate && !showNewBatchInput)) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
          {label ? (
            <label className="pm-host-field-label" style={{ margin: 0 }}>
              {label}
            </label>
          ) : <span />}
          {allowCreate && !showNewBatchInput && (
            <button
              type="button"
              className="pm-host-action-pill"
              onClick={() => {
                setShowNewBatchInput(true);
                setBatchError('');
              }}
              disabled={disabled}
              title="Create a new batch/section"
            >
              ＋ New Batch
            </button>
          )}
        </div>
      )}

      {showNewBatchInput ? (
        <div>
          <div className="pm-host-input-inline-wrap">
            <input
              type="text"
              className="input pm-host-input"
              placeholder="e.g. 3rd Year – Batch B"
              value={newBatchName}
              onChange={(e) => {
                setNewBatchName(e.target.value);
                setBatchError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateBatch();
                if (e.key === 'Escape') {
                  if (batches.length > 0) setShowNewBatchInput(false);
                  setNewBatchName('');
                }
              }}
              style={{ flex: '1 1 0%', minWidth: 0, width: '100%' }}
              disabled={creatingBatch || disabled}
              autoFocus
            />
            <button
              type="button"
              className="btn btn-sm pm-host-inline-btn pm-host-inline-save"
              onClick={handleCreateBatch}
              disabled={creatingBatch || !newBatchName.trim() || disabled}
            >
              {creatingBatch ? '…' : '✓ Save'}
            </button>
            {batches.length > 0 && (
              <button
                type="button"
                className="btn btn-sm pm-host-inline-btn pm-host-inline-cancel"
                onClick={() => {
                  setShowNewBatchInput(false);
                  setNewBatchName('');
                  setBatchError('');
                }}
                disabled={disabled}
                title="Cancel"
              >
                ✕
              </button>
            )}
          </div>
          {batchError && (
            <p style={{ color: '#F87171', fontSize: '0.74rem', marginTop: '0.35rem', margin: '0.35rem 0 0' }}>
              ⚠️ {batchError}
            </p>
          )}
        </div>
      ) : batches.length === 0 ? (
        <div style={{ padding: '0.45rem 0', color: 'var(--text-secondary, #9CA3AF)', fontSize: '0.85rem' }}>
          {allowCreate
            ? 'No assigned batches found. Please create one.'
            : 'No batches are available yet — ask your mentor or an administrator to add yours.'}
        </div>
      ) : (
        <select
          className="input pm-host-select"
          value={selectedBatchId}
          disabled={disabled}
          onChange={(e) => {
            const selectedId = e.target.value;
            const b = batches.find((x) => x.id === selectedId);
            onSelect(selectedId, b ? b.displayName : '');
          }}
        >
          {(!selectedBatchId || batches.length > 1) && (
            <option value="">Select a batch…</option>
          )}
          {groupedBatches.map(([yearGroup, groupList]) => (
            <optgroup key={yearGroup} label={yearGroup}>
              {groupList.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.displayName}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}
    </div>
  );
}
