import React, { useState, useEffect, useMemo } from 'react';
import {
  fetchMentorReports,
  MentorReports,
  exportCampusReportsCsv,
  downloadQuizCsv,
  BatchObject,
} from '../../auth';
import { useAdminData } from './AdminContext';

export default function AdminReports() {
  const {
    allBatchObjects,
    standardBatches,
    activeSubjects,
    showToast,
  } = useAdminData();

  // Cross-mentor campus reports state
  const [reportData, setReportData] = useState<MentorReports | null>(null);
  const [loadingReports, setLoadingReports] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportBatch, setReportBatch] = useState('all');
  const [reportYear, setReportYear] = useState('all');
  const [reportSubject, setReportSubject] = useState('all');
  const [reportMentorQuery, setReportMentorQuery] = useState('');
  const [reportTimeRange, setReportTimeRange] = useState('all');
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [exportingReportCsv, setExportingReportCsv] = useState(false);

  // Cross-mentor reports loader
  useEffect(() => {
    setLoadingReports(true);
    setReportError('');
    fetchMentorReports({
      batch: reportBatch !== 'all' ? reportBatch : undefined,
      year: reportYear !== 'all' ? reportYear : undefined,
      subject: reportSubject !== 'all' ? reportSubject : undefined,
      mentorQuery: reportMentorQuery.trim() || undefined,
      timeRange: reportTimeRange !== 'all' ? reportTimeRange : undefined,
      startDate: reportTimeRange === 'custom' && reportStartDate ? reportStartDate : undefined,
      endDate: reportTimeRange === 'custom' && reportEndDate ? reportEndDate : undefined,
    })
      .then((data) => setReportData(data))
      .catch((err: any) => setReportError(err.message || 'Failed to load cross-mentor reports.'))
      .finally(() => setLoadingReports(false));
  }, [
    reportBatch,
    reportYear,
    reportSubject,
    reportMentorQuery,
    reportTimeRange,
    reportStartDate,
    reportEndDate,
  ]);

  // Grouped batches for optgroup dropdown
  const groupedBatches = useMemo(() => {
    const map = new Map<string, BatchObject[]>();
    for (const b of allBatchObjects) {
      const yr = b.year?.trim() || 'Other Batches';
      if (!map.has(yr)) map.set(yr, []);
      map.get(yr)!.push(b);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [allBatchObjects]);

  // Handler: Export filtered campus report CSV
  const handleExportCampusReportCsv = async () => {
    setExportingReportCsv(true);
    try {
      await exportCampusReportsCsv({
        batch: reportBatch !== 'all' ? reportBatch : undefined,
        year: reportYear !== 'all' ? reportYear : undefined,
        subject: reportSubject !== 'all' ? reportSubject : undefined,
        mentorQuery: reportMentorQuery.trim() || undefined,
        timeRange: reportTimeRange !== 'all' ? reportTimeRange : undefined,
        startDate: reportTimeRange === 'custom' && reportStartDate ? reportStartDate : undefined,
        endDate: reportTimeRange === 'custom' && reportEndDate ? reportEndDate : undefined,
      });
      showToast('Campus report exported to CSV successfully.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to export CSV.', 'error');
    } finally {
      setExportingReportCsv(false);
    }
  };

  return (
    <section className="pm-admin-panel-card">
      <div className="pm-panel-header-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📈</span> Campus-Wide Quiz Reports &amp; All Sessions
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '0.25rem' }}>
            Live cross-mentor aggregated performance across all batches, academic years, and subjects.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem' }}
          onClick={handleExportCampusReportCsv}
          disabled={exportingReportCsv || !reportData?.reports?.length}
        >
          <span>{exportingReportCsv ? '⏳' : '📥'}</span>
          <span>{exportingReportCsv ? 'Exporting…' : 'Export Filtered CSV'}</span>
        </button>
      </div>

      {/* Total Metrics Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
          margin: '1.25rem 0',
        }}
      >
        <div className="pm-metric-card" style={{ padding: '1rem', borderRadius: '12px', background: 'var(--surface-mid, #1E2024)', border: '1px solid var(--border, #2A2A2F)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Sessions
          </span>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--text-primary, #F2F2F2)' }}>
            {reportData?.totals?.sessions ?? 0}
          </div>
        </div>
        <div className="pm-metric-card" style={{ padding: '1rem', borderRadius: '12px', background: 'var(--surface-mid, #1E2024)', border: '1px solid var(--border, #2A2A2F)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Student Attendees
          </span>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.25rem', color: '#6366F1' }}>
            👥 {reportData?.totals?.participants ?? 0}
          </div>
        </div>
        <div className="pm-metric-card" style={{ padding: '1rem', borderRadius: '12px', background: 'var(--surface-mid, #1E2024)', border: '1px solid var(--border, #2A2A2F)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Responses Graded
          </span>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.25rem', color: '#10B981' }}>
            📝 {reportData?.totals?.responses ?? 0}
          </div>
        </div>
        <div className="pm-metric-card" style={{ padding: '1rem', borderRadius: '12px', background: 'var(--surface-mid, #1E2024)', border: '1px solid var(--border, #2A2A2F)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Campus Accuracy
          </span>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.25rem', color: '#F59E0B' }}>
            🎯 {reportData?.totals?.accuracyPercent ?? 0}%
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div
        style={{
          background: 'var(--surface-mid, #1E2024)',
          border: '1px solid var(--border, #2A2A2F)',
          borderRadius: '14px',
          padding: '1rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
        }}
      >
        {/* Quick Date Range Chips */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div className="pm-filter-chips-group" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'All Time' },
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: '7d', label: 'Last 7 Days' },
              { id: '30d', label: 'Last 30 Days' },
              { id: 'custom', label: 'Custom Range' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                className={`pm-filter-chip ${reportTimeRange === t.id ? 'active' : ''}`}
                onClick={() => setReportTimeRange(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {reportTimeRange === 'custom' && (
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <input
                type="date"
                className="pm-filter-date-input"
                value={reportStartDate}
                onChange={(e) => setReportStartDate(e.target.value)}
                title="Start Date"
              />
              <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>→</span>
              <input
                type="date"
                className="pm-filter-date-input"
                value={reportEndDate}
                onChange={(e) => setReportEndDate(e.target.value)}
                title="End Date"
              />
            </div>
          )}
        </div>

        {/* Dropdowns Row: Batch, Year, Subject, Mentor Query */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: '0.75rem',
          }}
        >
          {/* Batch Dropdown (grouped by year) */}
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', marginBottom: '0.25rem' }}>
              Target Batch
            </label>
            <select
              className="pm-filter-select"
              style={{ width: '100%' }}
              value={reportBatch}
              onChange={(e) => setReportBatch(e.target.value)}
            >
              <option value="all">🎓 All Batches</option>
              {groupedBatches.map(([yr, batches]) => (
                <optgroup key={yr} label={yr}>
                  {batches.map((b) => (
                    <option key={b.id} value={b.displayName}>
                      {b.displayName}
                    </option>
                  ))}
                </optgroup>
              ))}
              {groupedBatches.length === 0 &&
                standardBatches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
            </select>
          </div>

          {/* Academic Year Dropdown */}
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', marginBottom: '0.25rem' }}>
              Academic Year
            </label>
            <select
              className="pm-filter-select"
              style={{ width: '100%' }}
              value={reportYear}
              onChange={(e) => setReportYear(e.target.value)}
            >
              <option value="all">📅 All Years</option>
              <option value="1">1st Year</option>
              <option value="2">2nd Year</option>
              <option value="3">3rd Year</option>
              <option value="4">4th Year</option>
            </select>
          </div>

          {/* Subject Dropdown */}
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', marginBottom: '0.25rem' }}>
              Academic Subject
            </label>
            <select
              className="pm-filter-select"
              style={{ width: '100%' }}
              value={reportSubject}
              onChange={(e) => setReportSubject(e.target.value)}
            >
              <option value="all">📚 All Subjects</option>
              {activeSubjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Mentor Search Input */}
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', marginBottom: '0.25rem' }}>
              Filter by Mentor
            </label>
            <input
              type="text"
              className="input"
              placeholder="🔍 Name or email..."
              value={reportMentorQuery}
              onChange={(e) => setReportMentorQuery(e.target.value)}
              style={{
                width: '100%',
                fontSize: '0.85rem',
                padding: '0.45rem 0.75rem',
                borderRadius: '8px',
                background: 'var(--surface, #1B1B1F)',
                border: '1px solid var(--border, #2A2A2F)',
                color: 'var(--text-primary, #F2F2F2)',
              }}
            />
          </div>
        </div>
      </div>

      {/* Error banner */}
      {reportError && (
        <div className="pm-auth-error-alert" style={{ marginBottom: '1rem' }}>
          <span>⚠️ {reportError}</span>
        </div>
      )}

      {/* Reports Table */}
      {loadingReports ? (
        <div className="pm-history-loading" style={{ padding: '3rem 0', textAlign: 'center' }}>
          <div className="spinner" />
          <p style={{ marginTop: '0.75rem', color: '#94A3B8' }}>Aggregating campus sessions and grades…</p>
        </div>
      ) : !reportData?.reports || reportData.reports.length === 0 ? (
        <div className="pm-history-empty" style={{ padding: '3rem 0', textAlign: 'center' }}>
          <span style={{ fontSize: '3rem' }}>📋</span>
          <h3 style={{ marginTop: '0.5rem' }}>No quiz sessions match the filters</h3>
          <p style={{ color: '#64748B', maxWidth: '420px', margin: '0.4rem auto 0' }}>
            Try changing your batch, year, subject, mentor search, or date range filters to view other sessions.
          </p>
        </div>
      ) : (
        <div className="pm-table-responsive">
          <table className="pm-admin-table">
            <thead>
              <tr>
                <th>Mentor</th>
                <th>Batch</th>
                <th>Subject</th>
                <th>Topic &amp; Code</th>
                <th>Date</th>
                <th>Participants</th>
                <th>Responses</th>
                <th>Avg Score / Accuracy</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {reportData.reports.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="pm-mentor-meta">
                      <strong style={{ color: 'var(--text-primary, #F2F2F2)' }}>
                        {r.hostName || 'Mentor'}
                      </strong>
                      <small style={{ color: '#94A3B8' }}>{r.hostEmail}</small>
                    </div>
                  </td>
                  <td>
                    <span className="pm-batch-badge">🎓 {r.batch || 'General'}</span>
                  </td>
                  <td>
                    <span className="pm-subject-badge">{r.subject || 'General'}</span>
                  </td>
                  <td>
                    <div>
                      <strong className="pm-quiz-topic">{r.topic || 'Classroom Quiz'}</strong>
                      <div style={{ marginTop: '0.2rem' }}>
                        <span className="pm-session-code-pill">#{r.code}</span>
                        <span style={{ fontSize: '0.72rem', color: '#94A3B8', marginLeft: '0.4rem' }}>
                          {r.questionCount} Qs
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="pm-date-text">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </td>
                  <td>
                    <span className="pm-count-badge">👥 {r.participantCount}</span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary, #F2F2F2)' }}>
                      {r.responseCount}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                      <span style={{ fontWeight: 700, color: '#10B981' }}>
                        {r.accuracyPercent}% Accuracy
                      </span>
                      <small style={{ color: '#94A3B8' }}>Avg {r.averageScore} pts</small>
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn--sm"
                      style={{ fontSize: '0.76rem', padding: '0.25rem 0.55rem', whiteSpace: 'nowrap' }}
                      onClick={() => downloadQuizCsv(r.id, `${r.code}-${r.subject || 'quiz'}`)}
                      title="Download detailed student gradebook CSV"
                    >
                      📥 CSV
                    </button>
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
