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

/**
 * Answer options are *nominal* — reordering them changes nothing — so they all
 * share one hue. Colouring each bar differently would spend the identity channel
 * re-encoding what the bar length already says.
 *
 * Once the answer is revealed, correct/incorrect is a *status*, so the correct
 * bar takes the status-good token and is labelled with a ✓ and the word
 * "Correct" — status never travels on colour alone.
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

  return (
    <div className={`bars${isProjector ? ' bars--projector' : ''}`}>
      {entries.map(([label, count], idx) => {
        const share = total > 0 ? Math.round((count / total) * 100) : 0;
        const width = (count / max) * 100;
        const isCorrect = correctAnswer != null && correctAnswer === label;
        const isRevealed = correctAnswer != null;

        return (
          <div
            key={label}
            className={`bar-row${isCorrect ? ' is-correct' : ''}${
              isRevealed && !isCorrect ? ' is-dimmed' : ''
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
                    <span aria-hidden="true">✓</span> Correct
                  </span>
                )}
              </div>

              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: hideValues ? '0%' : `${width}%` }}
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
