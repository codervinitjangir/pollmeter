import React, { useMemo } from 'react';
import { BatchObject } from '../../auth';

/**
 * Guided academic navigation: Year → Batch, with Subject and Mentor as two
 * independent facets applied on top of whatever year/batch is in view.
 *
 * Subject and Mentor are deliberately *not* further drill levels. A single
 * batch is taught by several mentors covering different subjects, so nesting
 * one inside the other would imply a hierarchy that does not exist and would
 * hide combinations a reader legitimately wants (every "Physics" session in
 * 2nd year, regardless of which mentor ran it).
 *
 * The component is controlled and holds no state of its own — both admin
 * screens keep the selection in their own state and feed it back through
 * `onChange`, so each screen stays the single source of truth for what its
 * table is showing.
 */

/** Wildcard sentinel, matching the convention the admin screens already use. */
export const DRILL_ALL = 'all';

export interface AcademicDrilldownValue {
  /** Academic year as a bare digit ('1'…'4'), 'other', or DRILL_ALL. */
  year: string;
  /** Batch *id* (uuid), or DRILL_ALL. */
  batchId: string;
  subject: string;
  mentorQuery: string;
}

export interface AcademicDrilldownProps {
  value: AcademicDrilldownValue;
  onChange: (next: AcademicDrilldownValue) => void;
  /** College-wide subject list, already fetched by useAdminData(). */
  subjects: string[];
  /** All active batches, already fetched by useAdminData(). */
  batches: BatchObject[];
}

export const EMPTY_DRILL: AcademicDrilldownValue = {
  year: DRILL_ALL,
  batchId: DRILL_ALL,
  subject: DRILL_ALL,
  mentorQuery: '',
};

/**
 * The academic year a batch belongs to, as a bare digit.
 *
 * Batch years are free text typed by whoever created the batch, so the same
 * cohort arrives as "3rd Year", "3rd year" or occasionally with the year only
 * in the display name. Reducing to the digit groups all of those under one
 * tile instead of showing near-duplicate rows, and it is the same value the
 * reports API already matches on.
 *
 * Only a standalone 1–9 or an ordinal ("3", "3rd") counts as a year. Taking
 * the first digit *run* instead would read "CS 2026 Section A" as year 2026
 * and "Draft Year - Batch A2 4753" as year 4753 — both exist in the live
 * batch table, and both produced their own nonsense tile. Anything
 * unrecognisable falls into the 'other' bucket rather than inventing a year.
 */
export function yearKeyOf(batch: BatchObject): string {
  const pick = (source: string): string => {
    const m = source.match(/\b([1-9])\b|\b([1-9])(?:st|nd|rd|th)\b/i);
    return m ? m[1] || m[2] : '';
  };
  return pick(batch.year?.trim() || '') || pick(batch.displayName || '') || 'other';
}

export function yearLabel(key: string): string {
  if (key === DRILL_ALL) return 'All Years';
  if (key === 'other') return 'Unsorted';
  const suffix = key === '1' ? 'st' : key === '2' ? 'nd' : key === '3' ? 'rd' : 'th';
  return `${key}${suffix} Year`;
}

/** Short form for tiles and breadcrumbs, where the word "Year" is already implied. */
function yearShortLabel(key: string): string {
  if (key === 'other') return 'Unsorted';
  const suffix = key === '1' ? 'st' : key === '2' ? 'nd' : key === '3' ? 'rd' : 'th';
  return `${key}${suffix}`;
}

/** "1st Year - Batch A" → "Batch A"; the year is already shown by the tile above. */
function batchShortLabel(batch: BatchObject): string {
  const label = batch.label?.trim();
  if (label) return label;
  const parts = batch.displayName.split(/\s[-–]\s/);
  return (parts.length > 1 ? parts.slice(1).join(' - ') : batch.displayName).trim() || batch.displayName;
}

export default function AcademicDrilldown({
  value,
  onChange,
  subjects,
  batches,
}: AcademicDrilldownProps) {
  const set = (patch: Partial<AcademicDrilldownValue>) => onChange({ ...value, ...patch });

  /**
   * Years 1–4 are always offered even when no batch carries one, because a
   * session can be tagged with a year through its free-text batch name alone.
   * Anything else a batch actually claims is appended so no cohort becomes
   * unreachable.
   */
  const yearOptions = useMemo(() => {
    const discovered = new Set(batches.map(yearKeyOf));
    const keys = new Set<string>(['1', '2', '3', '4']);
    for (const k of discovered) keys.add(k);
    return Array.from(keys).sort((a, b) => {
      if (a === 'other') return 1;
      if (b === 'other') return -1;
      return Number(a) - Number(b);
    });
  }, [batches]);

  const batchCountByYear = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of batches) {
      const k = yearKeyOf(b);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
  }, [batches]);

  const batchesInYear = useMemo(() => {
    if (value.year === DRILL_ALL) return [];
    return batches
      .filter((b) => yearKeyOf(b) === value.year)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [batches, value.year]);

  const selectedBatch = batches.find((b) => b.id === value.batchId);

  const isFiltered =
    value.year !== DRILL_ALL ||
    value.batchId !== DRILL_ALL ||
    value.subject !== DRILL_ALL ||
    value.mentorQuery.trim() !== '';

  /**
   * Each crumb clears the levels to its *right*, keeping its own value — so
   * "Year: 2nd" steps back to the whole of 2nd year rather than discarding it.
   * Mentor is the rightmost level with nothing to its right, so it clears
   * itself instead of being a button that does nothing.
   */
  const crumbs: Array<{ key: string; label: string; text: string; onClick: () => void }> = [
    {
      key: 'year',
      label: 'Year',
      text: value.year === DRILL_ALL ? 'All' : yearShortLabel(value.year),
      onClick: () => set({ batchId: DRILL_ALL, subject: DRILL_ALL, mentorQuery: '' }),
    },
    {
      key: 'batch',
      label: 'Batch',
      text:
        value.batchId === DRILL_ALL
          ? 'All'
          : selectedBatch
          ? batchShortLabel(selectedBatch)
          : value.batchId,
      onClick: () => set({ subject: DRILL_ALL, mentorQuery: '' }),
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

      {/* ── Step 1: Year ─────────────────────────────────────────────────── */}
      <div className="pm-drill-step">
        <div className="pm-drill-step-head">
          <span className="pm-drill-step-num">1</span>
          <span className="pm-drill-step-title">Academic Year</span>
        </div>
        <div className="pm-drill-tiles" role="group" aria-label="Academic year">
          <button
            type="button"
            className={`pm-drill-tile ${value.year === DRILL_ALL ? 'active' : ''}`}
            aria-pressed={value.year === DRILL_ALL}
            onClick={() => onChange({ ...EMPTY_DRILL })}
          >
            <span className="pm-drill-tile-main">All Years</span>
            <span className="pm-drill-tile-sub">{batches.length} batches</span>
          </button>
          {yearOptions.map((key) => {
            const count = batchCountByYear.get(key) ?? 0;
            return (
              <button
                key={key}
                type="button"
                className={`pm-drill-tile ${value.year === key ? 'active' : ''}`}
                aria-pressed={value.year === key}
                /* Changing year invalidates any batch chosen under the old one. */
                onClick={() => set({ year: key, batchId: DRILL_ALL })}
              >
                <span className="pm-drill-tile-main">{yearShortLabel(key)}</span>
                <span className="pm-drill-tile-sub">
                  {count} {count === 1 ? 'batch' : 'batches'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Step 2: Batch — only once a specific year is in view ─────────── */}
      {value.year !== DRILL_ALL && (
        <div className="pm-drill-step">
          <div className="pm-drill-step-head">
            <span className="pm-drill-step-num">2</span>
            <span className="pm-drill-step-title">Batch in {yearLabel(value.year)}</span>
            {/*
              'other' holds batches whose year field is blank or not a year at
              all (drafts, "CS 2026 Section A"). There is no year string for the
              API to match, so the table stays empty until a specific batch is
              picked — say so instead of letting it read as "no data".
            */}
            {value.year === 'other' && (
              <span className="pm-drill-step-hint">no academic year recorded — pick a batch to see its data</span>
            )}
          </div>
          {batchesInYear.length === 0 ? (
            <p className="pm-drill-empty">
              No batches are registered under {yearLabel(value.year)}. Sessions tagged with this
              year by name are still shown below.
            </p>
          ) : (
            <div className="pm-drill-tiles" role="group" aria-label="Batch">
              <button
                type="button"
                className={`pm-drill-tile ${value.batchId === DRILL_ALL ? 'active' : ''}`}
                aria-pressed={value.batchId === DRILL_ALL}
                onClick={() => set({ batchId: DRILL_ALL })}
              >
                <span className="pm-drill-tile-main">All Batches</span>
                <span className="pm-drill-tile-sub">in this year</span>
              </button>
              {batchesInYear.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`pm-drill-tile ${value.batchId === b.id ? 'active' : ''}`}
                  aria-pressed={value.batchId === b.id}
                  onClick={() => set({ batchId: b.id })}
                  title={b.displayName}
                >
                  <span className="pm-drill-tile-main">🎓 {batchShortLabel(b)}</span>
                  <span className="pm-drill-tile-sub">{b.displayName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Facets: Subject and Mentor, side by side and independent ─────── */}
      <div className="pm-drill-step">
        <div className="pm-drill-step-head">
          <span className="pm-drill-step-num">{value.year !== DRILL_ALL ? 3 : 2}</span>
          <span className="pm-drill-step-title">Narrow further</span>
          <span className="pm-drill-step-hint">applied together, in any combination</span>
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
