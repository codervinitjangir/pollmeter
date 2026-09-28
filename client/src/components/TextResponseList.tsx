import { useMemo, useState } from 'react';
import { TextAggregated } from '../types';

interface Props {
  responses: TextAggregated;
  variant?: 'projector' | 'compact';
  /** Cap what goes on screen — 50 answers at once is unreadable from a desk. */
  limit?: number;
}

/**
 * Group answers that differ only by case, surrounding space or trailing
 * punctuation. "Photosynthesis", "photosynthesis" and "photosynthesis." are one
 * idea to a class, so they should be one word on the wall.
 */
function normalize(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:"'’”]+$/g, '');
}

interface CloudTerm {
  label: string;
  count: number;
  /** 0..1 position between the rarest and most common answer. */
  weight: number;
}

/** Font ramp per variant: [min, max] in rem. */
const SIZE_RANGE: Record<'projector' | 'compact', [number, number]> = {
  projector: [1.4, 5.25],
  compact: [0.95, 2.3],
};

export default function TextResponseList({ responses, variant = 'compact', limit }: Props) {
  const isProjector = variant === 'projector';

  const { terms, hasRepeats } = useMemo(() => {
    // Tally by normalized key, but remember which original spelling was most
    // common so the cloud shows what students actually typed.
    const buckets = new Map<string, { count: number; forms: Map<string, number> }>();
    for (const raw of responses) {
      const key = normalize(raw);
      if (!key) continue;
      const bucket = buckets.get(key) ?? { count: 0, forms: new Map<string, number>() };
      bucket.count += 1;
      const display = raw.trim();
      bucket.forms.set(display, (bucket.forms.get(display) ?? 0) + 1);
      buckets.set(key, bucket);
    }

    const tallied = [...buckets.values()].map((bucket) => {
      let label = '';
      let best = -1;
      for (const [form, n] of bucket.forms) {
        if (n > best) {
          best = n;
          label = form;
        }
      }
      return { label, count: bucket.count };
    });

    tallied.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    const capped = limit != null ? tallied.slice(0, limit) : tallied;

    const counts = capped.map((t) => t.count);
    const max = Math.max(...counts, 1);
    const min = Math.min(...counts, 1);
    // Square-root ramp: perceived size tracks area, so a word said 9 times
    // reads as clearly bigger than one said 4 times without swamping the wall.
    const span = Math.sqrt(max) - Math.sqrt(min);
    const weighted: CloudTerm[] = capped.map((t) => ({
      ...t,
      weight: span === 0 ? 1 : (Math.sqrt(t.count) - Math.sqrt(min)) / span,
    }));

    // Alternate outward from the middle so the most-said answer lands in the
    // centre of the block and size falls off toward the edges.
    const arranged: CloudTerm[] = [];
    weighted.forEach((term, i) => {
      if (i % 2 === 0) arranged.push(term);
      else arranged.unshift(term);
    });

    return { terms: arranged, hasRepeats: max > 1 };
  }, [responses, limit]);

  // A cloud of all-unique answers is just a ragged list, so only lead with it
  // once the class has actually converged on something.
  const [view, setView] = useState<'cloud' | 'list' | null>(null);
  const effectiveView = view ?? (hasRepeats ? 'cloud' : 'list');

  if (responses.length === 0) {
    return <p className="text-empty">Waiting for the first response…</p>;
  }

  const ordered = [...responses].reverse();
  const visible = limit != null ? ordered.slice(0, limit) : ordered;
  const [minSize, maxSize] = SIZE_RANGE[variant];
  // The projector view is presenter-driven, so the switch belongs there. In the
  // compact contexts it would repeat once per question card in the review grid
  // and add a control nobody asked for to the student's phone.
  const showSwitch = isProjector && responses.length > 1;

  return (
    <div className={`answers${isProjector ? ' answers--projector' : ''}`}>
      {showSwitch && (
        <div className="wc-switch" role="group" aria-label="Response view">
          <button
            type="button"
            className={`wc-switch-btn${effectiveView === 'cloud' ? ' is-active' : ''}`}
            onClick={() => setView('cloud')}
            aria-pressed={effectiveView === 'cloud'}
          >
            Cloud
          </button>
          <button
            type="button"
            className={`wc-switch-btn${effectiveView === 'list' ? ' is-active' : ''}`}
            onClick={() => setView('list')}
            aria-pressed={effectiveView === 'list'}
          >
            List
          </button>
        </div>
      )}

      {effectiveView === 'cloud' ? (
        <ul className={`wordcloud${isProjector ? ' wordcloud--projector' : ''}`}>
          {terms.map((term, idx) => {
            const tier = Math.min(4, Math.round(term.weight * 4));
            return (
              <li
                key={term.label}
                className={`wc-term wc-t${tier}`}
                style={
                  {
                    // Handed to CSS as a variable rather than a flat font-size so
                    // the mobile breakpoint can scale the whole ramp down
                    // proportionally. Overriding font-size directly would flatten
                    // every word to one size and destroy the frequency read.
                    '--wc-size': `${(minSize + term.weight * (maxSize - minSize)).toFixed(3)}rem`,
                    animationDelay: `${Math.min(idx * 35, 500)}ms`,
                  } as React.CSSProperties
                }
                /* Size carries the frequency visually; screen readers get it in words. */
                aria-label={`${term.label} — ${term.count} ${term.count === 1 ? 'response' : 'responses'}`}
              >
                <span className="wc-word">{term.label}</span>
                {term.count > 1 && (
                  <span className="wc-count" aria-hidden="true">
                    {term.count}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="answer-grid">
          {visible.map((response, idx) => (
            <li key={`${idx}-${response.slice(0, 24)}`} className="answer-chip">
              {response}
            </li>
          ))}
        </ul>
      )}

      <p className="answers-total">
        {responses.length} response{responses.length === 1 ? '' : 's'}
        {effectiveView === 'cloud'
          ? terms.length < responses.length && ` · ${terms.length} distinct`
          : visible.length < responses.length && ` · showing the latest ${visible.length}`}
      </p>
    </div>
  );
}
