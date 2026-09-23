import { useState, useEffect } from 'react';
import { Question, AiStatus } from '../types';
import { apiUrl } from '../api';
import QuestionForm from './QuestionForm';

interface Props {
  onInsert: (questions: Question[]) => void;
  onClose: () => void;
  initialTopic?: string;
}

type Difficulty = 'easy' | 'medium' | 'hard';
type QType = 'mcq' | 'open_text' | 'mixed';
type Mode = 'topic' | 'syllabus';

/** Mirrors the server's own caps so the UI can't ask for something it will trim. */
const MAX_COUNT = 20;
const MAX_SYLLABUS = 4000;

export default function AIGenerateModal({ onInsert, onClose, initialTopic = '' }: Props) {
  const [mode, setMode] = useState<Mode>('topic');
  const [topic, setTopic] = useState(initialTopic);
  const [syllabus, setSyllabus] = useState('');
  const [audience, setAudience] = useState('');
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [qtype, setQtype] = useState<QType>('mcq');
  const [timeLimit, setTimeLimit] = useState(30);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [preview, setPreview] = useState<Question[] | null>(null);
  const [source, setSource] = useState<{ source: string; model?: string; notice?: string } | null>(null);
  const [editing, setEditing] = useState<Question | null>(null);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [loadStep, setLoadStep] = useState(0);

  useEffect(() => {
    if (!loading) {
      setLoadStep(0);
      return;
    }
    const timer = setInterval(() => {
      setLoadStep((prev) => prev + 1);
    }, 2200);
    return () => clearInterval(timer);
  }, [loading]);

  const LOADING_MESSAGES = [
    '✨ Analyzing topic & syllabus...',
    '⚡ Crafting multiple-choice options & answers...',
    '🔍 Verifying correctness & formatting...',
    '🚀 Finalizing question set...',
  ];

  // Report what is actually configured rather than claiming a specific vendor.
  useEffect(() => {
    fetch(apiUrl('/api/ai/status'))
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  async function generate() {
    const t = topic.trim();
    const s = syllabus.trim();
    if (!t && !s) {
      setError(mode === 'syllabus' ? 'Paste some syllabus text first.' : 'Enter a topic.');
      return;
    }

    setError('');
    setHint('');
    setLoading(true);
    setPreview(null);
    setSource(null);

    try {
      const res = await fetch(apiUrl('/api/ai/generate-questions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: t,
          syllabus: mode === 'syllabus' ? s : '',
          audience: audience.trim(),
          count,
          difficulty,
          type: qtype,
          timeLimitSeconds: timeLimit,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Generation failed.');
        // 502 means the model answered but not usably — retrying often works.
        // 503 means nothing is configured, so retrying never will.
        if (res.status === 502) setHint('Try again, or lower the question count.');
        if (res.status === 503) setHint('Add a key to server/.env, or write the questions by hand.');
        return;
      }

      setPreview(Array.isArray(data.questions) ? data.questions : []);
      setSource({ source: data.source ?? 'ai', model: data.model, notice: data.notice });
    } catch {
      setError('Could not reach the server. Check that it is still running.');
    } finally {
      setLoading(false);
    }
  }

  function replaceQuestion(q: Question) {
    setPreview((prev) => (prev ? prev.map((p) => (p.id === q.id ? q : p)) : prev));
    setEditing(null);
  }

  function dropQuestion(id: string) {
    setPreview((prev) => (prev ? prev.filter((p) => p.id !== id) : prev));
    setEditing((prev) => (prev?.id === id ? null : prev));
  }

  function handleInsert() {
    if (preview && preview.length > 0) {
      onInsert(preview);
      onClose();
    }
  }

  const subtitle = !status
    ? 'Checking what is configured…'
    : status.enabled
      ? `Using ${status.model}`
      : 'No AI key configured — falling back to the built-in question bank';

  // While editing one generated question the form takes over the modal body;
  // the mentor gets the full editor rather than a cut-down inline version.
  if (editing) {
    return (
      <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
        <div className="modal stack stack-5" role="dialog" aria-label="Edit generated question">
          <div className="modal-header">
            <p className="t-title">✏️ Edit this question</p>
            <button className="btn btn-ghost btn--icon" onClick={() => setEditing(null)} aria-label="Back">✕</button>
          </div>
          <QuestionForm initial={editing} onSave={replaceQuestion} onCancel={() => setEditing(null)} />
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal stack stack-5" role="dialog" aria-label="AI Question Generator">
        <div className="modal-header">
          <div className="stack stack-2">
            <p className="t-title">✨ Generate questions</p>
            <p className="t-body-sm text-secondary">{subtitle}</p>
          </div>
          <button className="btn btn-ghost btn--icon" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="row row-2">
          <button
            type="button"
            className={`btn btn--sm ${mode === 'topic' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMode('topic')}
          >
            From a topic
          </button>
          <button
            type="button"
            className={`btn btn--sm ${mode === 'syllabus' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMode('syllabus')}
          >
            From my syllabus
          </button>
        </div>

        <div className="field">
          <div className="row row-2" style={{ justifyContent: 'space-between' }}>
            <label className="field-label" htmlFor="ai-topic">
              {mode === 'syllabus' ? 'What to call it' : 'Topic'}
            </label>
            <span className="t-body-sm text-muted">shown to you only, not to students</span>
          </div>
          <input
            id="ai-topic"
            type="text"
            value={topic}
            maxLength={200}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={
              mode === 'syllabus'
                ? 'e.g. "Unit 3 — Process Scheduling"'
                : 'e.g. "Operating Systems", "Python OOP", "Calculus Basics"'
            }
            onKeyDown={(e) => e.key === 'Enter' && mode === 'topic' && !loading && generate()}
          />
          {mode === 'topic' && (
            <div className="row row-2 row-wrap" style={{ marginTop: '0.4rem' }}>
              {[
                'Python Basics',
                'Operating Systems',
                'Data Structures',
                'Web Dev & JS',
                'General Science',
                'World Geography',
              ].map((syl) => (
                <button key={syl} type="button" className="syllabus-chip" onClick={() => setTopic(syl)}>
                  + {syl}
                </button>
              ))}
            </div>
          )}
        </div>

        {mode === 'syllabus' && (
          <div className="field">
            <div className="row row-2" style={{ justifyContent: 'space-between' }}>
              <label className="field-label" htmlFor="ai-syllabus">Paste your syllabus or lesson notes</label>
              <span className="t-body-sm text-muted">
                {syllabus.length}/{MAX_SYLLABUS}
              </span>
            </div>
            <textarea
              id="ai-syllabus"
              className="ai-syllabus"
              value={syllabus}
              maxLength={MAX_SYLLABUS}
              onChange={(e) => setSyllabus(e.target.value)}
              placeholder={
                'Paste the unit outline, chapter summary, or your own notes.\n\n' +
                'Questions are drawn only from this text, so the class is tested on what you actually taught.'
              }
              rows={7}
            />
          </div>
        )}

        <div className="field">
          <label className="field-label" htmlFor="ai-audience">Who is the class? <span className="text-muted">(optional)</span></label>
          <input
            id="ai-audience"
            type="text"
            value={audience}
            maxLength={120}
            onChange={(e) => setAudience(e.target.value)}
            placeholder='e.g. "Class 10 CBSE", "2nd year B.Tech, first week"'
          />
        </div>

        <div className="row row-3 row-wrap">
          <div className="field" style={{ flex: '1 1 80px' }}>
            <label className="field-label" htmlFor="ai-count">Questions</label>
            <select id="ai-count" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[3, 5, 7, 10, 12, 15, MAX_COUNT].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div className="field" style={{ flex: '1 1 100px' }}>
            <label className="field-label" htmlFor="ai-diff">Difficulty</label>
            <select id="ai-diff" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          <div className="field" style={{ flex: '1 1 100px' }}>
            <label className="field-label" htmlFor="ai-type">Type</label>
            <select id="ai-type" value={qtype} onChange={(e) => setQtype(e.target.value as QType)}>
              <option value="mcq">Scored MCQ</option>
              <option value="open_text">Open text</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>

          <div className="field" style={{ flex: '1 1 80px' }}>
            <label className="field-label" htmlFor="ai-time">Time each</label>
            <select id="ai-time" value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))}>
              <option value={15}>15s</option>
              <option value={20}>20s</option>
              <option value={30}>30s</option>
              <option value={45}>45s</option>
              <option value={60}>60s</option>
              <option value={90}>90s</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="alert alert-error stack stack-2">
            <span>⚠ {error}</span>
            {hint && <span className="t-body-sm">{hint}</span>}
          </div>
        )}

        {preview && source && (
          <div className={`ai-source ${source.source === 'ai' ? 'ai-source--ai' : 'ai-source--bank'}`}>
            {source.source === 'ai' ? (
              <span>✨ Generated by {source.model || 'AI'} — check them before you project them.</span>
            ) : (
              <span>📚 {source.notice ?? 'These came from the built-in question bank, not AI.'}</span>
            )}
          </div>
        )}

        {preview && (
          <div className="stack stack-3">
            {preview.length === 0 ? (
              <p className="t-body-sm text-muted">
                Every question was discarded as unusable. Try again, or add questions by hand.
              </p>
            ) : (
              <p className="t-label-md text-success">
                ✓ {preview.length} question{preview.length === 1 ? '' : 's'} ready — edit or drop any of them:
              </p>
            )}

            <div className="stack stack-3" style={{ maxHeight: 280, overflowY: 'auto', paddingRight: '0.25rem' }}>
              {preview.map((q, i) => (
                <div key={q.id} className="card card--sm row row-3" style={{ alignItems: 'flex-start' }}>
                  <div className="flex-1 stack stack-2">
                    <div className="row row-2 row-wrap">
                      <span className="badge badge-neutral t-label-sm">{i + 1}</span>
                      <span className="badge badge-primary t-label-sm">
                        {q.type === 'mcq' ? 'MCQ' : 'Open text'}
                      </span>
                      <span className="badge badge-neutral t-label-sm">{q.timeLimitSeconds}s</span>
                      {q.correctAnswer ? (
                        <span className="badge badge-success t-label-sm">✓ Scored</span>
                      ) : (
                        <span className="badge badge-neutral t-label-sm">Poll</span>
                      )}
                    </div>
                    <p className="t-body-sm text-primary" style={{ fontWeight: 600 }}>{q.text}</p>
                    {q.options && (
                      <p className="t-body-sm text-muted">
                        {q.options
                          .map((o) => (o === q.correctAnswer ? `✓ ${o}` : o))
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                  <div className="row row-2">
                    <button
                      className="btn btn-ghost btn--icon btn--sm"
                      onClick={() => setEditing(q)}
                      aria-label={`Edit generated question ${i + 1}`}
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn btn-ghost btn--icon btn--sm"
                      onClick={() => dropQuestion(q.id)}
                      aria-label={`Drop generated question ${i + 1}`}
                      title="Drop"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {loading && (
          <div
            className="row row-2"
            style={{
              background: '#EFF6FF',
              border: '1.5px solid #BFDBFE',
              borderRadius: '12px',
              padding: '0.85rem 1.25rem',
              alignItems: 'center',
              animation: 'pop-in 0.3s var(--ease)',
            }}
          >
            <span className="spinner spinner--sm" style={{ borderTopColor: '#1F69FF', width: 18, height: 18 }} />
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1E40AF' }}>
              {LOADING_MESSAGES[Math.min(loadStep, LOADING_MESSAGES.length - 1)]}
            </span>
          </div>
        )}

        <div className="row row-3" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          {preview && (
            <button className="btn btn-ghost" onClick={generate} disabled={loading} id="ai-regenerate-btn">
              ↻ Regenerate
            </button>
          )}
          {preview && preview.length > 0 ? (
            <button className="btn btn-success" onClick={handleInsert} id="ai-insert-btn">
              ✓ Add {preview.length} question{preview.length === 1 ? '' : 's'}
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
