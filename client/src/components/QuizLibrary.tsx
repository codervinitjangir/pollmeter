import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { QuizDraft, QuizDraftSummary, Question } from '../types';
import {
  fetchQuizDrafts,
  fetchQuizDraftById,
  createQuizDraft,
  deleteQuizDraft,
  fetchMentorQuizzes,
  fetchQuizDetails,
  getAuthToken,
  AuthUser,
  SubjectObject,
  fetchSubjectObjects,
} from '../auth';
import { apiUrl } from '../api';
import { setStoredHost } from '../pages/mentor/hostSession';
import { useNavigate } from 'react-router-dom';

interface QuizLibraryProps {
  onEditDraft: (draft: QuizDraft) => void;
  onGoLive: (draftId: string, subjectId: string) => Promise<void>;
  activeSubjects?: SubjectObject[];
  onNewQuiz: () => void;
  onOpenAi: () => void;
  authUser: AuthUser | null;
  onLoadPastQuiz?: (quiz: {
    title: string;
    subject?: string;
    subjectId?: string;
    year?: number;
    questions: Question[];
    sourceDraftId?: string;
  }) => void;
  onViewReportsTab?: () => void;
}

function parseQuestions(raw: any): Question[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [];
}

export default function QuizLibrary({
  onEditDraft,
  onGoLive,
  activeSubjects,
  onNewQuiz,
  onOpenAi,
  authUser,
  onLoadPastQuiz,
  onViewReportsTab,
}: QuizLibraryProps) {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<QuizDraftSummary[]>([]);
  const [pastSessions, setPastSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'draft' | 'past' | 'archived'>('draft');

  // Active subjects
  const [internalSubjects, setInternalSubjects] = useState<SubjectObject[]>([]);
  useEffect(() => {
    if (!activeSubjects || activeSubjects.length === 0) {
      fetchSubjectObjects().then(setInternalSubjects).catch(() => {});
    }
  }, [activeSubjects]);
  const subjectsList = activeSubjects && activeSubjects.length > 0 ? activeSubjects : internalSubjects;

  // Admin filter by mentor
  const [adminMentorEmail, setAdminMentorEmail] = useState('');

  // Go live modal state
  const [goLiveModalDraft, setGoLiveModalDraft] = useState<QuizDraftSummary | null>(null);
  const [goLiveModalPastSession, setGoLiveModalPastSession] = useState<any | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [startingSession, setStartingSession] = useState(false);
  const [goLiveError, setGoLiveError] = useState('');

  // In-UI Delete confirmation modal state
  const [deleteConfirmDraft, setDeleteConfirmDraft] = useState<QuizDraftSummary | null>(null);

  // Loading draft details for edit or duplicate
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Load drafts and past sessions for client-side join
  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const mentorEmailParam = authUser?.role === 'admin' && adminMentorEmail ? adminMentorEmail : undefined;
      const [draftList, sessionsList] = await Promise.all([
        fetchQuizDrafts(filterStatus === 'archived' ? 'archived' : 'draft', mentorEmailParam),
        fetchMentorQuizzes(mentorEmailParam ? { mentorEmail: mentorEmailParam } : undefined).catch(() => []),
      ]);
      setDrafts(draftList || []);
      setPastSessions(sessionsList || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load quiz drafts.');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, adminMentorEmail, authUser?.role]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Map each draft to its most recent live session usage
  const draftUsageMap = useMemo(() => {
    const map = new Map<string, { batch: string; date: string; sessionCode: string }>();
    for (const session of pastSessions) {
      if (session.sourceDraftId) {
        const existing = map.get(session.sourceDraftId);
        const sessionDate = new Date(session.createdAt || 0).getTime();
        const existingDate = existing ? new Date(existing.date).getTime() : 0;
        if (!existing || sessionDate > existingDate) {
          map.set(session.sourceDraftId, {
            batch: session.batch || 'Class',
            date: session.createdAt,
            sessionCode: session.code,
          });
        }
      }
    }
    return map;
  }, [pastSessions]);

  // Filtered drafts by search query
  const filteredDrafts = useMemo(() => {
    if (!searchQuery.trim()) return drafts;
    const q = searchQuery.toLowerCase().trim();
    return drafts.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        (d.subject && d.subject.toLowerCase().includes(q)) ||
        d.mentorEmail.toLowerCase().includes(q)
    );
  }, [drafts, searchQuery]);

  // Filtered past sessions by search query
  const filteredPastSessions = useMemo(() => {
    if (!searchQuery.trim()) return pastSessions;
    const q = searchQuery.toLowerCase().trim();
    return pastSessions.filter(
      (s) =>
        (s.topic && s.topic.toLowerCase().includes(q)) ||
        (s.subject && s.subject.toLowerCase().includes(q)) ||
        (s.batch && s.batch.toLowerCase().includes(q)) ||
        (s.code && s.code.toLowerCase().includes(q))
    );
  }, [pastSessions, searchQuery]);

  const handleDuplicate = async (draft: QuizDraftSummary) => {
    setActionLoadingId(draft.id);
    setError('');
    setSuccessMsg('');
    try {
      const full = await fetchQuizDraftById(draft.id);
      const duplicateTitle = `${full.title} (copy)`.slice(0, 200);
      await createQuizDraft({
        title: duplicateTitle,
        subject: full.subject,
        questions: full.questions,
      });
      setSuccessMsg(`Duplicated "${draft.title}" successfully.`);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to duplicate quiz draft.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCopyPastSessionToDraft = async (session: any) => {
    setActionLoadingId(session.id);
    setError('');
    setSuccessMsg('');
    try {
      let qs = parseQuestions(session.questions);
      if (!qs || qs.length === 0) {
        try {
          const d = await fetchQuizDetails(session.id);
          qs = parseQuestions(d?.session?.questions);
        } catch {}
      }
      if (!qs || qs.length === 0) {
        throw new Error('No questions found in this quiz session.');
      }
      const duplicateTitle = `${session.topic || 'Quiz'} (Copy)`.slice(0, 200);
      await createQuizDraft({
        title: duplicateTitle,
        subject: session.subject || 'General',
        questions: qs,
      });
      setSuccessMsg(`✓ Saved "${duplicateTitle}" to your Drafts!`);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to save past quiz as draft.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleEditPastSession = async (session: any) => {
    let qs = parseQuestions(session.questions);
    if (!qs || qs.length === 0) {
      try {
        const d = await fetchQuizDetails(session.id);
        qs = parseQuestions(d?.session?.questions);
      } catch {}
    }
    if (!qs || qs.length === 0) {
      setError('No questions found in this past quiz.');
      return;
    }
    if (onLoadPastQuiz) {
      onLoadPastQuiz({
        title: session.topic || 'Classroom Quiz',
        subject: session.subject,
        questions: qs,
        sourceDraftId: session.sourceDraftId,
      });
    } else {
      onEditDraft({
        id: session.sourceDraftId || session.id,
        title: session.topic || 'Classroom Quiz',
        subject: session.subject || 'General',
        questions: qs,
        mentorEmail: authUser?.email || '',
        status: 'draft',
        createdAt: session.createdAt,
        updatedAt: session.createdAt,
      });
    }
  };

  const handleStartPastSessionGoLive = async () => {
    if (!goLiveModalPastSession) return;
    if (!selectedSubjectId) {
      setGoLiveError('Please select an academic subject before going live.');
      return;
    }
    setStartingSession(true);
    setGoLiveError('');
    try {
      let qs = parseQuestions(goLiveModalPastSession.questions);
      if (!qs || qs.length === 0) {
        const d = await fetchQuizDetails(goLiveModalPastSession.id);
        qs = parseQuestions(d?.session?.questions);
      }
      if (!qs || qs.length === 0) {
        throw new Error('No questions found in this quiz session.');
      }
      const token = getAuthToken();
      if (!token) throw new Error('Authentication required');
      const res = await fetch(apiUrl('/api/sessions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          questions: qs,
          topic: goLiveModalPastSession.topic || 'Classroom Quiz',
          subjectId: selectedSubjectId,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        throw new Error(d.error || 'Failed to start live session.');
      }
      setStoredHost({ code: d.code, hostId: d.hostId });
      navigate('/dashboard/live/' + d.code);
    } catch (err: any) {
      setGoLiveError(err.message || 'Failed to launch live session.');
      setStartingSession(false);
    }
  };

  const handleEdit = async (draft: QuizDraftSummary) => {
    setActionLoadingId(draft.id);
    setError('');
    try {
      const full = await fetchQuizDraftById(draft.id);
      onEditDraft(full);
    } catch (err: any) {
      setError(err.message || 'Failed to load draft for editing.');
      setActionLoadingId(null);
    }
  };

  const handleDelete = (draft: QuizDraftSummary) => {
    setDeleteConfirmDraft(draft);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmDraft) return;
    const draft = deleteConfirmDraft;
    setActionLoadingId(draft.id);
    setError('');
    setSuccessMsg('');
    try {
      await deleteQuizDraft(draft.id);
      setSuccessMsg(`Draft "${draft.title}" deleted.`);
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      setDeleteConfirmDraft(null);
    } catch (err: any) {
      setError(err.message || 'Failed to delete quiz draft.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleStartGoLive = async () => {
    if (!goLiveModalDraft) return;
    if (!selectedSubjectId) {
      setGoLiveError('Please select an academic subject before going live.');
      return;
    }
    setStartingSession(true);
    setGoLiveError('');
    try {
      await onGoLive(goLiveModalDraft.id, selectedSubjectId);
    } catch (err: any) {
      setGoLiveError(err.message || 'Failed to launch live session.');
      setStartingSession(false);
    }
  };

  return (
    <div className="pm-reports-workspace-card" style={{ maxWidth: '1240px', margin: '0 auto', padding: '1.5rem', width: '100%' }}>
      {/* Header */}
      <div className="pm-history-header" style={{ marginBottom: '1.5rem' }}>
        <div className="pm-history-header-left">
          <span className="pm-history-icon" style={{ fontSize: '2rem' }}>📚</span>
          <div>
            <h2 className="pm-history-title" style={{ margin: 0, fontSize: '1.4rem' }}>
              My Quiz Library
            </h2>
            <p className="pm-history-subtitle" style={{ margin: '0.2rem 0 0', color: 'var(--text-secondary, #9CA3AF)', fontSize: '0.88rem' }}>
              Reusable quiz drafts — create and refine in advance, then &quot;Go Live&quot; in class for any section
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onOpenAi}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <span>✨</span> Generate with AI
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onNewQuiz}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <span>＋</span> Create Draft
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: '10px' }}>
          ⚠ {error}
        </div>
      )}
      {successMsg && (
        <div className="alert alert-success" style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: '10px', background: '#064E3B', color: '#6EE7B7', border: '1px solid #059669' }}>
          ✓ {successMsg}
        </div>
      )}

      {/* Filters Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
          marginBottom: '1.25rem',
          padding: '0.75rem 1rem',
          background: 'var(--surface-2, rgba(255, 255, 255, 0.03))',
          borderRadius: '12px',
          border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
        }}
      >
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: 1, minWidth: '240px' }}>
          <input
            type="text"
            className="input pm-host-input"
            placeholder="🔍 Search quizzes by title or subject..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', maxWidth: '380px', fontSize: '0.85rem' }}
          />

          <div style={{ display: 'flex', background: 'var(--surface, #1B1B1F)', borderRadius: '8px', padding: '2px', border: '1px solid var(--border)' }}>
            <button
              type="button"
              className={`btn btn-sm ${filterStatus === 'draft' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '0.78rem', padding: '0.25rem 0.65rem' }}
              onClick={() => setFilterStatus('draft')}
            >
              Drafts ({drafts.length})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${filterStatus === 'past' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '0.78rem', padding: '0.25rem 0.65rem' }}
              onClick={() => setFilterStatus('past')}
            >
              Hosted Quizzes ({pastSessions.length})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${filterStatus === 'archived' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '0.78rem', padding: '0.25rem 0.65rem' }}
              onClick={() => setFilterStatus('archived')}
            >
              Archived
            </button>
          </div>
        </div>

        {/* Optional Admin View: filter by mentor */}
        {authUser?.role === 'admin' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Mentor Review:</span>
            <input
              type="email"
              className="input pm-host-input"
              placeholder="Filter by mentor email…"
              value={adminMentorEmail}
              onChange={(e) => setAdminMentorEmail(e.target.value)}
              style={{ fontSize: '0.8rem', width: '220px', padding: '0.3rem 0.6rem' }}
            />
          </div>
        )}

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={loadData}
          title="Reload Library"
          style={{ fontSize: '0.82rem' }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Quizzes Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-secondary)' }}>
          <span className="spinner spinner--sm" style={{ marginRight: '0.5rem' }} />
          Loading your quiz library…
        </div>
      ) : filterStatus === 'past' ? (
        /* Past Hosted Quizzes Tab */
        filteredPastSessions.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '3.5rem 1.5rem',
              background: 'var(--surface, rgba(255, 255, 255, 0.02))',
              borderRadius: '16px',
              border: '1px dashed var(--border, rgba(255, 255, 255, 0.15))',
            }}
          >
            <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem' }}>📋</span>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.15rem' }}>
              {searchQuery ? 'No matching hosted quizzes found' : 'No hosted quizzes yet'}
            </h3>
            <p style={{ margin: '0 0 1.25rem', color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '480px', marginLeft: 'auto', marginRight: 'auto' }}>
              When you host live quizzes for your batches, they will appear here so you can re-run them, edit questions, or export reports anytime.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
            {filteredPastSessions.map((session) => {
              const qs = parseQuestions(session.questions);
              const isActing = actionLoadingId === session.id;

              return (
                <div
                  key={session.id}
                  style={{
                    background: 'var(--surface, #18181B)',
                    borderRadius: '14px',
                    border: '1px solid var(--border, #27272A)',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    transition: 'border-color 0.15s ease, transform 0.15s ease',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '6px',
                          background: 'rgba(99, 102, 241, 0.12)',
                          color: '#A5B4FC',
                        }}
                      >
                        {(session.year ? `Year ${session.year} • ` : '') + (session.subject || 'General')}
                      </span>
                      <span
                        style={{
                          fontSize: '0.74rem',
                          color: 'var(--text-secondary, #9CA3AF)',
                          fontWeight: 600,
                        }}
                      >
                        {qs.length || session.questionCount || 0} Questions
                      </span>
                    </div>

                    <h3
                      style={{
                        margin: '0.2rem 0 0.5rem',
                        fontSize: '1.1rem',
                        fontWeight: 700,
                        color: 'var(--text-primary, #F2F2F2)',
                        lineHeight: 1.35,
                      }}
                    >
                      {session.topic || 'Classroom Quiz'}
                    </h3>

                    <div
                      style={{
                        fontSize: '0.78rem',
                        color: 'var(--text-secondary, #9CA3AF)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        margin: '0.6rem 0 1rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>🎓 {session.year ? `Year ${session.year}` : (session.batch || 'Campus')}</span>
                      <span>•</span>
                      <span>#{session.code}</span>
                      <span>•</span>
                      <span>{new Date(session.createdAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span style={{ color: '#10B981', fontWeight: 600 }}>{session.participantCount || 0} Students</span>
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: '0.85rem',
                      borderTop: '1px solid var(--border, #27272A)',
                      gap: '0.4rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        setGoLiveModalPastSession(session);
                        let subId = session.subjectId || '';
                        if (!subId && session.subject) {
                          const match = subjectsList.find((s) => s.name.toLowerCase() === session.subject?.toLowerCase());
                          if (match) subId = match.id;
                        }
                        setSelectedSubjectId(subId);
                        setGoLiveError('');
                      }}
                      disabled={isActing}
                      style={{
                        fontWeight: 700,
                        background: 'linear-gradient(135deg, #10B981, #059669)',
                        border: 'none',
                      }}
                    >
                      ▶ Host Again
                    </button>

                    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleEditPastSession(session)}
                        disabled={isActing}
                        title="Load into Quiz Builder to edit or update questions"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleCopyPastSessionToDraft(session)}
                        disabled={isActing}
                        title="Duplicate as new draft in library"
                      >
                        📋 Copy
                      </button>
                      {onViewReportsTab && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={onViewReportsTab}
                          disabled={isActing}
                          title="View detailed student reports"
                        >
                          📊 Report
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : filteredDrafts.length === 0 ? (
        /* Empty Drafts */
        <div
          style={{
            textAlign: 'center',
            padding: '3.5rem 1.5rem',
            background: 'var(--surface, rgba(255, 255, 255, 0.02))',
            borderRadius: '16px',
            border: '1px dashed var(--border, rgba(255, 255, 255, 0.15))',
          }}
        >
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem' }}>💡</span>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.15rem' }}>
            {searchQuery ? 'No matching quizzes found' : 'Your Quiz Library is empty'}
          </h3>
          <p style={{ margin: '0 0 1.25rem', color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '480px', marginLeft: 'auto', marginRight: 'auto' }}>
            {searchQuery
              ? 'Try adjusting your search terms or clearing the filter.'
              : 'Prepare quiz questions in advance with AI or write them by hand. Save drafts to reuse them across multiple batches whenever you enter the classroom.'}
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button type="button" className="btn btn-primary" onClick={onOpenAi}>
              ✨ Generate with AI
            </button>
            <button type="button" className="btn btn-secondary" onClick={onNewQuiz}>
              ＋ Create Manually
            </button>
          </div>
        </div>
      ) : (
        /* Drafts Cards */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
          {filteredDrafts.map((draft) => {
            const usage = draftUsageMap.get(draft.id);
            const isActing = actionLoadingId === draft.id;

            return (
              <div
                key={draft.id}
                style={{
                  background: 'var(--surface, #18181B)',
                  borderRadius: '14px',
                  border: '1px solid var(--border, #27272A)',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  transition: 'border-color 0.15s ease, transform 0.15s ease',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '6px',
                        background: 'rgba(99, 102, 241, 0.12)',
                        color: '#A5B4FC',
                      }}
                    >
                      {(draft.year ? `Year ${draft.year} • ` : '') + (draft.subject || 'General')}
                    </span>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        color: 'var(--text-secondary, #9CA3AF)',
                        fontWeight: 600,
                      }}
                    >
                      {draft.questionCount} {draft.questionCount === 1 ? 'Question' : 'Questions'}
                    </span>
                  </div>

                  <h3
                    style={{
                      margin: '0.2rem 0 0.5rem',
                      fontSize: '1.1rem',
                      fontWeight: 700,
                      color: 'var(--text-primary, #F2F2F2)',
                      lineHeight: 1.35,
                    }}
                  >
                    {draft.title}
                  </h3>

                  {/* Traceability: Last Used Metadata */}
                  <div
                    style={{
                      fontSize: '0.78rem',
                      color: 'var(--text-secondary, #9CA3AF)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      margin: '0.6rem 0 1rem',
                    }}
                  >
                    <span>🕒</span>
                    {usage ? (
                      <span>
                        Last used on {new Date(usage.date).toLocaleDateString()}
                      </span>
                    ) : (
                      <span style={{ color: '#10B981' }}>Ready to launch • Not used yet</span>
                    )}
                  </div>
                </div>

                {/* Actions Row */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '0.85rem',
                    borderTop: '1px solid var(--border, #27272A)',
                    gap: '0.4rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setGoLiveModalDraft(draft);
                      let subId = draft.subjectId || '';
                      if (!subId && draft.subject) {
                        const match = subjectsList.find((s) => s.name.toLowerCase() === draft.subject?.toLowerCase());
                        if (match) subId = match.id;
                      }
                      setSelectedSubjectId(subId);
                      setGoLiveError('');
                    }}
                    disabled={isActing}
                    style={{
                      fontWeight: 700,
                      background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
                      border: 'none',
                    }}
                  >
                    ▶ Go Live
                  </button>

                  <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleEdit(draft)}
                      disabled={isActing}
                      title="Edit questions and settings"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleDuplicate(draft)}
                      disabled={isActing}
                      title="Duplicate as new draft"
                    >
                      📋 Copy
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleDelete(draft)}
                      disabled={isActing}
                      style={{ color: '#F87171' }}
                      title="Delete draft"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Go Live Batch Picker Modal */}
      {goLiveModalDraft && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !startingSession) setGoLiveModalDraft(null);
          }}
        >
          <div
            className="modal stack stack-4"
            role="dialog"
            aria-label="Go Live Batch Picker"
            style={{ maxWidth: '480px', width: '92%' }}
          >
            <div className="modal-header">
              <div className="stack stack-1">
                <p className="t-title" style={{ fontSize: '1.25rem', margin: 0 }}>
                  🚀 Go Live with Quiz
                </p>
                <p className="t-body-sm text-secondary" style={{ margin: 0 }}>
                  Choose which class/cohort will join this session
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn--icon"
                onClick={() => !startingSession && setGoLiveModalDraft(null)}
                aria-label="Close"
                disabled={startingSession}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                background: 'var(--surface-mid, rgba(255, 255, 255, 0.04))',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{goLiveModalDraft.title}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                Subject: {goLiveModalDraft.subject || 'General'} • {goLiveModalDraft.questionCount} Questions
              </div>
            </div>

            {/* Academic Subject Selector */}
            <div style={{ marginTop: '0.85rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
                📚 Academic Subject &amp; Year <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <select
                className="input pm-host-select"
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                style={{ width: '100%' }}
                disabled={startingSession}
              >
                <option value="">Select a Subject (Grouped by Year)…</option>
                {[1, 2, 3, 4].map((year) => {
                  const yearSubs = subjectsList.filter((s) => s.year === year);
                  if (yearSubs.length === 0) return null;
                  return (
                    <optgroup key={year} label={`Year ${year}`}>
                      {yearSubs.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>

            {goLiveError && (
              <div className="alert alert-error" style={{ padding: '0.5rem 0.75rem', fontSize: '0.82rem' }}>
                ⚠ {goLiveError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setGoLiveModalDraft(null)}
                disabled={startingSession}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleStartGoLive}
                disabled={startingSession || !selectedSubjectId}
                id="modal-start-live-btn"
              >
                {startingSession ? (
                  <><span className="spinner spinner--sm" style={{ borderTopColor: '#fff' }} /> Starting…</>
                ) : (
                  '🚀 Start Live Session'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Host Past Quiz Live Modal */}
      {goLiveModalPastSession && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !startingSession) setGoLiveModalPastSession(null);
          }}
        >
          <div
            className="modal stack stack-4"
            role="dialog"
            aria-label="Host Quiz Again Subject Picker"
            style={{ maxWidth: '480px', width: '92%' }}
          >
            <div className="modal-header">
              <div className="stack stack-1">
                <p className="t-title" style={{ fontSize: '1.25rem', margin: 0 }}>
                  🚀 Host Quiz Again
                </p>
                <p className="t-body-sm text-secondary" style={{ margin: 0 }}>
                  Confirm academic subject and year for this session
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn--icon"
                onClick={() => !startingSession && setGoLiveModalPastSession(null)}
                aria-label="Close"
                disabled={startingSession}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                background: 'var(--surface-mid, rgba(255, 255, 255, 0.04))',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{goLiveModalPastSession.topic || 'Classroom Quiz'}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                Subject: {goLiveModalPastSession.subject || 'General'} • {parseQuestions(goLiveModalPastSession.questions).length || goLiveModalPastSession.questionCount || 0} Questions
              </div>
            </div>

            {/* Academic Subject Selector */}
            <div style={{ marginTop: '0.85rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
                📚 Academic Subject &amp; Year <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <select
                className="input pm-host-select"
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                style={{ width: '100%' }}
                disabled={startingSession}
              >
                <option value="">Select a Subject (Grouped by Year)…</option>
                {[1, 2, 3, 4].map((year) => {
                  const yearSubs = subjectsList.filter((s) => s.year === year);
                  if (yearSubs.length === 0) return null;
                  return (
                    <optgroup key={year} label={`Year ${year}`}>
                      {yearSubs.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>

            {goLiveError && (
              <div className="alert alert-error" style={{ padding: '0.5rem 0.75rem', fontSize: '0.82rem' }}>
                ⚠ {goLiveError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setGoLiveModalPastSession(null)}
                disabled={startingSession}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleStartPastSessionGoLive}
                disabled={startingSession || !selectedSubjectId}
                id="modal-start-past-live-btn"
                style={{
                  background: 'linear-gradient(135deg, #10B981, #059669)',
                  border: 'none',
                  fontWeight: 700,
                }}
              >
                {startingSession ? (
                  <><span className="spinner spinner--sm" style={{ borderTopColor: '#fff' }} /> Starting…</>
                ) : (
                  '🚀 Start Live Session'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Draft In-UI Confirmation Modal */}
      {deleteConfirmDraft && (
        <div
          className="modal-backdrop"
          style={{ zIndex: 1100 }}
          onClick={() => !actionLoadingId && setDeleteConfirmDraft(null)}
        >
          <div
            className="modal-content"
            style={{ maxWidth: '440px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#EF4444',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.25rem',
                }}
              >
                🗑️
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Delete Quiz Draft</h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>This action cannot be undone.</div>
              </div>
            </div>

            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 1.25rem' }}>
              Are you sure you want to delete <strong>&ldquo;{deleteConfirmDraft.title}&rdquo;</strong>? Past classroom sessions that used this quiz will keep their question history intact.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteConfirmDraft(null)}
                disabled={Boolean(actionLoadingId)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: '#EF4444', borderColor: '#DC2626', color: '#fff' }}
                onClick={handleConfirmDelete}
                disabled={Boolean(actionLoadingId)}
                id="confirm-delete-draft-btn"
              >
                {actionLoadingId === deleteConfirmDraft.id ? (
                  <><span className="spinner spinner--sm" style={{ borderTopColor: '#fff' }} /> Deleting…</>
                ) : (
                  'Delete Draft'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
