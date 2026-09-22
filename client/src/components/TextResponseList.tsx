import { TextAggregated } from '../types';

interface Props {
  responses: TextAggregated;
  variant?: 'projector' | 'compact';
  /** Cap what goes on screen — 50 answers at once is unreadable from a desk. */
  limit?: number;
}

export default function TextResponseList({ responses, variant = 'compact', limit }: Props) {
  const isProjector = variant === 'projector';
  // Newest first, so the screen shows answers as they land.
  const ordered = [...responses].reverse();
  const visible = limit != null ? ordered.slice(0, limit) : ordered;

  if (responses.length === 0) {
    return <p className="text-empty">Waiting for the first response…</p>;
  }

  return (
    <div className={`answers${isProjector ? ' answers--projector' : ''}`}>
      <ul className="answer-grid">
        {visible.map((response, idx) => (
          <li key={`${idx}-${response.slice(0, 24)}`} className="answer-chip">
            {response}
          </li>
        ))}
      </ul>

      <p className="answers-total">
        {responses.length} response{responses.length === 1 ? '' : 's'}
        {visible.length < responses.length && ` · showing the latest ${visible.length}`}
      </p>
    </div>
  );
}
