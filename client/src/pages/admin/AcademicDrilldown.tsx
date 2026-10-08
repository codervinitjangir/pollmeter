import React from 'react';

/**
 * Guided academic navigation: Year with Subject and Mentor as two
 * independent facets applied on top of whatever year is in view.
 */

/** Wildcard sentinel, matching the convention the admin screens already use. */
export const DRILL_ALL = 'all';

export interface AcademicDrilldownValue {
  /** Academic year as a bare digit ('1'…'4') or DRILL_ALL. */
  year: string;
  /** Retained as optional/backward-compatible wildcard. */
  batchId?: string;
  subject: string;
  mentorQuery: string;
}

export interface AcademicDrilldownProps {
  value: AcademicDrilldownValue;
  onChange: (next: AcademicDrilldownValue) => void;
  /** College-wide subject list, already fetched by useAdminData(). */
  subjects: string[];
  /** Optional legacy batches for backwards compatibility */
  batches?: any[];
}

export const EMPTY_DRILL: AcademicDrilldownValue = {
  year: DRILL_ALL,
  batchId: DRILL_ALL,
  subject: DRILL_ALL,
  mentorQuery: '',
};

export function yearLabel(key: string): string {
  if (key === DRILL_ALL) return 'All Years';
  const suffix = key === '1' ? 'st' : key === '2' ? 'nd' : key === '3' ? 'rd' : 'th';
  return `${key}${suffix} Year`;
}

export default function AcademicDrilldown({
  value,
  onChange,
  subjects,
}: AcademicDrilldownProps) {
  const set = (patch: Partial<AcademicDrilldownValue>) => onChange({ ...value, ...patch });

  const yearOptions = ['1', '2', '3', '4'];

  const isFiltered =
    value.year !== DRILL_ALL ||
    value.subject !== DRILL_ALL ||
    value.mentorQuery.trim() !== '';

  const crumbs: Array<{ key: string; label: string; text: string; onClick: () => void }> = [
    {
      key: 'year',
      label: 'Year',
      text: value.year === DRILL_ALL ? 'All' : yearLabel(value.year),
      onClick: () => set({ year: DRILL_ALL, subject: DRILL_ALL, mentorQuery: '' }),
    },
    {
      key: 'subject',
      label: 'Subject',
      text: value.subject === DRILL_ALL ? 'All' : value.subject,
      onClick: () => set({ mentorQuery: '' }),
    },
    {
      key: 'mentor',
      label: 'Mentor',
      text: value.mentorQuery.trim() || 'All',
      onClick: () => set({ mentorQuery: '' }),
    },
  ];

  return (
    <div className="pm-drill" data-testid="academic-drilldown">
      {/* ── Breadcrumb ───────────────────────────────────────────────────── */}
      <nav className="pm-drill-crumbs" aria-label="Academic filter path">
        <button
          type="button"
          className="pm-drill-crumb pm-drill-crumb--root"
          onClick={() => onChange({ ...EMPTY_DRILL })}
          title="Clear every filter and show all campus data"
        >
          🏛️ Campus
        </button>
        {crumbs.map((c) => (
          <React.Fragment key={c.key}>
            <span className="pm-drill-crumb-sep" aria-hidden="true">
              ▸
            </span>
            <button
              type="button"
              className={`pm-drill-crumb ${c.text !== 'All' ? 'is-set' : ''}`}
              onClick={c.onClick}
              title={`Reset everything after ${c.label}`}
            >
              <span className="pm-drill-crumb-key">{c.label}:</span>
              <span className="pm-drill-crumb-val">{c.text}</span>
            </button>
          </React.Fragment>
        ))}
        {isFiltered && (
          <button
            type="button"
            className="pm-drill-crumb-clear"
            onClick={() => onChange({ ...EMPTY_DRILL })}
          >
            ✕ Clear all
          </button>
        )}
      </nav>

      {/* ── Academic Year Filter ─────────────────────────────────────────── */}
      <div className="pm-drill-step">
        <div className="pm-drill-step-head">
          <span className="pm-drill-step-title">Academic Year</span>
        </div>
        <div className="pm-drill-tiles" role="group" aria-label="Academic year">
          <button
            type="button"
            className={`pm-drill-tile ${value.year === DRILL_ALL ? 'active' : ''}`}
            aria-pressed={value.year === DRILL_ALL}
            onClick={() => set({ year: DRILL_ALL })}
          >
            <span className="pm-drill-tile-main">All Years</span>
            <span className="pm-drill-tile-sub">Campus Wide</span>
          </button>
          {yearOptions.map((key) => {
            return (
              <button
                key={key}
                type="button"
                className={`pm-drill-tile ${value.year === key ? 'active' : ''}`}
                aria-pressed={value.year === key}
                onClick={() => set({ year: key })}
              >
                <span className="pm-drill-tile-main">{yearLabel(key)}</span>
                <span className="pm-drill-tile-sub">Undergraduate</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Facets: Subject & Mentor Filters ──────────────────────────────── */}
      <div className="pm-drill-step">
        <div className="pm-drill-step-head">
          <span className="pm-drill-step-title">Subject &amp; Mentor Filter</span>
        </div>
        <div className="pm-drill-facets">
          <div>
            <label className="pm-drill-facet-label" htmlFor="pm-drill-subject">
              Subject
            </label>
            <select
              id="pm-drill-subject"
              className="pm-filter-select"
              style={{ width: '100%' }}
              value={value.subject}
              onChange={(e) => set({ subject: e.target.value })}
            >
              <option value={DRILL_ALL}>📚 All Subjects</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="pm-drill-facet-label" htmlFor="pm-drill-mentor">
              Mentor
            </label>
            <input
              id="pm-drill-mentor"
              type="text"
              className="pm-filter-select"
              style={{ width: '100%', fontWeight: 500, cursor: 'text' }}
              placeholder="🔍 Name or email…"
              value={value.mentorQuery}
              onChange={(e) => set({ mentorQuery: e.target.value })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
