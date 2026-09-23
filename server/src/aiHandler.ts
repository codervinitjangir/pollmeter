import 'dotenv/config';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Question } from './types';

const PLACEHOLDER_KEYS = ['your_key_here', 'AIzaSy...', 'changeme', 'replace_me'];

function getGeminiKeys(): string[] {
  return [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
  ].map(k => (k ?? '').trim()).filter(k => k.length > 20 && !PLACEHOLDER_KEYS.includes(k));
}

function getGroqKeys(): string[] {
  return [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4,
  ].map(k => (k ?? '').trim()).filter(k => k.length > 20 && !PLACEHOLDER_KEYS.includes(k));
}

const GEMINI_MODEL = (process.env.GEMINI_MODEL ?? 'gemini-3.6-flash').trim();
const FALLBACK_MODEL = 'gemini-2.5-flash';
const GROQ_MODEL = (process.env.GROQ_MODEL ?? 'llama3-70b-8192').trim();
const REQUEST_TIMEOUT_MS = 45000;

let currentKeyIndex = 0;
let currentGroqKeyIndex = 0;

export function hasApiKey(): boolean {
  return getGeminiKeys().length > 0 || getGroqKeys().length > 0;
}

/** Reports what is actually configured — the UI shows this verbatim. */
export function getAiStatus(): { enabled: boolean; model: string | null; reason?: string } {
  const gemini = getGeminiKeys();
  const groq = getGroqKeys();
  if (gemini.length > 0) {
    return { enabled: true, model: `${GEMINI_MODEL} (+ ${gemini.length - 1} backup keys, Groq fallback)` };
  }
  if (groq.length > 0) {
    return { enabled: true, model: `${GROQ_MODEL} (Groq)` };
  }
  return {
    enabled: false,
    model: null,
    reason: 'No API keys set in server/.env — generation falls back to a small built-in question bank.',
  };
}

interface GenerateRequest {
  topic: string;
  syllabus?: string;
  count: number;
  difficulty: 'easy' | 'medium' | 'hard';
  type: 'mcq' | 'open_text' | 'mixed';
  timeLimitSeconds: number;
  audience?: string;
}

const MAX_COUNT = 20;
const MAX_TOPIC_LENGTH = 200;
const MAX_SYLLABUS_LENGTH = 4000;

// ─── Gemini ───────────────────────────────────────────────────────────────────

const RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      type: { type: 'STRING', enum: ['mcq', 'open_text'] },
      text: { type: 'STRING' },
      options: { type: 'ARRAY', items: { type: 'STRING' } },
      correctAnswer: { type: 'STRING' },
      answer: { type: 'STRING' },
    },
    required: ['type', 'text', 'options', 'correctAnswer'],
  },
};

function buildPrompt(req: GenerateRequest): string {
  const typeInstruction =
    req.type === 'mixed'
      ? 'Produce a mix: roughly two thirds "mcq" and one third "open_text".'
      : req.type === 'mcq'
      ? 'Every question must be "mcq" with exactly 4 options and a correctAnswer copied verbatim from those options.'
      : 'Every question must be "open_text" with no options and no correctAnswer.';

  const difficultyGuide = {
    easy: 'Recall level. Definitions, names, direct facts stated plainly in the material.',
    medium: 'Comprehension and application. The student must connect two ideas or apply a rule to a short scenario.',
    hard: 'Analysis level. Trace consequences, compare approaches, or spot the flaw in a plausible-looking claim.',
  }[req.difficulty];

  const syllabusBlock = req.syllabus?.trim()
    ? `\nThe mentor pasted this syllabus / lesson material. Draw the questions from it specifically, and do not stray outside it:\n"""\n${req.syllabus.trim().slice(0, MAX_SYLLABUS_LENGTH)}\n"""\n`
    : '';

  return `You are helping a mentor build a live in-class quiz that will be projected to about 50 students answering on their phones.

Topic: ${req.topic.trim()}
${req.audience?.trim() ? `Class / level: ${req.audience.trim()}\n` : ''}Number of questions: ${req.count}
Difficulty: ${req.difficulty} — ${difficultyGuide}
${typeInstruction}
${syllabusBlock}
Requirements:
- Every question must be factually correct and unambiguous. One and only one option may be defensible as correct.
- Keep question text under 140 characters; it has to be readable from the back of a classroom.
- Keep each option under 60 characters.
- Distractors must be plausible to someone who half-remembers the material. No joke options, no "all of the above", no "none of the above".
- Do not number the questions or prefix options with A/B/C/D — the app adds those.
- Vary what you ask about across the set; do not ask the same fact twice in different words.
- For open_text, ask something with a short answer a student can type on a phone in under 30 seconds.

Return only the JSON array.`;
}

async function callGemini(model: string, prompt: string): Promise<unknown[] | null> {
  let lastStatus = 500;
  const geminiKeys = getGeminiKeys();
  if (geminiKeys.length === 0) return [];

  for (let attempt = 0; attempt < geminiKeys.length; attempt++) {
    const activeKey = geminiKeys[currentKeyIndex % geminiKeys.length];
    if (!activeKey) return [];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': activeKey,
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.85,
              maxOutputTokens: 4096,
              responseMimeType: 'application/json',
              responseSchema: RESPONSE_SCHEMA,
            },
          }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        lastStatus = response.status;
        const detail = await response.text().catch(() => '');
        console.warn(`[ai] Key ${(currentKeyIndex % geminiKeys.length) + 1} (${model}) responded ${response.status}: ${detail.slice(0, 300)}`);
        
        if (response.status === 404) return null; // Model not found, let it fallback

        currentKeyIndex = (currentKeyIndex + 1) % geminiKeys.length;
        continue;
      }

      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };

      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      if (!rawText.trim()) return [];

      const parsed: unknown = JSON.parse(rawText);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      if ((err as Error).name === 'AbortError') console.warn(`[ai] Key ${(currentKeyIndex % geminiKeys.length) + 1} request timed out`);
      else console.warn(`[ai] Key ${(currentKeyIndex % geminiKeys.length) + 1} request failed:`, (err as Error).message);
      
      currentKeyIndex = (currentKeyIndex + 1) % geminiKeys.length;
    } finally {
      clearTimeout(timeout);
    }
  }

  return lastStatus === 404 ? null : [];
}

async function callGroq(model: string, prompt: string): Promise<unknown[] | null> {
  let lastStatus = 500;
  const groqKeys = getGroqKeys();
  if (groqKeys.length === 0) return [];

  for (let attempt = 0; attempt < groqKeys.length; attempt++) {
    const activeKey = groqKeys[currentGroqKeyIndex % groqKeys.length];
    if (!activeKey) return [];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const groqPrompt = prompt + '\n\nIMPORTANT: Output ONLY a raw JSON array. Do not wrap in markdown ```json or include any conversational text. Just the array bracket [ to start and ] to end.';
      
      const response = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeKey}`,
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: groqPrompt }],
            temperature: 0.7,
            max_tokens: 4096,
          }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        lastStatus = response.status;
        const detail = await response.text().catch(() => '');
        console.warn(`[ai] Groq Key ${(currentGroqKeyIndex % groqKeys.length) + 1} (${model}) responded ${response.status}: ${detail.slice(0, 300)}`);
        
        if (response.status === 404) return null;

        currentGroqKeyIndex = (currentGroqKeyIndex + 1) % groqKeys.length;
        continue;
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      let rawText = data.choices?.[0]?.message?.content ?? '';
      console.log('[ai] Groq raw response sample:', rawText.slice(0, 200));
      rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      
      const arrayStart = rawText.indexOf('[');
      const arrayEnd = rawText.lastIndexOf(']');
      if (arrayStart >= 0 && arrayEnd >= arrayStart) {
        rawText = rawText.substring(arrayStart, arrayEnd + 1);
      }

      if (!rawText) return [];

      const parsed: unknown = JSON.parse(rawText);
      console.log('[ai] Groq parsed item 0:', Array.isArray(parsed) ? parsed[0] : 'not array');
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      if ((err as Error).name === 'AbortError') console.warn(`[ai] Groq Key ${(currentGroqKeyIndex % groqKeys.length) + 1} request timed out`);
      else console.warn(`[ai] Groq Key ${(currentGroqKeyIndex % groqKeys.length) + 1} request failed:`, (err as Error).message);
      
      currentGroqKeyIndex = (currentGroqKeyIndex + 1) % groqKeys.length;
    } finally {
      clearTimeout(timeout);
    }
  }

  return lastStatus === 404 ? null : [];
}

// ─── Normalisation ────────────────────────────────────────────────────────────

/** Keeps the answer key from always landing in the same slot. */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function stripLabel(value: string): string {
  return value.trim().replace(/^\(?[A-Fa-f][).:]\s+/, '').trim();
}

/**
 * A model that returns a correctAnswer not present in its own options would
 * create a question no student can get right, so those are dropped entirely.
 */
function normalizeQuestions(raw: unknown[], timeLimitSeconds: number, limit: number): Question[] {
  const questions: Question[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;

    const text = String(record.text ?? record.question ?? '').trim().slice(0, 300);
    if (!text) continue;

    const fingerprint = text.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);

    if (record.type === 'open_text') {
      questions.push({ id: uuidv4(), type: 'open_text', text, timeLimitSeconds });
      if (questions.length >= limit) break;
      continue;
    }

    const options = (Array.isArray(record.options) ? record.options : [])
      .map((o) => stripLabel(String(o)).slice(0, 120))
      .filter(Boolean);

    const unique = Array.from(new Set(options));
    if (unique.length < 2) continue;

    const rawKey = stripLabel(String(record.correctAnswer ?? record.answer ?? ''));
    // Find matching option (case-insensitive fallback)
    const matchingOption = unique.find(o => o.toLowerCase() === rawKey.toLowerCase()) ?? (unique.includes(rawKey) ? rawKey : null);
    if (!matchingOption) {
      console.warn(`[ai] Question skipped - correctAnswer "${rawKey}" not found in options:`, unique);
      continue;
    }

    questions.push({
      id: uuidv4(),
      type: 'mcq',
      text,
      options: shuffle(unique.slice(0, 6)),
      correctAnswer: matchingOption,
      timeLimitSeconds,
    });

    if (questions.length >= limit) break;
  }

  return questions;
}

// ─── Built-in question bank (used only when no API key is configured) ────────

interface BankTopic {
  keywords: string[];
  questions: Array<{ text: string; options: string[]; correctAnswer: string; openPrompt: string }>;
}

const QUESTION_BANK: BankTopic[] = [
  {
    keywords: ['javascript', 'js', 'typescript', 'react', 'web', 'frontend', 'html', 'css'],
    questions: [
      { text: 'What does the === operator compare in JavaScript?', options: ['Value only', 'Value and type', 'Reference only', 'Type only'], correctAnswer: 'Value and type', openPrompt: 'In your own words, what is a closure?' },
      { text: 'Which React hook runs code after a component renders?', options: ['useState', 'useEffect', 'useMemo', 'useRef'], correctAnswer: 'useEffect', openPrompt: 'When would you reach for useMemo?' },
      { text: 'What does typeof NaN return?', options: ['"number"', '"NaN"', '"undefined"', '"object"'], correctAnswer: '"number"', openPrompt: 'Describe the difference between null and undefined.' },
      { text: 'Which HTTP status code means "Not Found"?', options: ['200', '301', '404', '500'], correctAnswer: '404', openPrompt: 'What does a 500 status tell you as a developer?' },
      { text: 'What does the CSS box-sizing: border-box setting do?', options: ['Includes padding and border in the width', 'Removes all margins', 'Centres the element', 'Adds a visible border'], correctAnswer: 'Includes padding and border in the width', openPrompt: 'Explain the difference between flexbox and grid.' },
    ],
  },
  {
    keywords: ['operating system', 'os', 'process', 'thread', 'memory', 'scheduling', 'kernel'],
    questions: [
      { text: 'What is a deadlock in an operating system?', options: ['Processes each waiting on a resource another holds', 'A process using too much CPU', 'A crashed kernel', 'A full disk'], correctAnswer: 'Processes each waiting on a resource another holds', openPrompt: 'Name one condition required for deadlock and how to break it.' },
      { text: 'Which scheduling algorithm can cause starvation of long jobs?', options: ['Shortest Job First', 'Round Robin', 'First Come First Served', 'FIFO'], correctAnswer: 'Shortest Job First', openPrompt: 'Why does Round Robin need a well-chosen time quantum?' },
      { text: 'What is thrashing?', options: ['Excessive paging with little real work done', 'A disk hardware fault', 'Too many open files', 'A network collision'], correctAnswer: 'Excessive paging with little real work done', openPrompt: 'What is the difference between a process and a thread?' },
      { text: 'What does a semaphore primarily provide?', options: ['Controlled access to shared resources', 'Faster disk reads', 'Memory compression', 'Process priority'], correctAnswer: 'Controlled access to shared resources', openPrompt: 'Explain virtual memory in one or two sentences.' },
    ],
  },
  {
    keywords: ['data structure', 'algorithm', 'array', 'tree', 'graph', 'sorting', 'complexity', 'dsa'],
    questions: [
      { text: 'What is the average time complexity of binary search?', options: ['O(log n)', 'O(n)', 'O(n log n)', 'O(1)'], correctAnswer: 'O(log n)', openPrompt: 'Why must a list be sorted before binary search works?' },
      { text: 'Which data structure works first-in, first-out?', options: ['Queue', 'Stack', 'Heap', 'Binary tree'], correctAnswer: 'Queue', openPrompt: 'Give a real situation where you would use a stack.' },
      { text: 'What is the worst-case time complexity of quicksort?', options: ['O(n²)', 'O(n log n)', 'O(log n)', 'O(n)'], correctAnswer: 'O(n²)', openPrompt: 'How does choosing a pivot affect quicksort?' },
      { text: 'What is the average lookup time in a well-sized hash table?', options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'], correctAnswer: 'O(1)', openPrompt: 'What is a hash collision and how is it handled?' },
    ],
  },
  {
    keywords: ['python', 'programming basics', 'coding'],
    questions: [
      { text: 'Which Python type is immutable?', options: ['tuple', 'list', 'dict', 'set'], correctAnswer: 'tuple', openPrompt: 'Why does mutability matter when passing arguments?' },
      { text: 'What does the len() function return for "hello"?', options: ['5', '4', '6', 'Error'], correctAnswer: '5', openPrompt: 'Explain what a list comprehension does.' },
      { text: 'What does Python\'s __init__ method do?', options: ['Initialises a new object', 'Deletes an object', 'Imports a module', 'Starts the interpreter'], correctAnswer: 'Initialises a new object', openPrompt: 'What is the difference between a list and a dictionary?' },
      { text: 'Which keyword defines a function in Python?', options: ['def', 'function', 'fn', 'define'], correctAnswer: 'def', openPrompt: 'What does it mean that Python is dynamically typed?' },
    ],
  },
  {
    keywords: ['science', 'physics', 'biology', 'chemistry', 'space', 'nature'],
    questions: [
      { text: 'Which planet is closest to the Sun?', options: ['Mercury', 'Venus', 'Mars', 'Earth'], correctAnswer: 'Mercury', openPrompt: 'What scientific discovery changed the world most?' },
      { text: 'Which organelle produces most of a cell\'s ATP?', options: ['Mitochondria', 'Ribosome', 'Nucleus', 'Golgi body'], correctAnswer: 'Mitochondria', openPrompt: 'Explain photosynthesis in one sentence.' },
      { text: 'What is the chemical symbol for iron?', options: ['Fe', 'Ir', 'In', 'Fr'], correctAnswer: 'Fe', openPrompt: 'Why is water called the universal solvent?' },
      { text: 'Roughly how many bones are in an adult human body?', options: ['206', '186', '226', '246'], correctAnswer: '206', openPrompt: 'What habit most improves long-term health, and why?' },
    ],
  },
];

function buildBankQuestions(req: GenerateRequest): Question[] {
  const needle = `${req.topic} ${req.syllabus ?? ''}`.toLowerCase();
  const matched = QUESTION_BANK.find((entry) => entry.keywords.some((k) => needle.includes(k)));
  if (!matched) return [];

  const questions: Question[] = [];
  const pool = shuffle(matched.questions);

  for (let i = 0; i < Math.min(req.count, pool.length); i++) {
    const item = pool[i];
    const wantMcq = req.type === 'mcq' ? true : req.type === 'open_text' ? false : i % 3 !== 2;

    questions.push(
      wantMcq
        ? {
            id: uuidv4(),
            type: 'mcq',
            text: item.text,
            options: shuffle(item.options),
            correctAnswer: item.correctAnswer,
            timeLimitSeconds: req.timeLimitSeconds,
          }
        : {
            id: uuidv4(),
            type: 'open_text',
            text: item.openPrompt,
            timeLimitSeconds: Math.max(req.timeLimitSeconds, 45),
          }
    );
  }

  return questions;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function handleGenerateQuestions(req: Request, res: Response): Promise<void> {
  const body = req.body as Partial<GenerateRequest>;

  const topic = String(body?.topic ?? '').trim().slice(0, MAX_TOPIC_LENGTH);
  const syllabus = String(body?.syllabus ?? '').trim().slice(0, MAX_SYLLABUS_LENGTH);

  if (!topic && !syllabus) {
    res.status(400).json({ error: 'Enter a topic or paste some syllabus text.' });
    return;
  }

  const request: GenerateRequest = {
    topic: topic || 'the pasted syllabus material',
    syllabus,
    count: Math.min(MAX_COUNT, Math.max(1, Math.round(Number(body?.count) || 5))),
    difficulty: ['easy', 'medium', 'hard'].includes(String(body?.difficulty))
      ? (body!.difficulty as GenerateRequest['difficulty'])
      : 'medium',
    type: ['mcq', 'open_text', 'mixed'].includes(String(body?.type))
      ? (body!.type as GenerateRequest['type'])
      : 'mcq',
    timeLimitSeconds: Math.min(120, Math.max(10, Math.round(Number(body?.timeLimitSeconds) || 30))),
    audience: String(body?.audience ?? '').trim().slice(0, 120),
  };

  if (hasApiKey()) {
    const prompt = buildPrompt(request);

    let raw: unknown[] | null = null;
    let usedModel = '';

    const gemini = getGeminiKeys();
    const groq = getGroqKeys();
    console.log(`[ai] Starting generation: ${gemini.length} Gemini keys, ${groq.length} Groq keys available`);

    if (gemini.length > 0) {
      raw = await callGemini(GEMINI_MODEL, prompt);
      usedModel = GEMINI_MODEL;
      if (raw === null) {
        console.warn(`[ai] model "${GEMINI_MODEL}" not found, retrying with ${FALLBACK_MODEL}`);
        raw = await callGemini(FALLBACK_MODEL, prompt);
        usedModel = FALLBACK_MODEL;
      }
    }

    console.log(`[ai] After Gemini attempt, raw length: ${raw?.length ?? 'null'}`);

    if ((!raw || raw.length === 0) && groq.length > 0) {
      console.log(`[ai] Falling back to Groq model ${GROQ_MODEL}...`);
      raw = await callGroq(GROQ_MODEL, prompt);
      usedModel = GROQ_MODEL;
      if (raw === null) {
        console.warn(`[ai] model "${GROQ_MODEL}" not found, retrying with llama-3.1-70b-versatile`);
        raw = await callGroq('llama-3.1-70b-versatile', prompt);
        usedModel = 'llama-3.1-70b-versatile';
      }
    }

    console.log(`[ai] Final raw result length: ${raw?.length ?? 'null'}, model: ${usedModel}`);

    const questions = normalizeQuestions(raw ?? [], request.timeLimitSeconds, request.count);

    if (questions.length > 0) {
      res.json({ questions, source: 'ai', model: usedModel });
      return;
    }

    res.status(502).json({
      error:
        'The AI service did not return usable questions. Check the server log, then try again or add questions manually.',
      source: 'ai',
    });
    return;
  }

  // No key configured. Serve the bank only when it genuinely covers the topic,
  // and say plainly where the questions came from.
  const bank = buildBankQuestions(request);

  if (bank.length === 0) {
    res.status(503).json({
      error: `AI generation is off — no GEMINI_API_KEY in server/.env — and the built-in bank has nothing on "${request.topic}". Add a key, or add questions manually below.`,
      source: 'unavailable',
    });
    return;
  }

  res.json({
    questions: bank,
    source: 'question-bank',
    notice: `These came from the built-in question bank, not AI. Add GEMINI_API_KEY to server/.env to generate questions on any topic.`,
  });
}
