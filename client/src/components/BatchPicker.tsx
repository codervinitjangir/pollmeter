import React, { useState, useEffect, useMemo } from 'react';
import { BatchObject, createMentorBatch } from '../auth';

interface BatchPickerProps {
  batches: BatchObject[];
  selectedBatchId: string;
  onSelect: (batchId: string, displayName: string) => void;
  onBatchCreated?: (batch: BatchObject) => void;
  label?: string;
  disabled?: boolean;
}

export default function BatchPicker({
  batches,
  selectedBatchId,
  onSelect,
  onBatchCreated,
  label = 'Target Batch / Class',
  disabled = false,
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
      {label && <label className="pm-host-field-label">{label}</label>}

      {batches.length === 0 ? (
        <div style={{ padding: '0.4rem 0', color: 'var(--text-secondary, #9CA3AF)', fontSize: '0.85rem' }}>
          No assigned batches found. Please create one below.
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

      {/* Inline Create New Batch Toggle */}
      {!showNewBatchInput ? (
        <button
          type="button"
          className="pm-host-action-link"
          onClick={() => {
            setShowNewBatchInput(true);
            setBatchError('');
          }}
          disabled={disabled}
        >
          <span>＋</span> Create new batch
        </button>
      ) : (
        <div style={{ marginTop: '0.45rem' }}>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
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
              disabled={creatingBatch || disabled}
              style={{ flex: 1 }}
              autoFocus
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleCreateBatch}
              disabled={creatingBatch || !newBatchName.trim() || disabled}
              style={{ whiteSpace: 'nowrap' }}
            >
              {creatingBatch ? '…' : 'Add'}
            </button>
            {batches.length > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setShowNewBatchInput(false);
                  setNewBatchName('');
                  setBatchError('');
                }}
                disabled={disabled}
              >
                ✕
              </button>
            )}
          </div>
          {batchError && (
            <p style={{ color: '#F87171', fontSize: '0.72rem', marginTop: '0.3rem', margin: '0.3rem 0 0' }}>
              {batchError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
