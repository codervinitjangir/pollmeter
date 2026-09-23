import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Question, QuestionType } from '../types';

interface Props {
  onSave?: (question: Question) => void;
  onAdd?: (question: Question) => void;
  /** When present the form edits this question instead of adding a new one. */
  initial?: Question | null;
  onCancel?: () => void;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const TIME_OPTIONS = [10, 15, 20, 30, 45, 60, 90];
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

export default function QuestionForm({ onSave, onAdd, initial = null, onCancel }: Props) {
  const [type, setType] = useState<QuestionType>('mcq');
  const [text, setText] = useState('');
  const [options, setOptions] = useState<string[]>(['', '', '', '']);
  // Tracked by index, not by value — tracking by string broke when an option
  // was renamed or when two options briefly held the same text.
  const [correctIndex, setCorrectIndex] = useState<number | null>(null);
  const [timeLimit, setTimeLimit] = useState(30);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!initial) return;
    setType(initial.type);
    setText(initial.text);
    const opts = initial.options ?? ['', '', '', ''];
    setOptions(opts.length >= MIN_OPTIONS ? opts : [...opts, '', '']);
    setCorrectIndex(
      initial.correctAnswer ? opts.indexOf(initial.correctAnswer) : null
    );
    setTimeLimit(initial.timeLimitSeconds);
    setError('');
  }, [initial]);

  function reset() {
    setType('mcq');
    setText('');
    setOptions(['', '', '', '']);
    setCorrectIndex(null);
    setTimeLimit(30);
    setError('');
  }

  function updateOption(idx: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === idx ? value : o)));
  }

  function addOption() {
    setOptions((prev) => (prev.length >= MAX_OPTIONS ? prev : [...prev, '']));
  }

  function removeOption(idx: number) {
    setOptions((prev) => (prev.length <= MIN_OPTIONS ? prev : prev.filter((_, i) => i !== idx)));
    setCorrectIndex((prev) => {
      if (prev == null) return null;
      if (prev === idx) return null;
      return prev > idx ? prev - 1 : prev;
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    const trimmedText = text.trim();
    if (!trimmedText) {
      setError('Write the question first.');
      return;
    }

    const saveHandler = onSave || onAdd;
    if (!saveHandler) return;

    if (type === 'open_text') {
      saveHandler({
        id: initial?.id ?? uuidv4(),
        type: 'open_text',
        text: trimmedText,
        timeLimitSeconds: timeLimit,
      });
      if (!initial) reset();
      return;
    }

    const trimmed = options.map((o) => o.trim());
    const filled = trimmed.filter(Boolean);

    if (filled.length < MIN_OPTIONS) {
      setError('Give at least two options.');
      return;
    }
    if (new Set(filled).size !== filled.length) {
      setError('Two options are identical — make each one distinct.');
      return;
    }

    const correctValue =
      correctIndex != null && trimmed[correctIndex]?.trim() ? trimmed[correctIndex].trim() : undefined;

    saveHandler({
      id: initial?.id ?? uuidv4(),
      type: 'mcq',
      text: trimmedText,
      options: filled,
      correctAnswer: correctValue,
      timeLimitSeconds: timeLimit,
    });

    if (!initial) reset();
  }

  function setTrueFalseMode() {
    setType('mcq');
    setOptions(['True', 'False']);
    setCorrectIndex(0);
  }

  function setMcqMode() {
    setType('mcq');
    if (options.length < 4) {
      setOptions(['', '', '', '']);
    }
  }

  function setPollMode() {
    setType('mcq');
    setCorrectIndex(null);
  }

  const isTrueFalse = options.length === 2 && options[0] === 'True' && options[1] === 'False';
  const isPoll = correctIndex === null;

  return (
    <form onSubmit={handleSubmit} className="qform" noValidate>
      <div className="qform-row">
        <div className="seg" role="group" aria-label="Question format">
          <button
            type="button"
            className={`seg-btn${!isTrueFalse && !isPoll ? ' is-active' : ''}`}
            onClick={setMcqMode}
          >
            Multiple choice
          </button>
          <button
            type="button"
            className={`seg-btn${isTrueFalse ? ' is-active' : ''}`}
            onClick={setTrueFalseMode}
          >
            True / False
          </button>
          <button
            type="button"
            className={`seg-btn${isPoll && !isTrueFalse ? ' is-active' : ''}`}
            onClick={setPollMode}
          >
            📊 Live Poll
          </button>
        </div>

        <label className="qform-time">
          <span className="field-label">Time</span>
          <select value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))}>
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}s
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span className="field-label">Question</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Which scheduling algorithm can starve long jobs?"
          maxLength={300}
          rows={2}
        />
      </label>

      {type === 'mcq' && (
        <fieldset className="field">
          <legend className="field-label">
            Options <span className="field-note">select the correct one to make it a scored quiz question</span>
          </legend>

          <div className="opt-list">
            {options.map((option, idx) => {
              const selectable = Boolean(option.trim());
              const isCorrect = correctIndex === idx && selectable;

              return (
                <div key={idx} className={`opt${isCorrect ? ' is-correct' : ''}`}>
                  <span className="opt-key">{LETTERS[idx]}</span>
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => updateOption(idx, e.target.value)}
                    placeholder={`Option ${LETTERS[idx]}`}
                    maxLength={120}
                  />
                  <button
                    type="button"
                    className={`opt-mark${isCorrect ? ' is-correct' : ''}`}
                    onClick={() => setCorrectIndex(isCorrect ? null : idx)}
                    disabled={!selectable}
                    aria-pressed={isCorrect}
                    title={isCorrect ? 'This is the correct answer' : 'Mark as correct'}
                  >
                    {isCorrect ? '✓ Correct' : 'Mark'}
                  </button>
                  {options.length > MIN_OPTIONS && (
                    <button
                      type="button"
                      className="opt-remove"
                      onClick={() => removeOption(idx)}
                      aria-label={`Remove option ${LETTERS[idx]}`}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {options.length < MAX_OPTIONS && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={addOption}>
              + Add option
            </button>
          )}

          <p className="qform-hint">
            {correctIndex != null && Boolean(options[correctIndex]?.trim())
              ? '⚡ Scored: 1000 points for correct answer + up to 500 points speed bonus.'
              : '📊 Live Poll: No correct answer marked — answers show live in Mentimeter bars (unscored).'}
          </p>
        </fieldset>
      )}

      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      <div className="qform-actions">
        {initial && onCancel && (
          <button type="button" className="btn btn-quiet" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary">
          {initial ? 'Save changes' : 'Add question'}
        </button>
      </div>
    </form>
  );
}
