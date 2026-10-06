import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Question } from '../../types';
import QuestionForm from '../../components/QuestionForm';
import AIGenerateModal from '../../components/AIGenerateModal';
import { apiUrl } from '../../api';
import { cleanText } from '../../cleanText';
import {
  getAuthUser,
  getAuthToken,
  clearStoredAuth,
  AuthUser,
  fetchBatches,
  fetchBatchObjects,
  BatchObject,
  createMentorBatch,
  refreshAuthUser,
  isFacultyEmail,
  fetchSubjects,
  updateMentorProfile,
  createQuizDraft,
  updateQuizDraft,
} from '../../auth';
import CollegeAuthModal from '../../components/CollegeAuthModal';
import MentorPinModal from '../../components/MentorPinModal';
import MentorQuizHistoryModal from '../../components/MentorQuizHistoryModal';
import QuizLibrary from '../../components/QuizLibrary';
import BatchPicker from '../../components/BatchPicker';
import { getActiveTheme, toggleTheme, Theme } from '../../theme';
import { setStoredHost } from './hostSession';

export interface QuizSetupScreenProps {
  onSessionStarted?: (session: { code: string; hostId: string }) => void;
}

/**
 * Crash / reload recovery for the quiz builder.
 *
 * Questions live in React state until the mentor clicks "Save as draft", so a
 * refresh, a closed tab, a phone call on a laptop, or a Render cold-start
 * redirect used to throw away a whole AI-generated paper. Generating 10
 * questions takes real time and real API quota, and the mentor has no way to
 * get the exact set back. The builder now snapshots itself to localStorage on
 * every change and restores on load, so saving a draft is a deliberate act of
 * publishing to the library rather than the only thing standing between the
 * mentor and losing their work.
 *
 * Keyed per mentor: shared lab machines are the norm here, and one mentor
 * inheriting another's half-built paper would be worse than losing it.
 */
const AUTOSAVE_VERSION = 1;

interface BuilderSnapshot {
  v: number;
  questions: Question[];
  quizSubject?: string;
  aiInitialTopic?: string;
  quizBatchId?: string;
  quizBatch?: string;
  editingDraftId?: string | null;
  editingDraftTitle?: string | null;
  savedAt: number;
}

const autosaveKey = (email?: string | null) =>
  `pollsync_builder_autosave:${(email || 'anon').toLowerCase().trim()}`;

function readBuilderSnapshot(email?: string | null): BuilderSnapshot | null {
  try {
    const raw = localStorage.getItem(autosaveKey(email));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BuilderSnapshot;
    // A version bump means the shape changed; drop rather than guess.
    if (parsed?.v !== AUTOSAVE_VERSION) return null;
    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) return null;
    return parsed;
  } catch {
    // Quota-full, private-mode, or hand-edited JSON. Recovery is a nicety —
    // never let it take the builder down with it.
    return null;
  }
}

function writeBuilderSnapshot(email: string | null | undefined, snapshot: Omit<BuilderSnapshot, 'v' | 'savedAt'>) {
  try {
    if (!snapshot.questions || snapshot.questions.length === 0) {
      localStorage.removeItem(autosaveKey(email));
      return;
    }
    localStorage.setItem(
      autosaveKey(email),
      JSON.stringify({ ...snapshot, v: AUTOSAVE_VERSION, savedAt: Date.now() })
    );
  } catch {
    /* see readBuilderSnapshot */
  }
}

function clearBuilderSnapshot(email?: string | null) {
  try {
    localStorage.removeItem(autosaveKey(email));
  } catch {
    /* see readBuilderSnapshot */
  }
}

export default function QuizSetupScreen(props: QuizSetupScreenProps) {
  const navigate = useNavigate();

  /**
   * Read before any state initializer below, so the restored values are present
   * on the very first render. Doing this in an effect instead would let the
   * autosave writer fire once with an empty builder and delete the snapshot it
   * was about to read.
   */
  const bootSnapshotRef = useRef<BuilderSnapshot | null | undefined>(undefined);
  if (bootSnapshotRef.current === undefined) {
    bootSnapshotRef.current = readBuilderSnapshot(getAuthUser()?.email);
  }
  const boot = bootSnapshotRef.current;

  const [questions, setQuestions] = useState<Question[]>(() => boot?.questions ?? []);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAI, setShowAI] = useState(false);
  const [aiInitialTopic, setAiInitialTopic] = useState(() => boot?.aiInitialTopic ?? '');
  const [quizSubject, setQuizSubject] = useState(() => boot?.quizSubject || getAuthUser()?.subject || '');
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([]);
  const [showProfileSubjectPrompt, setShowProfileSubjectPrompt] = useState(() => {
    try {
      return sessionStorage.getItem('pollmeter_dismissed_subject_prompt') !== 'true';
    } catch {
      return true;
    }
  });
  const [savingProfileSubject, setSavingProfileSubject] = useState(false);
  const [profileSubjectError, setProfileSubjectError] = useState('');
  const [showProfileNewSubjectInput, setShowProfileNewSubjectInput] = useState(false);
  const [profileNewSubjectText, setProfileNewSubjectText] = useState('');
  const [showBuilderNewSubject, setShowBuilderNewSubject] = useState(false);
  const [builderNewSubjectName, setBuilderNewSubjectName] = useState('');
  const [quizBatch, setQuizBatch] = useState(() => boot?.quizBatch ?? '');
  const [quizBatchId, setQuizBatchId] = useState(() => boot?.quizBatchId ?? '');
  const [availableBatches, setAvailableBatches] = useState<string[]>([]);
  const [availableBatchObjects, setAvailableBatchObjects] = useState<BatchObject[]>([]);
  const [showNewBatchInput, setShowNewBatchInput] = useState(false);
  const [newBatchName, setNewBatchName] = useState('');
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [batchError, setBatchError] = useState('');
  const [activeNav, setActiveNav] = useState('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [editing, setEditing] = useState<Question | null>(null);
  const builderRef = useRef<HTMLDivElement>(null);
  const mainPanelRef = useRef<HTMLDivElement>(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [hostTheme, setHostTheme] = useState<Theme>(getActiveTheme());

  // Keep data-theme attribute synchronized on document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', hostTheme);
  }, [hostTheme]);
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => getAuthUser());
  const [showAuthModal, setShowAuthModal] = useState(() => !getAuthUser());
  const [showPinModal, setShowPinModal] = useState(() => {
    const u = getAuthUser();
    return Boolean(u && !isFacultyEmail(u.email) && u.role !== 'mentor' && u.role !== 'admin');
  });
  const [hostView, setHostView] = useState<'builder' | 'library' | 'reports'>('builder');
  const [editingDraftId, setEditingDraftId] = useState<string | null>(() => boot?.editingDraftId ?? null);
  const [editingDraftTitle, setEditingDraftTitle] = useState<string | null>(() => boot?.editingDraftTitle ?? null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSavedToast, setDraftSavedToast] = useState<{ message: string; draftId: string } | null>(null);

  /**
   * Shown when the builder came back from a snapshot rather than empty, so the
   * mentor understands why there is already work on screen — and can throw it
   * away in one click if they wanted a blank page.
   */
  const [recoveredAt, setRecoveredAt] = useState<number | null>(() => (boot ? boot.savedAt : null));

  const [batchesLoading, setBatchesLoading] = useState(false);

  // ─── Autosave ─────────────────────────────────────────────────────────────
  // Writes on every builder change. `questions.length === 0` removes the key,
  // so emptying the builder or clicking "Clear all" needs no special handling.
  useEffect(() => {
    writeBuilderSnapshot(authUser?.email, {
      questions,
      quizSubject,
      aiInitialTopic,
      quizBatchId,
      quizBatch,
      editingDraftId,
      editingDraftTitle,
    });
    // Once signed in, drop the anonymous key: on a shared staff laptop it would
    // otherwise keep offering this paper to whoever opens the builder next.
    if (authUser?.email) clearBuilderSnapshot(null);
  }, [
    questions,
    quizSubject,
    aiInitialTopic,
    quizBatchId,
    quizBatch,
    editingDraftId,
    editingDraftTitle,
    authUser?.email,
  ]);

  // Covers the one case the boot-time read cannot: the mentor was signed out
  // when the page mounted (so we looked under the anonymous key) and signed in
  // afterwards through the modal. Deliberately keyed on email alone — adding
  // `questions` to the deps would re-run it mid-edit — and it bails the moment
  // there is anything on screen, so it can never overwrite live work.
  useEffect(() => {
    if (!authUser?.email || questions.length > 0) return;
    const late = readBuilderSnapshot(authUser.email);
    if (!late) return;
    setQuestions(late.questions);
    if (late.quizSubject) setQuizSubject(late.quizSubject);
    if (late.aiInitialTopic) setAiInitialTopic(late.aiInitialTopic);
    if (late.quizBatchId) setQuizBatchId(late.quizBatchId);
    if (late.quizBatch) setQuizBatch(late.quizBatch);
    setEditingDraftId(late.editingDraftId ?? null);
    setEditingDraftTitle(late.editingDraftTitle ?? null);
    setRecoveredAt(late.savedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.email]);

  // A restored batch the mentor no longer holds — reassigned, or the batch was
  // deactivated. Left selected it would render as a blank dropdown and then
  // 403 on start, so drop it and make them re-pick.
  useEffect(() => {
    if (!quizBatchId || availableBatchObjects.length === 0) return;
    if (!availableBatchObjects.some((b) => b.id === quizBatchId)) {
      setQuizBatchId('');
      setQuizBatch('');
    }
  }, [availableBatchObjects, quizBatchId]);

  function discardRecovered() {
    setQuestions([]);
    setEditingDraftId(null);
    setEditingDraftTitle(null);
    setRecoveredAt(null);
    clearBuilderSnapshot(authUser?.email);
  }
  // ─── End autosave ─────────────────────────────────────────────────────────

  // Fetch college batches dynamically with role & assignment awareness (Gap 4)
  const loadBatches = useCallback(() => {
    setBatchesLoading(true);
    fetchBatchObjects()
      .then((objs) => {
        setAvailableBatchObjects(objs || []);
        setAvailableBatches((objs || []).map((o) => o.displayName));
        if (objs && objs.length > 0) {
          setShowNewBatchInput(false);
          setQuizBatchId((prev) => (prev && objs.some((b) => b.id === prev) ? prev : objs[0].id));
          setQuizBatch((prev) => (prev && objs.some((b) => b.displayName === prev) ? prev : objs[0].displayName));
        } else {
          setQuizBatchId('');
          setQuizBatch('');
          setShowNewBatchInput(false);
        }
      })
      .catch(() => {
        setAvailableBatchObjects([]);
        setAvailableBatches([]);
        setShowNewBatchInput(false);
      })
      .finally(() => {
        setBatchesLoading(false);
      });
  }, []);

  // Load campus subjects dynamically
  const loadSubjects = useCallback(() => {
    fetchSubjects()
      .then((subs) => {
        if (subs && subs.length > 0) setAvailableSubjects(subs);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadBatches();
    loadSubjects();
  }, [authUser, loadBatches, loadSubjects]);

  // Handler: save primary subject to mentor profile
  const handleSaveProfileSubject = async (subj: string) => {
    const trimmed = subj.trim();
    if (!trimmed) {
      setProfileSubjectError('Please select or enter a subject.');
      return;
    }
    setSavingProfileSubject(true);
    setProfileSubjectError('');
    try {
      const res = await updateMentorProfile({ subject: trimmed });
      if (res?.user) setAuthUser(res.user);
      setQuizSubject(trimmed);
      setAvailableSubjects((prev) => {
        if (!prev.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
          return [trimmed, ...prev].sort((a, b) => a.localeCompare(b));
        }
        return prev;
      });
      setShowProfileSubjectPrompt(false);
      setShowProfileNewSubjectInput(false);
      setProfileNewSubjectText('');
      try { sessionStorage.removeItem('pollmeter_dismissed_subject_prompt'); } catch {}
    } catch (err: any) {
      setProfileSubjectError(err.message || 'Failed to update mentor profile subject.');
    } finally {
      setSavingProfileSubject(false);
    }
  };

  // Handler: add a subject from within the quiz builder
  const handleAddBuilderSubject = () => {
    const trimmed = builderNewSubjectName.trim();
    if (!trimmed) return;
    setQuizSubject(trimmed);
    setAvailableSubjects((prev) => {
      if (!prev.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
        return [trimmed, ...prev].sort((a, b) => a.localeCompare(b));
      }
      return prev;
    });
    // If mentor doesn't have a profile subject yet, set it automatically
    if (authUser && !authUser.subject) {
      updateMentorProfile({ subject: trimmed })
        .then((res) => { if (res?.user) setAuthUser(res.user); })
        .catch(() => {});
    }
    setShowBuilderNewSubject(false);
    setBuilderNewSubjectName('');
  };

  // Handler: create a new batch inline
  const handleCreateBatch = async () => {
    const name = newBatchName.trim();
    if (!name) { setBatchError('Please enter a batch name.'); return; }
    if (name.length > 100) { setBatchError('Name must be 100 characters or fewer.'); return; }
    setCreatingBatch(true);
    setBatchError('');
    try {
      const created = await createMentorBatch(name);
      setAvailableBatchObjects((prev) => {
        const filtered = prev.filter((b) => b.id !== created.id && b.displayName !== created.displayName);
        const updated = [...filtered, created];
        return updated.sort((a, b) => a.displayName.localeCompare(b.displayName));
      });
      setAvailableBatches((prev) => {
        const filtered = prev.filter((b) => b !== created.displayName);
        const updated = [...filtered, created.displayName];
        return updated.sort();
      });
      setQuizBatchId(created.id);
      setQuizBatch(created.displayName);
      setNewBatchName('');
      setShowNewBatchInput(false);
    } catch (err: any) {
      setBatchError(err.message || 'Failed to create batch.');
    } finally {
      setCreatingBatch(false);
    }
  };

  // Ask the server what this account may actually do. Goes through
  // `refreshAuthUser` so a re-issued token (an approval or a revocation since
  // this one was minted) replaces the stored one — the inline fetch this
  // replaced kept writing the old token back alongside the new role.
  useEffect(() => {
    refreshAuthUser()
      .then((synced) => {
        if (synced) {
          setAuthUser(synced);
          if (synced.role === 'mentor' || synced.role === 'admin') {
            setShowPinModal(false);
          }
          if (synced.subject && !quizSubject) {
            setQuizSubject(synced.subject);
          }
        }
      })
      .catch(() => {});
  }, []);

  function addQuestions(qs: Question[]) {
    setQuestions((prev) => [...prev, ...qs]);
  }

  function saveQuestion(q: Question) {
    setQuestions((prev) => {
      const idx = prev.findIndex((p) => p.id === q.id);
      if (idx === -1) return [...prev, q];
      const next = [...prev];
      next[idx] = q;
      return next;
    });
    setEditing(null);
  }

  function removeQuestion(id: string) {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    setEditing((prev) => (prev?.id === id ? null : prev));
  }

  function moveQuestion(id: string, delta: number) {
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q.id === id);
      const target = idx + delta;
      if (idx === -1 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  async function createSession() {
    setError('');
    if (!authUser) {
      setShowAuthModal(true);
      return;
    }
    if (authUser.role !== 'mentor' && authUser.role !== 'admin') {
      setShowPinModal(true);
      return;
    }
    if (questions.length === 0) {
      setError('Add at least one question.');
      return;
    }

    if (!quizBatchId) {
      setError('Please select or create a batch before starting the session.');
      return;
    }

    setLoading(true);

    try {
      const token = getAuthToken();
      if (!token) {
        setLoading(false);
        setShowAuthModal(true);
        return;
      }
      const topic = aiInitialTopic || (questions[0]?.text ? `Quiz: ${questions[0].text.slice(0, 40)}...` : 'Classroom Quiz');

      // No `hostEmail` / `hostName` in the body: the server takes the host
      // identity from this token and ignores anything the client claims.
      // Sending them anyway would suggest they still carry weight, and the
      // whole point of per-mentor report isolation is that they must not.
      const res = await fetch(apiUrl('/api/sessions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          questions,
          topic,
          subject: quizSubject || 'General',
          batchId: quizBatchId,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        if (res.status === 403 || res.status === 401) {
          const synced = await refreshAuthUser();
          if (synced && (synced.role === 'mentor' || synced.role === 'admin' || isFacultyEmail(synced.email))) {
            setAuthUser(synced);
            const freshToken = getAuthToken();
            if (freshToken) {
              const retryRes = await fetch(apiUrl('/api/sessions'), {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${freshToken}`,
                },
                body: JSON.stringify({
                  questions,
                  topic,
                  subject: quizSubject || 'General',
                  batchId: quizBatchId,
                }),
              });
              if (retryRes.ok) {
                const retryData = await retryRes.json();
                clearBuilderSnapshot(authUser?.email);
                setStoredHost({ code: retryData.code, hostId: retryData.hostId });
                if (props.onSessionStarted) {
                  props.onSessionStarted({ code: retryData.code, hostId: retryData.hostId });
                } else {
                  navigate('/dashboard/live/' + retryData.code);
                }
                return;
              }
            }
          }
        }
        throw new Error(d.error ?? 'Could not create the session.');
      }

      // The paper is now a live session owned by the server; keeping the
      // recovery snapshot would re-seed the builder with it on the next visit.
      clearBuilderSnapshot(authUser?.email);
      setStoredHost({ code: d.code, hostId: d.hostId });
      if (props.onSessionStarted) {
        props.onSessionStarted({ code: d.code, hostId: d.hostId });
      } else {
        navigate('/dashboard/live/' + d.code);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not create the session.');
    } finally {
      setLoading(false);
    }
  }

  const handleSaveDraft = async () => {
    setError('');
    setDraftSavedToast(null);
    if (!authUser) {
      setShowAuthModal(true);
      return;
    }
    if (authUser.role !== 'mentor' && authUser.role !== 'admin') {
      setShowPinModal(true);
      return;
    }
    if (questions.length === 0) {
      setError('Add at least one question before saving as draft.');
      return;
    }

    setSavingDraft(true);
    try {
      const title = aiInitialTopic.trim() || (questions[0]?.text ? `Quiz: ${questions[0].text.slice(0, 40)}...` : 'Classroom Quiz');
      const subject = quizSubject || 'General';

      if (editingDraftId) {
        const updated = await updateQuizDraft(editingDraftId, {
          title,
          subject,
          questions,
        });
        setEditingDraftTitle(updated.title);
        setDraftSavedToast({ message: `Draft "${updated.title}" updated successfully.`, draftId: updated.id });
      } else {
        const created = await createQuizDraft({
          title,
          subject,
          questions,
        });
        setEditingDraftId(created.id);
        setEditingDraftTitle(created.title);
        setDraftSavedToast({ message: `Draft "${created.title}" saved to your library!`, draftId: created.id });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save draft.');
    } finally {
      setSavingDraft(false);
    }
  };

  const launchSessionFromDraft = async (draftId: string, batchId: string, batchName: string) => {
    setError('');
    setLoading(true);
    try {
      const token = getAuthToken();
      if (!token) {
        setShowAuthModal(true);
        throw new Error('Authentication required');
      }

      const res = await fetch(apiUrl('/api/sessions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          draftId,
          batchId,
        }),
      });

      const d = await res.json();
      if (!res.ok) {
        throw new Error(d.error || 'Failed to start live session.');
      }

      clearBuilderSnapshot(authUser?.email);
      setStoredHost({ code: d.code, hostId: d.hostId });
      if (props.onSessionStarted) {
        props.onSessionStarted({ code: d.code, hostId: d.hostId });
      } else {
        navigate('/dashboard/live/' + d.code);
      }
    } finally {
      setLoading(false);
    }
  };

  function scrollToBuilder() {
    builderRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  function openWithTopic(topicPrompt: string) {
    setAiInitialTopic(topicPrompt);
    setShowAI(true);
  }

  function startNewScored() {
    setEditing(null);
    scrollToBuilder();
  }

  function startNewPoll() {
    setEditing({
      id: '',
      type: 'mcq',
      text: '',
      options: ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
      timeLimitSeconds: 20,
    });
    scrollToBuilder();
  }

  return (
    <div className="menti-app-shell">
      <CollegeAuthModal
        isOpen={showAuthModal || !authUser}
        title="Pollmeter Faculty &amp; Mentor Portal"
        subtitle="Sign in with your official faculty email ID to host quizzes and manage students"
        onSuccess={(user) => {
          setAuthUser(user);
          setShowAuthModal(false);
          loadBatches();
          loadSubjects();
          if (user.role !== 'mentor' && user.role !== 'admin') {
            setShowPinModal(true);
          }
        }}
        onClose={() => {
          if (authUser) {
            setShowAuthModal(false);
          } else {
            navigate('/');
          }
        }}
        roleHint="mentor"
      />

      <MentorPinModal
        isOpen={showPinModal}
        currentUser={authUser}
        onSuccess={(updated) => {
          setAuthUser(updated);
          setShowPinModal(false);
          loadBatches();
          loadSubjects();
        }}
        onCancel={() => {
          setShowPinModal(false);
        }}
      />


      <aside className={`menti-sidebar pm-admin-sidebar ${mobileSidebarOpen ? 'open' : ''}`}>
        <div>
          {/* Brand Crest */}
          <a href="/dashboard" className="menti-sidebar-brand" style={{ textDecoration: 'none' }}>
            <div className="pm-admin-sidebar-crest">
              <span style={{ fontSize: '1.15rem' }}>⚡</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, justifyContent: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: '1.18rem', letterSpacing: '-0.025em', color: 'var(--text-primary, #FFFFFF)', lineHeight: 1.15 }}>
                Pollmeter
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px' }}>
                <span className="pm-badge-host-sub">
                  <span className="pm-sub-badge-dot pm-sub-badge-dot-blue" />
                  Host Studio
                </span>
              </div>
            </div>
          </a>

          {/* Primary CTA: + New Quiz */}
          <button
            className="menti-btn-new pm-admin-sidebar-cta"
            onClick={() => {
              scrollToBuilder();
              setMobileSidebarOpen(false);
            }}
            id="new-menti-btn"
          >
            <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>+</span>
            <span>New quiz</span>
          </button>

          {/* Workspace Nav */}
          <nav className="menti-nav-group">
            <div className="menti-nav-title">WORKSPACE</div>
            <button
              className={`menti-nav-link ${hostView === 'builder' && activeNav === 'home' ? 'active' : ''}`}
              onClick={() => {
                setHostView('builder');
                setActiveNav('home');
                mainPanelRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                setMobileSidebarOpen(false);
              }}
            >
              <span>🏠</span> Home
            </button>
            <button
              className={`menti-nav-link ${hostView === 'builder' && activeNav === 'build' ? 'active' : ''}`}
              onClick={() => {
                setHostView('builder');
                setActiveNav('build');
                scrollToBuilder();
                setMobileSidebarOpen(false);
              }}
            >
              <span>📝</span> Question builder
            </button>
            <button
              className="menti-nav-link"
              onClick={() => {
                setHostView('builder');
                openWithTopic('');
                setMobileSidebarOpen(false);
              }}
            >
              <span>✨</span> Generate with AI
            </button>
            <button
              className={`menti-nav-link ${hostView === 'library' ? 'active' : ''}`}
              onClick={() => {
                setHostView('library');
                setMobileSidebarOpen(false);
              }}
              id="library-sidebar-btn"
            >
              <span>📚</span> My Quiz Library
            </button>
            <button
              className={`menti-nav-link ${hostView === 'reports' ? 'active' : ''}`}
              onClick={() => {
                setHostView('reports');
                setMobileSidebarOpen(false);
              }}
              id="past-quizzes-sidebar-btn"
            >
              <span>📊</span> Past Quizzes &amp; Reports
            </button>
          </nav>

          <div className="menti-nav-group">
            <div className="menti-nav-title">THIS QUIZ</div>
            <button
              className="menti-nav-link"
              onClick={() => {
                setHostView('builder');
                scrollToBuilder();
                setMobileSidebarOpen(false);
              }}
            >
              <span>📋</span> {questions.length} question{questions.length === 1 ? '' : 's'}
            </button>
            {questions.length > 0 && (
              <button className="menti-nav-link" onClick={() => setQuestions([])}>
                <span>🗑️</span> Clear all
              </button>
            )}
          </div>

          {authUser?.role === 'admin' && (
            <div className="menti-nav-group">
              <div className="menti-nav-title">CAMPUS SHORTCUTS</div>
              <a
                href="/admin"
                className="menti-nav-link"
                style={{ textDecoration: 'none' }}
                title="University Admin Console"
              >
                <span>🏛️</span>
                <span>Admin Console</span>
              </a>
            </div>
          )}
        </div>

        <div className="menti-sidebar-footer" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <button
            className="menti-nav-link"
            onClick={() => setHostTheme(toggleTheme())}
            title="Toggle Dark / Light Theme"
            id="host-theme-toggle-btn"
          >
            <span>{hostTheme === 'dark' ? '☀️' : '🌙'}</span>
            <span>{hostTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>

          {authUser && (
            <div className="pm-admin-sidebar-user">
              <div
                className="pm-admin-sidebar-user-avatar"
                style={{
                  background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
                  color: '#FFFFFF',
                }}
              >
                {authUser.realName.slice(0, 2).toUpperCase()}
              </div>
              <div className="pm-admin-sidebar-user-info">
                <span className="pm-admin-sidebar-user-name" title={authUser.realName}>
                  {authUser.realName}
                </span>
                <span className="pm-admin-sidebar-user-email" title={authUser.email}>
                  👨‍🏫 {authUser.role === 'admin' ? 'Super Admin' : 'MSU Faculty'}
                </span>
              </div>
              <button
                className="pm-admin-sidebar-signout"
                onClick={() => {
                  clearStoredAuth();
                  setAuthUser(null);
                  setShowAuthModal(true);
                }}
                title="Sign Out"
              >
                🚪
              </button>
            </div>
          )}
        </div>
      </aside>

      <div ref={mainPanelRef} className="menti-main-panel pm-admin-main-panel">
        <header className="menti-topbar pm-admin-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flex: 1, maxWidth: '440px' }}>
            <button
              className="pm-admin-mobile-toggle"
              onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
              title="Toggle Sidebar Navigation"
              type="button"
            >
              ☰
            </button>
            <div className="menti-search" style={{ flex: 1 }}>
              <span>🔍</span>
              <input
                type="text"
                placeholder="Search your questions"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="menti-topbar-actions">
            <button
              type="button"
              className={`btn btn--sm ${hostView === 'library' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setHostView(hostView === 'library' ? 'builder' : 'library')}
              id="topbar-quiz-library-btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <span>📚</span>
              <span>{hostView === 'library' ? '← Quiz Builder' : 'My Quiz Library'}</span>
            </button>

            <button
              type="button"
              className={`btn btn--sm ${hostView === 'reports' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setHostView(hostView === 'reports' ? 'builder' : 'reports')}
              id="topbar-past-quizzes-btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <span>📊</span>
              <span>{hostView === 'reports' ? '← Quiz Builder' : 'Past Quizzes & Reports'}</span>
            </button>

            <button
              className="pm-theme-toggle-btn"
              onClick={() => setHostTheme(toggleTheme())}
              title="Toggle Dark / Light Theme"
              id="topbar-theme-toggle-btn"
              type="button"
            >
              {hostTheme === 'dark' ? '☀️ Light' : '🌙 Dark'}
            </button>
            {authUser ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                {authUser.role === 'admin' && (
                  <a
                    href="/admin"
                    className="btn btn--sm"
                    style={{
                      background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                      color: '#09090B',
                      fontWeight: 700,
                      textDecoration: 'none',
                      borderRadius: '8px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    🏛️ Admin
                  </a>
                )}
                <span className="pm-auth-profile-badge">
                  🎓 {authUser.realName.split(' ')[0]} {authUser.role === 'admin' ? '(Admin)' : '(Faculty)'}
                </span>
                <button
                  type="button"
                  className="pm-auth-signout-btn"
                  onClick={() => {
                    clearStoredAuth();
                    setAuthUser(null);
                    setShowAuthModal(true);
                  }}
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn--sm"
                onClick={() => setShowAuthModal(true)}
              >
                Sign In with College ID
              </button>
            )}
          </div>
        </header>

        {showAI && (
          <AIGenerateModal
            onInsert={(qs) => {
              addQuestions(qs);
              setShowAI(false);
              setTimeout(scrollToBuilder, 200);
            }}
            onClose={() => setShowAI(false)}
            initialTopic={aiInitialTopic}
          />
        )}

        {showHowItWorks && (
          <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowHowItWorks(false)}>
            <div className="modal stack stack-5" role="dialog" aria-label="How PollMeter Works" style={{ maxWidth: '560px' }}>
              <div className="modal-header">
                <div className="stack stack-1">
                  <p className="t-title" style={{ fontSize: '1.35rem' }}>📖 How PollMeter Works</p>
                  <p className="t-body-sm text-secondary">3 simple steps to run a live interactive classroom quiz</p>
                </div>
                <button className="btn btn-ghost btn--icon" onClick={() => setShowHowItWorks(false)} aria-label="Close">✕</button>
              </div>

              <div className="stack stack-3" style={{ gap: '1rem' }}>
                <div className="row row-3" style={{ alignItems: 'flex-start', background: 'var(--surface-mid, #202024)', padding: '0.9rem 1.1rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '1.7rem', lineHeight: 1 }}>✨</span>
                  <div className="stack stack-1 flex-1">
                    <strong style={{ color: 'var(--text-primary, #F2F2F2)', fontSize: '0.95rem' }}>1. Build or Generate Quiz</strong>
                    <p className="t-body-sm text-secondary" style={{ margin: 0 }}>
                      Paste your syllabus/topics into <strong>Generate with AI</strong> or create custom MCQs with custom timers.
                    </p>
                  </div>
                </div>

                <div className="row row-3" style={{ alignItems: 'flex-start', background: 'var(--surface-mid, #202024)', padding: '0.9rem 1.1rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '1.7rem', lineHeight: 1 }}>📱</span>
                  <div className="stack stack-1 flex-1">
                    <strong style={{ color: 'var(--text-primary, #F2F2F2)', fontSize: '0.95rem' }}>2. Project &amp; Connect Students</strong>
                    <p className="t-body-sm text-secondary" style={{ margin: 0 }}>
                      Click <strong>&quot;Get the join code&quot;</strong> and full-screen on projector. Students scan QR code to join instantly (no app download needed).
                    </p>
                  </div>
                </div>

                <div className="row row-3" style={{ alignItems: 'flex-start', background: 'var(--surface-mid, #202024)', padding: '0.9rem 1.1rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '1.7rem', lineHeight: 1 }}>🏁</span>
                  <div className="stack stack-1 flex-1">
                    <strong style={{ color: 'var(--text-primary, #F2F2F2)', fontSize: '0.95rem' }}>3. Play, Race &amp; Review</strong>
                    <p className="t-body-sm text-secondary" style={{ margin: 0 }}>
                      Launch questions with speed bonus scoring. Watch scores surge on the <strong>60FPS racing leaderboard</strong> with streak badges, then review answers together!
                    </p>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button className="btn btn-primary btn--lg" onClick={() => setShowHowItWorks(false)} style={{ width: '100%', borderRadius: '10px' }}>
                  Got it, let&apos;s start! 🚀
                </button>
              </div>
            </div>
          </div>
        )}

        {hostView === 'reports' ? (
          <main className="menti-content" style={{ maxWidth: '1240px', margin: '0 auto', padding: '1.5rem', width: '100%' }}>
            <MentorQuizHistoryModal
              embedded={true}
              onBack={() => setHostView('builder')}
              availableBatches={availableBatchObjects}
              onLoadInBuilder={(quiz) => {
                setEditingDraftId(quiz.sourceDraftId || null);
                setEditingDraftTitle(quiz.title);
                setQuestions(quiz.questions || []);
                if (quiz.subject) setQuizSubject(quiz.subject);
                if (quiz.batchId) setQuizBatchId(quiz.batchId);
                if (quiz.batch) setQuizBatch(quiz.batch);
                setAiInitialTopic(quiz.title);
                setHostView('builder');
                setDraftSavedToast({
                  message: `Loaded "${quiz.title}" (${quiz.questions.length} questions) into builder. You can edit questions, change options, and re-launch or save.`,
                  draftId: quiz.sourceDraftId || '',
                });
                setTimeout(scrollToBuilder, 150);
              }}
            />
          </main>
        ) : hostView === 'library' ? (
          <main className="menti-content" style={{ maxWidth: '1240px', margin: '0 auto', padding: '1.5rem', width: '100%' }}>
            <QuizLibrary
              authUser={authUser}
              availableBatches={availableBatchObjects}
              onBatchCreated={(b) => {
                setAvailableBatchObjects((prev) => {
                  const filtered = prev.filter((o) => o.id !== b.id && o.displayName !== b.displayName);
                  return [...filtered, b].sort((x, y) => x.displayName.localeCompare(y.displayName));
                });
                setAvailableBatches((prev) => {
                  const filtered = prev.filter((x) => x !== b.displayName);
                  return [...filtered, b.displayName].sort();
                });
              }}
              onGoLive={async (draftId, batchId, batchName) => {
                await launchSessionFromDraft(draftId, batchId, batchName);
              }}
              onEditDraft={(draft) => {
                setEditingDraftId(draft.id);
                setEditingDraftTitle(draft.title);
                setQuestions(draft.questions || []);
                if (draft.subject) setQuizSubject(draft.subject);
                setAiInitialTopic(draft.title);
                setHostView('builder');
                setTimeout(scrollToBuilder, 150);
              }}
              onLoadPastQuiz={(quiz) => {
                setEditingDraftId(quiz.sourceDraftId || null);
                setEditingDraftTitle(quiz.title);
                setQuestions(quiz.questions || []);
                if (quiz.subject) setQuizSubject(quiz.subject);
                setAiInitialTopic(quiz.title);
                setHostView('builder');
                setDraftSavedToast({
                  message: `Loaded "${quiz.title}" (${quiz.questions.length} questions) into builder. You can edit questions, change options, and re-launch or save.`,
                  draftId: quiz.sourceDraftId || '',
                });
                setTimeout(scrollToBuilder, 150);
              }}
              onViewReportsTab={() => setHostView('reports')}
              onNewQuiz={() => {
                setEditingDraftId(null);
                setEditingDraftTitle(null);
                setQuestions([]);
                setAiInitialTopic('');
                setHostView('builder');
                setTimeout(scrollToBuilder, 150);
              }}
              onOpenAi={() => {
                setEditingDraftId(null);
                setEditingDraftTitle(null);
                setQuestions([]);
                openWithTopic('');
              }}
            />
          </main>
        ) : (
          <main className="menti-content">
            <h1 className="menti-welcome-title">Run a quiz with your class</h1>

          <section className="menti-hero-row">
            <div className="menti-card-live">
              <div>
                <div className="menti-live-pill">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="24" height="24" rx="6" fill="#3B82F6" />
                    <circle cx="12" cy="12" r="5" fill="#FFFFFF" />
                  </svg>
                  <span>Live</span>
                </div>

                <h2 className="menti-live-headline">GENERATE.<br />PROJECT.<br />PLAY.</h2>

                <p className="menti-live-desc">
                  Type a topic or paste your syllabus, generate the questions, then put the code on
                  the screen. Students join by QR on their phones or by code on a laptop.
                </p>
              </div>

              <div>
                <button className="menti-btn-presentation" onClick={() => openWithTopic('')} id="make-presentation-btn">
                  ✨ Generate questions →
                </button>
              </div>

              <div className="menti-live-art" aria-hidden="true">
                <svg width="210" height="170" viewBox="0 0 220 180" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="90" cy="90" r="55" stroke="#3B82F6" strokeWidth="18" strokeDasharray="160 110" opacity="0.8" />
                  <rect x="95" y="25" width="115" height="130" rx="18" fill="#1E293B" />
                  <rect x="110" y="45" width="85" height="12" rx="4" fill="#38BDF8" />
                  <rect x="110" y="70" width="60" height="8" rx="3" fill="#64748B" />
                  <rect x="110" y="90" width="85" height="6" rx="3" fill="#475569" />
                  <rect x="110" y="105" width="45" height="6" rx="3" fill="#475569" />
                  <circle cx="170" cy="125" r="14" fill="#3B82F6" />
                  <circle cx="65" cy="130" r="22" fill="#FACC15" />
                  <text x="65" y="136" textAnchor="middle" fontSize="16">👩‍🏫</text>
                </svg>
              </div>
            </div>

            <div
              className="menti-card-mini"
              onClick={startNewScored}
              style={{ cursor: 'pointer' }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && startNewScored()}
            >
              <div className="menti-mini-badge">
                <span style={{ color: '#6366F1', fontSize: '1.2rem' }}>◆</span>
                <span>Scored quiz</span>
              </div>
              <p className="menti-mini-desc">
                Mark the right option — correct answers score 1000 plus a speed bonus.
              </p>
              <button className="menti-mini-arrow" onClick={(e) => { e.stopPropagation(); startNewScored(); }} aria-label="Build a scored quiz">→</button>
            </div>

            <div
              className="menti-card-mini"
              onClick={startNewPoll}
              style={{ cursor: 'pointer' }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && startNewPoll()}
            >
              <div className="menti-mini-badge">
                <span style={{ color: '#EC4899', fontSize: '1.2rem' }}>●</span>
                <span>Poll</span>
              </div>
              <p className="menti-mini-desc">
                Leave the answer unmarked and the bars fill live. No scoring.
              </p>
              <button className="menti-mini-arrow" onClick={(e) => { e.stopPropagation(); startNewPoll(); }} aria-label="Build a poll">→</button>
            </div>
          </section>

          <section style={{ marginBottom: '2.5rem' }}>
            <div className="menti-ai-header">
              <span>Generate from your syllabus</span>
              <span style={{ color: '#8B5CF6' }}>✨</span>
            </div>

            <div className="menti-ai-grid">
              {[
                { icon: '📘', label: 'Today’s chapter', topic: '' },
                { icon: '🧠', label: 'Recap last class', topic: 'Quick recap of the previous lesson' },
                { icon: '📐', label: 'Practice problems', topic: 'Practice problems with worked answers' },
                { icon: '🔍', label: 'Check understanding', topic: 'Concept check on the core ideas of the topic' },
                { icon: '🎯', label: 'Exam revision', topic: 'Exam-style revision questions' },
              ].map((item) => (
                <div
                  key={item.label}
                  className="menti-ai-box"
                  onClick={() => openWithTopic(item.topic)}
                  onKeyDown={(e) => e.key === 'Enter' && openWithTopic(item.topic)}
                  role="button"
                  tabIndex={0}
                >
                  <span className="menti-ai-icon">{item.icon}</span>
                  <span className="menti-ai-label">{item.label}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Mentor Profile Subject Setup Prompt */}
          {authUser && !authUser.subject && (authUser.role === 'mentor' || authUser.role === 'admin') && showProfileSubjectPrompt && (
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(168, 85, 247, 0.12))',
                border: '1px solid rgba(99, 102, 241, 0.35)',
                borderRadius: '16px',
                padding: '1.15rem 1.4rem',
                marginBottom: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>🎯</span>
                    <strong style={{ fontSize: '0.98rem', color: 'var(--text-primary, #F2F2F2)' }}>
                      Complete your Mentor Profile — Set Your Teaching Subject
                    </strong>
                    <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.25)', color: '#818CF8', fontWeight: 700 }}>
                      Profile Setup
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary, #9CA3AF)', lineHeight: 1.4 }}>
                    Welcome, {authUser.realName}! Select your primary academic subject so your quizzes default to your subject across university reports.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileSubjectPrompt(false);
                    try { sessionStorage.setItem('pollmeter_dismissed_subject_prompt', 'true'); } catch {}
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted, #9CA3AF)',
                    cursor: 'pointer',
                    fontSize: '1.1rem',
                    padding: '0.2rem',
                  }}
                  title="Dismiss for now"
                >
                  ✕
                </button>
              </div>

              {profileSubjectError && (
                <div style={{ color: '#EF4444', fontSize: '0.82rem', fontWeight: 600 }}>
                  ⚠️ {profileSubjectError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {!showProfileNewSubjectInput ? (
                  <>
                    <select
                      className="input"
                      style={{
                        minWidth: '220px',
                        fontSize: '0.85rem',
                        padding: '0.45rem 0.75rem',
                        borderRadius: '8px',
                        background: 'var(--surface, #1B1B1F)',
                        border: '1px solid var(--border, #2A2A2F)',
                        color: 'var(--text-primary, #F2F2F2)',
                        fontWeight: 600,
                      }}
                      value={quizSubject}
                      onChange={(e) => {
                        if (e.target.value === '__NEW__') {
                          setShowProfileNewSubjectInput(true);
                        } else {
                          setQuizSubject(e.target.value);
                        }
                      }}
                    >
                      <option value="">Choose an existing subject…</option>
                      {availableSubjects.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                      <option value="__NEW__">＋ Add new subject…</option>
                    </select>

                    <button
                      type="button"
                      className="btn btn-primary btn--sm"
                      disabled={!quizSubject || savingProfileSubject}
                      onClick={() => handleSaveProfileSubject(quizSubject)}
                      style={{ padding: '0.45rem 1rem', fontSize: '0.82rem', fontWeight: 700 }}
                    >
                      {savingProfileSubject ? 'Saving…' : 'Save to Profile'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowProfileNewSubjectInput(true)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent, #818CF8)',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: '0.3rem 0.5rem',
                      }}
                    >
                      ＋ Add new subject
                    </button>
                  </>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', width: '100%', maxWidth: '480px' }}>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. Distributed Computing, Mobile App Dev"
                      value={profileNewSubjectText}
                      onChange={(e) => { setProfileNewSubjectText(e.target.value); setProfileSubjectError(''); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveProfileSubject(profileNewSubjectText);
                        if (e.key === 'Escape') setShowProfileNewSubjectInput(false);
                      }}
                      disabled={savingProfileSubject}
                      style={{
                        flex: 1,
                        fontSize: '0.85rem',
                        padding: '0.45rem 0.75rem',
                        borderRadius: '8px',
                        background: 'var(--surface, #1B1B1F)',
                        border: '1px solid var(--border, #2A2A2F)',
                        color: 'var(--text-primary, #F2F2F2)',
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn--sm"
                      onClick={() => handleSaveProfileSubject(profileNewSubjectText)}
                      disabled={savingProfileSubject || !profileNewSubjectText.trim()}
                      style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem', fontWeight: 700 }}
                    >
                      {savingProfileSubject ? 'Saving…' : 'Save Subject'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowProfileNewSubjectInput(false); setProfileNewSubjectText(''); }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted, #9CA3AF)',
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        padding: '0.3rem 0.5rem',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          <section ref={builderRef} style={{ scrollMarginTop: '80px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1.25rem',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}
            >
              <div>
                <h3 className="t-title" style={{ fontSize: '1.35rem' }}>Question builder</h3>
                <p className="t-body-sm text-secondary">
                  Scored multiple choice, True / False, or live audience polls.
                </p>
              </div>
              <button className="btn btn-ai btn--sm" onClick={() => openWithTopic('')} id="open-ai-builder-btn">
                ✨ AI Generate
              </button>
            </div>

            {editingDraftId && (
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(59, 130, 246, 0.15))',
                  border: '1px solid rgba(99, 102, 241, 0.4)',
                  borderRadius: '14px',
                  padding: '0.85rem 1.25rem',
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <span style={{ fontSize: '1.3rem' }}>📝</span>
                  <div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary, #F2F2F2)' }}>
                      Editing Draft: <span style={{ color: '#818CF8' }}>{editingDraftTitle || 'Untitled Draft'}</span>
                    </div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #9CA3AF)' }}>
                      Changes you save will update this draft in your library.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn--sm"
                  onClick={() => {
                    setEditingDraftId(null);
                    setEditingDraftTitle(null);
                    setQuestions([]);
                    setAiInitialTopic('');
                  }}
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                >
                  ✕ Exit Draft Mode
                </button>
              </div>
            )}

            {draftSavedToast && (
              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  borderRadius: '12px',
                  padding: '0.75rem 1.2rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10B981', fontWeight: 600, fontSize: '0.88rem' }}>
                  <span>✓</span>
                  <span>{draftSavedToast.message}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn--sm"
                  onClick={() => setHostView('library')}
                  style={{ color: '#10B981', fontWeight: 700, textDecoration: 'underline', padding: '0.2rem 0.5rem' }}
                >
                  View in Library →
                </button>
              </div>
            )}

            {recoveredAt && questions.length > 0 && (
              <div
                style={{
                  background: 'rgba(59, 130, 246, 0.12)',
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                  borderRadius: '12px',
                  padding: '0.75rem 1.2rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#60A5FA', fontWeight: 600, fontSize: '0.88rem' }}>
                  <span>↩</span>
                  <span>
                    Recovered {questions.length} unsaved question{questions.length === 1 ? '' : 's'} from{' '}
                    {new Date(recoveredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
                    {editingDraftTitle ? ` Editing "${editingDraftTitle}".` : ' Save as draft to keep them in your library.'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn--sm"
                    onClick={() => setRecoveredAt(null)}
                    style={{ color: '#60A5FA', fontWeight: 700, padding: '0.2rem 0.5rem' }}
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn--sm"
                    onClick={discardRecovered}
                    style={{ color: '#F87171', fontWeight: 700, padding: '0.2rem 0.5rem' }}
                  >
                    Start fresh
                  </button>
                </div>
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: questions.length > 0 ? '1.8fr 1.2fr' : '1fr',
                gap: '1.5rem',
                alignItems: 'start',
              }}
            >
              <div className="card card--lg" style={{ borderRadius: '20px' }}>
                <p className="t-title" style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>{editing ? '✏️' : '➕'}</span> {editing ? 'Edit question' : 'Add a question'}
                </p>
                <QuestionForm
                  initial={editing}
                  onSave={saveQuestion}
                  onCancel={editing ? () => setEditing(null) : undefined}
                />
              </div>

              {questions.length > 0 && (
                <div className="card stack stack-4" style={{ borderRadius: '20px' }}>
                  <div className="row row-3" style={{ justifyContent: 'space-between' }}>
                    <p className="t-title">Your questions</p>
                    <span className="badge badge-primary">{questions.length}</span>
                  </div>

                  <div className="stack stack-3" style={{ maxHeight: 420, overflowY: 'auto', paddingRight: '0.25rem' }}>
                    {questions.map((q, idx) => (
                      <div
                        key={q.id}
                        className="card card--sm row row-3"
                        style={{ alignItems: 'flex-start', background: 'var(--surface, #1B1B1F)', border: '1px solid var(--border, #2A2A2F)' }}
                      >
                        <div className="flex-1 stack stack-2">
                          <div className="row row-2 row-wrap">
                            <span className="badge badge-neutral t-label-sm">#{idx + 1}</span>
                            <span className={`badge t-label-sm ${q.type === 'mcq' ? 'badge-primary' : 'badge-success'}`}>
                              {q.type === 'mcq' ? 'MCQ' : 'Open text'}
                            </span>
                            <span className="badge badge-warning t-label-sm">⏱ {q.timeLimitSeconds}s</span>
                            {q.correctAnswer ? (
                              <span className="badge badge-success t-label-sm">✓ Scored</span>
                            ) : (
                              <span className="badge badge-neutral t-label-sm">Poll</span>
                            )}
                          </div>
                          <p className="t-body-md text-primary" style={{ fontWeight: 600 }}>{q.text}</p>
                          {q.options && <p className="t-body-sm text-muted">{q.options.join(' · ')}</p>}
                        </div>

                        <div className="stack stack-2">
                          <div className="row row-2">
                            <button
                              className="btn btn-ghost btn--icon btn--sm"
                              onClick={() => moveQuestion(q.id, -1)}
                              disabled={idx === 0}
                              aria-label={`Move question ${idx + 1} up`}
                              title="Move up"
                            >
                              ↑
                            </button>
                            <button
                              className="btn btn-ghost btn--icon btn--sm"
                              onClick={() => moveQuestion(q.id, 1)}
                              disabled={idx === questions.length - 1}
                              aria-label={`Move question ${idx + 1} down`}
                              title="Move down"
                            >
                              ↓
                            </button>
                          </div>
                          <div className="row row-2">
                            <button
                              className="btn btn-ghost btn--icon btn--sm"
                              onClick={() => { setEditing(q); scrollToBuilder(); }}
                              aria-label={`Edit question ${idx + 1}`}
                              title="Edit"
                            >
                              ✏️
                            </button>
                            <button
                              className="btn btn-ghost btn--icon btn--sm"
                              onClick={() => removeQuestion(q.id)}
                              aria-label={`Remove question ${idx + 1}`}
                              title="Remove"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pm-host-course-card">
                    <div className="pm-host-course-header">
                      <div className="pm-host-course-title">
                        <span className="pm-host-course-icon">📚</span>
                        <div>
                          <strong>Subject &amp; Academic Cohort Tagging</strong>
                          <span className="pm-host-course-sub">
                            Auto-grouped in student transcripts and university gradebooks
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pm-host-course-grid">
                      {/* Academic Subject */}
                      <div className="pm-host-field-group">
                        <label className="pm-host-field-label">
                          Academic Subject
                        </label>
                        {!showBuilderNewSubject ? (
                          <>
                            <select
                              className="input pm-host-select"
                              value={quizSubject}
                              onChange={(e) => {
                                if (e.target.value === '__NEW__') {
                                  setShowBuilderNewSubject(true);
                                } else {
                                  setQuizSubject(e.target.value);
                                }
                              }}
                            >
                              {!quizSubject && <option value="">Select a subject…</option>}
                              {authUser?.subject && !availableSubjects.some((s) => s.toLowerCase() === authUser.subject?.toLowerCase()) && (
                                <option value={authUser.subject}>{authUser.subject} (My Subject)</option>
                              )}
                              {availableSubjects.map((s) => (
                                <option key={s} value={s}>
                                  {s}{authUser?.subject?.toLowerCase() === s.toLowerCase() ? ' (My Subject)' : ''}
                                </option>
                              ))}
                              <option value="__NEW__">＋ Add custom subject…</option>
                            </select>
                            <button
                              type="button"
                              className="pm-host-action-link"
                              onClick={() => { setShowBuilderNewSubject(true); setBuilderNewSubjectName(''); }}
                            >
                              <span>＋</span> Add custom subject
                            </button>
                          </>
                        ) : (
                          <div style={{ marginTop: '0.2rem' }}>
                            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                              <input
                                type="text"
                                className="input pm-host-input"
                                placeholder="e.g. Distributed Systems"
                                value={builderNewSubjectName}
                                onChange={(e) => setBuilderNewSubjectName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleAddBuilderSubject();
                                  if (e.key === 'Escape') { setShowBuilderNewSubject(false); setBuilderNewSubjectName(''); }
                                }}
                                style={{ flex: 1 }}
                                autoFocus
                              />
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={handleAddBuilderSubject}
                                disabled={!builderNewSubjectName.trim()}
                                style={{ whiteSpace: 'nowrap' }}
                              >
                                Use
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => { setShowBuilderNewSubject(false); setBuilderNewSubjectName(''); }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Target Batch / Class */}
                      <div className="pm-host-field-group">
                        <label className="pm-host-field-label">
                          Target Batch / Class
                        </label>
                        <BatchPicker
                          batches={availableBatchObjects}
                          selectedBatchId={quizBatchId}
                          onSelect={(id, name) => {
                            setQuizBatchId(id);
                            setQuizBatch(name);
                          }}
                          onBatchCreated={(b) => {
                            setAvailableBatchObjects((prev) => {
                              const filtered = prev.filter((x) => x.id !== b.id && x.displayName !== b.displayName);
                              return [...filtered, b].sort((x, y) => x.displayName.localeCompare(y.displayName));
                            });
                            setAvailableBatches((prev) => {
                              const filtered = prev.filter((x) => x !== b.displayName);
                              return [...filtered, b.displayName].sort();
                            });
                          }}
                          disabled={loading}
                        />
                      </div>
                    </div>

                    {/* Quiz Topic / Unit Row */}
                    <div className="pm-host-topic-row">
                      <label className="pm-host-field-label">
                        Quiz Topic / Unit Name
                      </label>
                      <input
                        type="text"
                        className="input pm-host-input"
                        placeholder="e.g. Unit 3: React State Management & Hooks"
                        value={aiInitialTopic}
                        onChange={(e) => setAiInitialTopic(e.target.value)}
                      />
                    </div>
                  </div>

                  {error && <div className="alert alert-error">⚠ {error}</div>}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn--lg"
                      onClick={handleSaveDraft}
                      disabled={savingDraft || questions.length === 0}
                      id="save-draft-btn"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        fontWeight: 700,
                        border: '1px solid rgba(99, 102, 241, 0.4)',
                        background: 'rgba(99, 102, 241, 0.08)',
                        color: 'var(--text-primary, #F2F2F2)',
                      }}
                      title="Save this quiz to your library without needing a batch selected"
                    >
                      {savingDraft ? (
                        <><span className="spinner spinner--sm" /> Saving…</>
                      ) : (
                        `💾 ${editingDraftId ? 'Update Draft' : 'Save for later'}`
                      )}
                    </button>

                    <button
                      className="btn btn-primary btn--lg"
                      onClick={createSession}
                      disabled={loading || questions.length === 0 || !quizBatchId}
                      id="create-session-btn"
                      title={!quizBatchId ? 'Please select a batch to go live' : 'Launch live session now'}
                    >
                      {loading ? (
                        <><span className="spinner spinner--sm" style={{ borderTopColor: '#fff' }} /> Creating…</>
                      ) : (
                        `🚀 Start Live Session (${questions.length} Q${questions.length === 1 ? '' : 's'})`
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {questions.length === 0 && (
              <div
                className="card text-center stack stack-3"
                style={{ padding: '2.5rem', background: '#FFFFFF', borderRadius: '20px', marginTop: '1.5rem' }}
              >
                <p className="t-body-md text-secondary">
                  💡 No questions yet. Write one above, or hit <strong>✨ AI Generate</strong> and paste
                  your topic or syllabus to get a full set in one go.
                </p>
                {error && <div className="alert alert-error">⚠ {error}</div>}
              </div>
            )}
          </section>
        </main>
        )}
      </div>
    </div>
  );
}