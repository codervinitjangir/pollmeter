import React, { useEffect, useState } from 'react';
import { useAdminData } from './AdminContext';
import { adminCleanDummyBatches } from '../../auth';

export default function AdminAuditLog() {
  const { auditLogs, loadingAudit, refreshAuditLogs, showToast } = useAdminData();
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    refreshAuditLogs();
  }, [refreshAuditLogs]);

  async function handleCleanBatches() {
    if (!window.confirm('Are you sure you want to clean legacy/dummy test batches from database? Users and quizzes will remain 100% untouched.')) {
      return;
    }
    setCleaning(true);
    try {
      const res = await adminCleanDummyBatches();
      showToast(`Database cleaned! Removed ${res.deletedCount} legacy test batches.`);
      refreshAuditLogs();
    } catch (err: any) {
      showToast(err.message || 'Failed to clean test batches.');
    } finally {
      setCleaning(false);
    }
  }

  const renderMetadata = (meta: any) => {
    if (!meta) return <span style={{ color: 'var(--text-secondary)' }}>—</span>;
    if (typeof meta === 'string') {
      try {
        meta = JSON.parse(meta);
      } catch {
        return <span style={{ fontSize: '0.8rem' }}>{meta}</span>;
      }
    }
    const entries = Object.entries(meta);
    if (entries.length === 0) return <span style={{ color: 'var(--text-secondary)' }}>—</span>;

    return (
      <div className="pm-audit-meta-chips">
        {entries.slice(0, 3).map(([k, v]) => (
          <span key={k} className="pm-audit-meta-chip" title={`${k}: ${String(v)}`}>
            <strong>{k}:</strong> {String(v)}
          </span>
        ))}
        {entries.length > 3 && (
          <span className="pm-audit-meta-chip pm-audit-meta-more" title={JSON.stringify(meta)}>
            +{entries.length - 3} more
          </span>
        )}
      </div>
    );
  };

  return (
    <section className="pm-admin-panel-card">
      <div className="pm-panel-header-row">
        <div>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Security Audit Trail</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0' }}>
            Permanent institutional compliance log
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleCleanBatches}
            disabled={cleaning}
            style={{ borderRadius: '8px', fontSize: '0.8rem', padding: '0.35rem 0.8rem' }}
            title="Purge legacy dummy test batches from the database"
          >
            {cleaning ? 'Cleaning…' : '🧹 Clean Legacy Batches'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => refreshAuditLogs()}
            disabled={loadingAudit}
            style={{ borderRadius: '8px', fontSize: '0.8rem', padding: '0.35rem 0.8rem' }}
          >
            {loadingAudit ? 'Refreshing...' : '🔄 Refresh Logs'}
          </button>
        </div>
      </div>

      {loadingAudit ? (
        <div className="pm-history-loading">
          <div className="spinner" />
          <p>Loading security audit logs...</p>
        </div>
      ) : auditLogs.length === 0 ? (
        <div className="pm-history-empty">
          <span style={{ fontSize: '2.5rem' }}>🛡️</span>
          <h3>No audit events logged yet</h3>
          <p>When mentors launch sessions or modify settings, records populate here.</p>
        </div>
      ) : (
        <div className="pm-table-responsive">
          <table className="pm-admin-table">
            <thead>
              <tr>
                <th>Event Action</th>
                <th>Actor</th>
                <th>Target ID</th>
                <th>Details</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td>
                    <span
                      className={`pm-role-pill ${
                        log.action.includes('EXPORT')
                          ? 'pm-role-mentor'
                          : log.action.includes('REVOKE')
                          ? 'pm-role-admin'
                          : 'pm-badge-role'
                      }`}
                      style={{ fontSize: '0.74rem' }}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td>
                    <span
                      className="pm-audit-actor"
                      title={log.actorId}
                      style={{
                        display: 'inline-block',
                        maxWidth: '220px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontWeight: 600,
                        fontSize: '0.84rem',
                      }}
                    >
                      {log.actorId}
                    </span>
                  </td>
                  <td>
                    <code style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                      {log.targetId || '—'}
                    </code>
                  </td>
                  <td>{renderMetadata(log.metadata)}</td>
                  <td>
                    <span className="pm-date-text" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                      {new Date(log.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
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
