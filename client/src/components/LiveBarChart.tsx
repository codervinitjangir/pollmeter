import { McqAggregated } from '../types';

interface Props {
  aggregated: McqAggregated;
  /** Only passed once the mentor has revealed the answer. */
  correctAnswer?: string;
  /** Sizes type and bars for a projector vs. a phone in someone's hand. */
  variant?: 'projector' | 'compact';
  /** Hide counts while a graded question is still open. */
  hideValues?: boolean;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Mentimeter's signature vibrant per-option palette. */
const OPTION_COLORS = [
  { bar: '#38BDF8', dark: '#0EA5E9', text: '#0C4A6E' }, // Aqua Blue
  { bar: '#F43F5E', dark: '#E11D48', text: '#4C0519' }, // Coral Red
  { bar: '#34D399', dark: '#10B981', text: '#064E3B' }, // Mint Emerald
  { bar: '#FBBF24', dark: '#F59E0B', text: '#451A03' }, // Sunburst Amber
  { bar: '#A78BFA', dark: '#8B5CF6', text: '#2E1065' }, // Violet
  { bar: '#FB923C', dark: '#EA580C', text: '#431407' }, // Tangerine
];

function getColor(idx: number) {
  return OPTION_COLORS[idx % OPTION_COLORS.length];
}

/**
 * Vertical column chart (projector) or horizontal bars (compact/mobile).
 *
 * On projector: columns grow upward from a baseline, each with a unique color.
 * After answer reveal: checkmark badge above correct column, cross on wrong ones.
 *
 * Accessibility: bars have explicit aria-labels and correct/incorrect status
 * is conveyed through both colour and text, never colour alone (WCAG 1.4.1).
 */
export default function LiveBarChart({
  aggregated,
  correctAnswer,
  variant = 'compact',
  hideValues = false,
}: Props) {
  const entries = Object.entries(aggregated);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  const max = Math.max(1, ...entries.map(([, count]) => count));
  const isProjector = variant === 'projector';
  const isRevealed = correctAnswer != null;

  /* ── Vertical column chart (projector, desktop) ── */
  if (isProjector) {
    return (
      <div className="col-chart" role="group" aria-label="Answer distribution">
        {/* Column bars */}
        <div className="col-chart-bars">
          {entries.map(([label, count], idx) => {
            const pct = hideValues ? 0 : (count / max) * 100;
            const isCorrect = isRevealed && correctAnswer === label;
            const isWrong = isRevealed && correctAnswer !== label;
            const share = total > 0 ? Math.round((count / total) * 100) : 0;
            const color = getColor(idx);

            return (
              <div
                key={label}
                className={`col-item${isCorrect ? ' col-item--correct' : ''}${
                  isWrong ? ' col-item--wrong' : ''
                }`}
                aria-label={`Option ${LETTERS[idx]}: ${label}, ${count} of ${total} responses${
                  isCorrect ? ', Correct' : isWrong ? ', Incorrect' : ''
                }`}
              >
                {/* Status icon above bar */}
                <div className="col-icon-wrap">
                  {isCorrect && (
                    <span className="col-icon col-icon--correct" aria-hidden="true">
                      ✔
                    </span>
                  )}
                  {isWrong && (
                    <span className="col-icon col-icon--wrong" aria-hidden="true">
                      ✖
                    </span>
                  )}
                </div>

                {/* Vote count above bar */}
                {!hideValues && count > 0 && (
                  <span className="col-count">{count}</span>
                )}
                {!hideValues && count === 0 && <span className="col-count col-count--zero">0</span>}

                {/* The column track + fill */}
                <div className="col-track">
                  <div
                    className="col-fill"
                    style={{
                      height: `${pct}%`,
                      background: isCorrect
                        ? `linear-gradient(180deg, #4ADE80 0%, #16A34A 100%)`
                        : `linear-gradient(180deg, ${color.bar} 0%, ${color.dark} 100%)`,
                      opacity: isWrong ? 0.45 : 1,
                    }}
                    role="img"
                    aria-hidden="true"
                  />
                </div>

                {/* Option letter + label */}
                <div className="col-label-wrap">
                  <span
                    className="col-letter"
                    style={{
                      background: isCorrect
                        ? '#16A34A'
                        : isWrong
                        ? '#94A3B8'
                        : color.dark,
                    }}
                  >
                    {LETTERS[idx] ?? idx + 1}
                  </span>
                  <span
                    className={`col-label-text${isWrong ? ' col-label-text--dim' : ''}`}
                    title={label}
                  >
                    {label}
                  </span>
                  {!hideValues && (
                    <span className="col-share">{share}%</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Baseline axis line */}
        <div className="col-axis" aria-hidden="true" />

        {/* Total response count */}
        {!hideValues && (
          <p className="col-total">
            <span className="col-total-icon" aria-hidden="true">👤</span>{' '}
            {total} response{total !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    );
  }

  /* ── Horizontal bars (compact / mobile) ── */
  return (
    <div className="bars" role="group" aria-label="Answer distribution">
      {entries.map(([label, count], idx) => {
        const share = total > 0 ? Math.round((count / total) * 100) : 0;
        const width = (count / max) * 100;
        const isCorrect = isRevealed && correctAnswer === label;
        const isWrong = isRevealed && !isCorrect;
        const color = getColor(idx);

        return (
          <div
            key={label}
            className={`bar-row${isCorrect ? ' is-correct' : ''}${
              isWrong ? ' is-dimmed' : ''
            }`}
          >
            <span className="bar-key" aria-hidden="true">
              {LETTERS[idx] ?? idx + 1}
            </span>

            <div className="bar-body">
              <div className="bar-label">
                <span className="bar-text">{label}</span>
                {isCorrect && (
                  <span className="bar-status">
                    <span aria-hidden="true">✔</span> Correct
                  </span>
                )}
              </div>

              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: hideValues ? '0%' : `${width}%`,
                    background: isCorrect
                      ? 'linear-gradient(90deg, #4ADE80, #16A34A)'
                      : `linear-gradient(90deg, ${color.bar}, ${color.dark})`,
                    opacity: isWrong ? 0.45 : 1,
                  }}
                  role="img"
                  aria-label={`${label}: ${count} of ${total} responses`}
                />
                {!hideValues && count > 0 && (
                  <span className="bar-value" style={{ left: `${width}%` }}>
                    {count}
                    <span className="bar-share"> · {share}%</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {!hideValues && (
        <p className="bars-total">
          {total} response{total === 1 ? '' : 's'}
        </p>
      )}
    </div>
  );
}
