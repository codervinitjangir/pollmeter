import React, { useEffect } from 'react';
import { useAdminData } from './AdminContext';

export default function AdminAuditLog() {
  const { auditLogs, loadingAudit, refreshAuditLogs } = useAdminData();

  useEffect(() => {
    refreshAuditLogs();
  }, [refreshAuditLogs]);

  return (
    <section className="pm-admin-panel-card">
      <div className="pm-panel-header-row">
        <div>
          <h3>Institutional Compliance &amp; Security Audit Trail</h3>
          <p style={{ fontSize: '0.82rem', color: '#64748B', marginTop: '0.2rem' }}>
            Permanent log of gradebook exports, live session creations, faculty promotions, and revocations
          </p>
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => refreshAuditLogs()}
        >
          🔄 Refresh Logs
        </button>
      </div>

      {loadingAudit ? (
        <div className="pm-history-loading">
          <div className="spinner" />
          <p>Loading security audit logs...</p>
        </div>
      ) : auditLogs.length === 0 ? (
        <div className="pm-history-empty">
          <span style={{ fontSize: '3rem' }}>🛡️</span>
          <h3>No audit events logged yet</h3>
          <p>When mentors launch sessions, export gradebooks, or admin modifies faculty, events appear here.</p>
        </div>
      ) : (
        <div className="pm-table-responsive">
          <table className="pm-admin-table">
            <thead>
              <tr>
                <th>Event Action</th>
                <th>Actor Identity</th>
                <th>Target Entity</th>
                <th>Event Metadata</th>
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
                    >
                      {log.action}
                    </span>
                  </td>
                  <td>
                    <strong>{log.actorId}</strong>
                  </td>
                  <td>
                    <code>{log.targetId || '-'}</code>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                      {log.metadata ? JSON.stringify(log.metadata) : '-'}
                    </span>
                  </td>
                  <td>
                    <span className="pm-date-text">
                      {new Date(log.createdAt).toLocaleString()}
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
