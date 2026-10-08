import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  fetchMentorReports,
  MentorReports,
  exportCampusReportsCsv,
  downloadQuizCsv,
} from '../../auth';
import { useAdminData } from './AdminContext';
import AcademicDrilldown, { DRILL_ALL } from './AcademicDrilldown';

export default function AdminReports() {
  const {
    allBatchObjects,
    activeSubjects,
    showToast,
  } = useAdminData();

  const [searchParams, setSearchParams] = useSearchParams();

  // Cross-mentor campus reports state
  const [reportData, setReportData] = useState<MentorReports | null>(null);
  const [loadingReports, setLoadingReports] = useState(false);
  const [reportError, setReportError] = useState('');
  // `reportBatch` holds the batch *id* while the drilldown is driving it; the
  // id is resolved to a display name before the API call (see reportBatchParam).
  const [reportBatch, setReportBatch] = useState(() => searchParams.get('batchId') || DRILL_ALL);
  const [reportYear, setReportYear] = useState(() => searchParams.get('year') || DRILL_ALL);
  const [reportSubject, setReportSubject] = useState(() => searchParams.get('subject') || DRILL_ALL);
  const [reportMentorQuery, setReportMentorQuery] = useState(() => searchParams.get('mentor') || '');
  const [reportTimeRange, setReportTimeRange] = useState('all');
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [exportingReportCsv, setExportingReportCsv] = useState(false);

  /**
   * The drilldown tracks batches by id, but the reports API matches a single
   * value against either `batch_id` or the free-text `batch` column. Every
   * stored session carries the display name, while `batch_id` was added later
   * and is null on older rows, so the display name is the more complete key —
   * and it is exactly what the dropdown this replaced used to send, which
   * keeps the endpoint's behaviour unchanged.
   */
  const reportBatchParam = useMemo(() => {
    if (reportBatch === DRILL_ALL) return undefined;
    return allBatchObjects.find((b) => b.id === reportBatch)?.displayName ?? reportBatch;
  }, [reportBatch, allBatchObjects]);

  const drilldownValue = useMemo(
    () => ({
      year: reportYear,
      batchId: reportBatch,
      subject: reportSubject,
      mentorQuery: reportMentorQuery,
    }),
    [reportYear, reportBatch, reportSubject, reportMentorQuery]
  );

  // Keep a drilled-down view bookmarkable. Defaults are omitted so an
  // untouched screen keeps a clean URL. Date range stays out of this on
  // purpose — it is an orthogonal axis with its own controls.
  useEffect(() => {
    const next = new URLSearchParams();
    if (reportYear !== DRILL_ALL) next.set('year', reportYear);
    if (reportBatch !== DRILL_ALL) next.set('batchId', reportBatch);
    if (reportSubject !== DRILL_ALL) next.set('subject', reportSubject);
    if (reportMentorQuery.trim()) next.set('mentor', reportMentorQuery.trim());
    setSearchParams(next, { replace: true });
    // `setSearchParams` is intentionally the only extra dependency — reading
    // `searchParams` here would make this effect retrigger on its own write.
  }, [reportYear, reportBatch, reportSubject, reportMentorQuery, setSearchParams]);

  // Cross-mentor reports loader
  useEffect(() => {
    setLoadingReports(true);
    setReportError('');
    fetchMentorReports({
      batch: reportBatchParam,
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
    reportBatchParam,
    reportYear,
    reportSubject,
    reportMentorQuery,
    reportTimeRange,
    reportStartDate,
    reportEndDate,
  ]);

  // Handler: Export filtered campus report CSV
  const handleExportCampusReportCsv = async () => {
    setExportingReportCsv(true);
    try {
      await exportCampusReportsCsv({
        batch: reportBatchParam,
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
            Campus aggregated performance and session metrics.
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
      <div className="pm-stats-grid" style={{ margin: '1.25rem 0' }}>
        <div className="pm-stat-box">
          <div className="pm-stat-header">
            <span className="pm-stat-label">Total Sessions</span>
            <span className="pm-stat-icon">📊</span>
          </div>
          <div className="pm-stat-value">{reportData?.totals?.sessions ?? 0}</div>
          <div className="pm-stat-meta">Audited sessions</div>
        </div>

        <div className="pm-stat-box">
          <div className="pm-stat-header">
            <span className="pm-stat-label">Student Attendees</span>
            <span className="pm-stat-icon">👥</span>
          </div>
          <div className="pm-stat-value" style={{ color: '#6366F1' }}>
            {reportData?.totals?.participants ?? 0}
          </div>
          <div className="pm-stat-meta">Unique participations</div>
        </div>

        <div className="pm-stat-box">
          <div className="pm-stat-header">
            <span className="pm-stat-label">Responses Graded</span>
            <span className="pm-stat-icon">📝</span>
          </div>
          <div className="pm-stat-value" style={{ color: '#10B981' }}>
            {reportData?.totals?.responses ?? 0}
          </div>
          <div className="pm-stat-meta">Graded answers</div>
        </div>

        <div className="pm-stat-box">
          <div className="pm-stat-header">
            <span className="pm-stat-label">Campus Accuracy</span>
            <span className="pm-stat-icon">🎯</span>
          </div>
          <div className="pm-stat-value" style={{ color: '#F59E0B' }}>
            {reportData?.totals?.accuracyPercent ?? 0}%
          </div>
          <div className="pm-stat-meta">Average accuracy</div>
        </div>
      </div>

      {/* Guided academic drill-down: Year → Batch, then Subject/Mentor facets */}
      <AcademicDrilldown
        value={drilldownValue}
        onChange={(next) => {
          setReportYear(next.year);
          setReportBatch(next.batchId || 'all');
          setReportSubject(next.subject);
          setReportMentorQuery(next.mentorQuery);
        }}
        subjects={activeSubjects}
        batches={allBatchObjects}
      />

      {/* Date range — an orthogonal axis, kept separate from the drill-down */}
      <div
        style={{
          background: 'var(--surface, #FFFFFF)',
          border: '1px solid var(--border, #E2E8F0)',
          borderRadius: '12px',
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
