import { useState } from 'react';
import { Question } from '../types';

interface Props {
  onInsert: (questions: Question[]) => void;
  onClose: () => void;
  initialTopic?: string;
}

type Difficulty = 'easy' | 'medium' | 'hard';
type QType = 'mcq' | 'open_text' | 'mixed';

export default function AIGenerateModal({ onInsert, onClose, initialTopic = '' }: Props) {
  const [topic, setTopic] = useState(initialTopic);
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [qtype, setQtype] = useState<QType>('mcq');
  const [timeLimit, setTimeLimit] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Question[] | null>(null);

  async function generate() {
    if (!topic.trim()) { setError('Enter a topic.'); return; }
    setError('');
    setLoading(true);
    setPreview(null);

    try {
      const res = await fetch('/api/ai/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), count, difficulty, type: qtype, timeLimitSeconds: timeLimit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Generation failed.');
      setPreview(data.questions);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  function handleInsert() {
    if (preview) { onInsert(preview); onClose(); }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal stack stack-5" role="dialog" aria-label="AI Question Generator">
        <div className="modal-header">
          <div className="stack stack-2">
            <p className="t-title">✨ Generate with AI</p>
            <p className="t-body-sm text-secondary">Powered by Google Gemini</p>
          </div>
          <button className="btn btn-ghost btn--icon" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Topic / Syllabus */}
        <div className="field">
          <div className="row row-2" style={{ justifyContent: 'space-between' }}>
            <label className="field-label" htmlFor="ai-topic">Topic or Syllabus Unit</label>
            <span className="t-body-sm text-muted">e.g. Chapter 3, Python Functions</span>
          </div>
          <input
            id="ai-topic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder='e.g. "Operating Systems", "Python OOP", "Calculus Basics"'
            onKeyDown={(e) => e.key === 'Enter' && !loading && generate()}
          />
          <div className="row row-2 row-wrap" style={{ marginTop: '0.4rem' }}>
            {[
              'Python Basics',
              'Operating Systems',
              'Data Structures',
              'Web Dev & JS',
              'General Science',
              'World Geography',
            ].map((syl) => (
              <button
                key={syl}
                type="button"
                className="syllabus-chip"
                onClick={() => setTopic(syl)}
              >
                + {syl}
              </button>
            ))}
          </div>
        </div>

        {/* Settings row */}
        <div className="row row-3 row-wrap">
          {/* Count */}
          <div className="field" style={{ flex: '1 1 80px' }}>
            <label className="field-label" htmlFor="ai-count">Questions</label>
            <select id="ai-count" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[3,5,7,10].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {/* Difficulty */}
          <div className="field" style={{ flex: '1 1 100px' }}>
            <label className="field-label" htmlFor="ai-diff">Difficulty</label>
            <select id="ai-diff" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          {/* Type */}
          <div className="field" style={{ flex: '1 1 100px' }}>
            <label className="field-label" htmlFor="ai-type">Type</label>
            <select id="ai-type" value={qtype} onChange={(e) => setQtype(e.target.value as QType)}>
              <option value="mcq">MCQ</option>
              <option value="open_text">Open Text</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>

          {/* Time */}
          <div className="field" style={{ flex: '1 1 80px' }}>
            <label className="field-label" htmlFor="ai-time">Time/Q</label>
            <select id="ai-time" value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))}>
              <option value={15}>15s</option>
              <option value={30}>30s</option>
              <option value={60}>60s</option>
            </select>
          </div>
        </div>

        {error && <div className="alert alert-error">⚠ {error}</div>}

        {/* Preview */}
        {preview && (
          <div className="stack stack-3">
            <p className="t-label-md text-success">✓ {preview.length} questions generated — review before adding:</p>
            <div className="stack stack-3" style={{ maxHeight: 240, overflowY: 'auto' }}>
              {preview.map((q, i) => (
                <div key={q.id} className="card card--sm stack stack-2">
                  <div className="row row-2">
                    <span className="badge badge-neutral t-label-sm">{i + 1}</span>
                    <span className="badge badge-primary t-label-sm">{q.type === 'mcq' ? 'MCQ' : 'Open'}</span>
                    <span className="badge badge-neutral t-label-sm">{q.timeLimitSeconds}s</span>
                    {q.correctAnswer && <span className="badge badge-success t-label-sm">✓ Key set</span>}
                  </div>
                  <p className="t-body-sm text-primary">{q.text}</p>
                  {q.options && (
                    <p className="t-body-sm text-muted">{q.options.join(' · ')}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="row row-3" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          {preview ? (
            <button className="btn btn-success" onClick={handleInsert} id="ai-insert-btn">
              ✓ Add {preview.length} Questions
            </button>
          ) : (
            <button className="btn btn-ai" onClick={generate} disabled={loading} id="ai-generate-btn">
              {loading ? (
                <><span className="spinner spinner--sm" style={{ borderTopColor: '#fff' }} /> Generating…</>
              ) : '✨ Generate'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
