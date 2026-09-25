import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getAuthUser,
  clearStoredAuth,
  fetchAdminOverview,
  fetchAdminFaculty,
  addAdminFaculty,
  removeAdminFaculty,
  searchStudentAudit,
  AuthUser,
  FacultyMember,
  UniversityOverview,
  StudentAuditItem,
} from '../auth';
import CollegeAuthModal from '../components/CollegeAuthModal';

const POPULAR_DEPARTMENTS = [
  'School of Computing & Information Technology',
  'Department of Computer Science & Engineering',
  'Department of Data Science & AI',
  'School of Engineering & Technology',
  'School of Management & Entrepreneurship',
  'School of Design & Creative Media',
  'General Academics',
];

const POPULAR_SUBJECTS = [
  'Full Stack Web Development',
  'Operating Systems',
  'Data Structures & Algorithms',
  'Database Management Systems',
  'Computer Networks & Security',
  'Artificial Intelligence & ML',
  'Cloud Computing & DevOps',
  'Software Engineering & Agile',
  'UI/UX Design Systems',
  'General Technical Aptitude',
];

export default function AdminPage() {
  const navigate = useNavigate();
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => getAuthUser());
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Core Data
  const [overview, setOverview] = useState<UniversityOverview | null>(null);
  const [facultyList, setFacultyList] = useState<FacultyMember[]>([]);
  const [studentAudit, setStudentAudit] = useState<StudentAuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'faculty' | 'students' | 'quizzes'>('faculty');

  // Search queries
  const [facultySearch, setFacultySearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');

  // Modal State for Add / Edit Mentor
  const [isFacultyModalOpen, setIsFacultyModalOpen] = useState(false);
  const [editingFaculty, setEditingFaculty] = useState<FacultyMember | null>(null);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formDept, setFormDept] = useState(POPULAR_DEPARTMENTS[0]);
  const [formSubject, setFormSubject] = useState(POPULAR_SUBJECTS[0]);
  const [formRole, setFormRole] = useState<'mentor' | 'admin'>('mentor');
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  // Action status message
  const [toastMessage, setToastMessage] = useState('');

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  }

  // Load Admin Data
  const loadAllData = async () => {
    setLoading(true);
    setError('');
    try {
      const [ov, fac, stud] = await Promise.all([
        fetchAdminOverview(),
        fetchAdminFaculty(),
        searchStudentAudit(''),
      ]);
      setOverview(ov);
      setFacultyList(fac);
      setStudentAudit(stud);
    } catch (err: any) {
      console.error('[admin] load error:', err);
      setError(err.message || 'Failed to load university administration data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authUser) {
      setShowAuthModal(true);
      return;
    }
    if (authUser.role === 'admin') {
      loadAllData();
    }
  }, [authUser]);

  // Handle student audit search debounce
  useEffect(() => {
    if (!authUser || authUser.role !== 'admin') return;
    const timer = setTimeout(() => {
      searchStudentAudit(studentSearch)
        .then((data) => setStudentAudit(data))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [studentSearch, authUser]);

  // Filtered faculty list
  const filteredFaculty = useMemo(() => {
    const q = facultySearch.toLowerCase().trim();
    if (!q) return facultyList;
    return facultyList.filter(
      (f) =>
        f.realName.toLowerCase().includes(q) ||
        f.email.toLowerCase().includes(q) ||
        (f.department && f.department.toLowerCase().includes(q)) ||
        (f.subject && f.subject.toLowerCase().includes(q))
    );
  }, [facultyList, facultySearch]);

  // Open modal for adding
  const handleOpenAdd = () => {
    setEditingFaculty(null);
    setFormName('');
    setFormEmail('');
    setFormDept(POPULAR_DEPARTMENTS[0]);
    setFormSubject(POPULAR_SUBJECTS[0]);
    setFormRole('mentor');
    setModalError('');
    setIsFacultyModalOpen(true);
  };

  // Open modal for editing
  const handleOpenEdit = (f: FacultyMember) => {
    setEditingFaculty(f);
    setFormName(f.realName);
    setFormEmail(f.email);
    setFormDept(f.department || POPULAR_DEPARTMENTS[0]);
    setFormSubject(f.subject || POPULAR_SUBJECTS[0]);
    setFormRole(f.role);
    setModalError('');
    setIsFacultyModalOpen(true);
  };

  // Save Faculty Member
  const handleSaveFaculty = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');

    const cleanEmail = formEmail.trim().toLowerCase();
    const cleanName = formName.trim();

    if (!cleanName || !cleanEmail) {
      setModalError('Full Name and Official Email are required.');
      return;
    }

    if (!cleanEmail.includes('@medhaviskillsuniversity.edu.in') && !cleanEmail.includes('@medhaviskillsunivercity.edu.in')) {
      setModalError('Faculty email must belong to @medhaviskillsuniversity.edu.in domain.');
      return;
    }

    setModalSaving(true);
    try {
      await addAdminFaculty({
        email: cleanEmail,
        realName: cleanName,
        department: formDept,
        subject: formSubject,
        role: formRole,
      });

      showToast(`Faculty mentor ${cleanName} saved successfully!`);
      setIsFacultyModalOpen(false);
      await loadAllData();
    } catch (err: any) {
      setModalError(err.message || 'Failed to save faculty record.');
    } finally {
      setModalSaving(false);
    }
  };

  // Remove / Revoke Faculty
  const handleRemoveFaculty = async (email: string, name: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to revoke faculty mentor privileges for ${name} (${email})? Their role will revert to student.`
    );
    if (!confirmed) return;

    try {
      await removeAdminFaculty(email);
      showToast(`Revoked faculty privileges for ${name}`);
      await loadAllData();
    } catch (err: any) {
      alert(err.message || 'Failed to revoke faculty member.');
    }
  };

  // ─── Guard: Not signed in ──────────────────────────────────────────────────
  if (!authUser) {
    return (
      <div className="pm-admin-locked-page">
        <CollegeAuthModal
          isOpen={showAuthModal}
          title="Medhavi University Administrator Access"
          subtitle="Sign in with your Super-Admin college email to manage faculty and departments"
          onSuccess={(u) => {
            setAuthUser(u);
            setShowAuthModal(false);
          }}
          onClose={() => navigate('/dashboard')}
          roleHint="mentor"
        />
        <div className="pm-admin-locked-card">
          <span style={{ fontSize: '3rem' }}>🔐</span>
          <h2>University Administrator Authentication Required</h2>
          <p>Please authenticate with your official university credentials to enter the Admin Console.</p>
          <button className="btn btn-primary" onClick={() => setShowAuthModal(true)}>
            Sign In with University ID
          </button>
        </div>
      </div>
    );
  }

  // ─── Guard: Signed in but not an Admin ─────────────────────────────────────
  if (authUser.role !== 'admin') {
    return (
      <div className="pm-admin-locked-page">
        <div className="pm-admin-locked-card">
          <span style={{ fontSize: '3.5rem' }}>🛡️</span>
          <h2>University Administrator Access Required</h2>
          <p>
            You are signed in as <strong>{authUser.realName}</strong> ({authUser.email}) with role{' '}
            <span className="pm-badge-role">{authUser.role.toUpperCase()}</span>.
          </p>
          <p style={{ color: '#64748B', fontSize: '0.9rem' }}>
            Only designated university administrators (e.g. <code>vinit.p25@medhaviskillsuniversity.edu.in</code>)
            can manage faculty, departments, and cross-course analytics.
          </p>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.25rem' }}>
            <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
              Go to Mentor Workspace →
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                clearStoredAuth();
                setAuthUser(null);
                setShowAuthModal(true);
              }}
            >
              Switch Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main Admin Console ───────────────────────────────────────────────────
  return (
    <div className="pm-admin-layout">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="pm-admin-toast">
          <span>✅ {toastMessage}</span>
        </div>
      )}

      {/* Top Navigation Bar */}
      <header className="pm-admin-topbar">
        <div className="pm-admin-brand">
          <div className="pm-admin-crest">
            <span style={{ fontSize: '1.4rem' }}>🏛️</span>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="pm-admin-title">Medhavi Skills University</span>
              <span className="pm-badge-admin-seal">SUPER-ADMIN</span>
            </div>
            <span className="pm-admin-sub">Central Faculty Management &amp; Academic Analytics</span>
          </div>
        </div>

        <div className="pm-admin-topbar-actions">
          <button
            className="pm-btn-mentor-switch"
            onClick={() => navigate('/dashboard')}
            title="Launch live classroom quiz workspace as mentor"
          >
            <span>⚡ Switch to Mentor Host</span>
            <span style={{ fontSize: '1.1rem' }}>→</span>
          </button>

          <div className="pm-admin-profile">
            <div className="pm-admin-avatar">
              {authUser.realName.slice(0, 2).toUpperCase()}
            </div>
            <div className="pm-admin-profile-text">
              <strong>{authUser.realName}</strong>
              <small>{authUser.email}</small>
            </div>
            <button
              className="pm-admin-signout-btn"
              onClick={() => {
                clearStoredAuth();
                setAuthUser(null);
                navigate('/');
              }}
              title="Sign out of Admin Console"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="pm-admin-content">
        {/* Error Banner if any */}
        {error && (
          <div className="alert alert-error" style={{ marginBottom: '1.5rem' }}>
            <span>⚠️ {error}</span>
            <button className="btn btn-sm btn-ghost" onClick={loadAllData}>
              Retry
            </button>
          </div>
        )}

        {/* ─── Metric KPI Cards ──────────────────────────────────────────────── */}
        <section className="pm-admin-kpi-grid">
          <div className="pm-kpi-card pm-kpi-card-blue">
            <div className="pm-kpi-icon-wrap">
              <span>👨‍🏫</span>
            </div>
            <div className="pm-kpi-body">
              <span className="pm-kpi-label">Faculty Mentors</span>
              <div className="pm-kpi-val-row">
                <span className="pm-kpi-number">{overview?.totalMentors ?? facultyList.length}</span>
                <button className="pm-kpi-quick-action" onClick={handleOpenAdd}>
                  + Add Mentor
                </button>
              </div>
              <span className="pm-kpi-caption">Verified subject specialists</span>
            </div>
          </div>

          <div className="pm-kpi-card pm-kpi-card-emerald">
            <div className="pm-kpi-icon-wrap">
              <span>🎓</span>
            </div>
            <div className="pm-kpi-body">
              <span className="pm-kpi-label">Active Students</span>
              <span className="pm-kpi-number">{overview?.totalStudents ?? studentAudit.length}</span>
              <span className="pm-kpi-caption">Unified across all departments</span>
            </div>
          </div>

          <div className="pm-kpi-card pm-kpi-card-purple">
            <div className="pm-kpi-icon-wrap">
              <span>📝</span>
            </div>
            <div className="pm-kpi-body">
              <span className="pm-kpi-label">Quizzes Hosted</span>
              <span className="pm-kpi-number">{overview?.totalQuizzes ?? 0}</span>
              <span className="pm-kpi-caption">Classroom sessions conducted</span>
            </div>
          </div>

          <div className="pm-kpi-card pm-kpi-card-amber">
            <div className="pm-kpi-icon-wrap">
              <span>⚡</span>
            </div>
            <div className="pm-kpi-body">
              <span className="pm-kpi-label">Student Responses</span>
              <span className="pm-kpi-number">{overview?.totalResponses ?? 0}</span>
              <span className="pm-kpi-caption">Live interactions evaluated</span>
            </div>
          </div>
        </section>

        {/* ─── Subject Specialization Pills ──────────────────────────────────── */}
        {overview?.subjects && overview.subjects.length > 0 && (
          <section className="pm-admin-subjects-section">
            <span className="pm-subjects-heading">Active Academic Subjects &amp; Courses:</span>
            <div className="pm-subject-tags-list">
              {overview.subjects.map((sub, i) => (
                <div key={i} className="pm-subject-pill">
                  <span className="pm-subject-dot" />
                  <strong>{sub.subject}</strong>
                  <span className="pm-subject-count">{sub.count} {sub.count === 1 ? 'quiz' : 'quizzes'}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ─── Navigation Tabs ──────────────────────────────────────────────── */}
        <div className="pm-admin-tabs-bar">
          <div className="pm-admin-tabs">
            <button
              className={`pm-admin-tab-btn ${activeTab === 'faculty' ? 'active' : ''}`}
              onClick={() => setActiveTab('faculty')}
            >
              <span>👨‍🏫 Faculty &amp; Mentor Directory</span>
              <span className="pm-tab-pill">{facultyList.length}</span>
            </button>
            <button
              className={`pm-admin-tab-btn ${activeTab === 'students' ? 'active' : ''}`}
              onClick={() => setActiveTab('students')}
            >
              <span>🎓 University Student Audit</span>
              <span className="pm-tab-pill">{studentAudit.length}</span>
            </button>
            <button
              className={`pm-admin-tab-btn ${activeTab === 'quizzes' ? 'active' : ''}`}
              onClick={() => setActiveTab('quizzes')}
            >
              <span>📊 University Quiz Logs</span>
              <span className="pm-tab-pill">{overview?.recentQuizzes?.length ?? 0}</span>
            </button>
          </div>

          {activeTab === 'faculty' && (
            <button className="btn btn-primary pm-admin-add-btn" onClick={handleOpenAdd}>
              <span style={{ fontSize: '1.1rem' }}>+</span> Add Faculty Mentor
            </button>
          )}
        </div>

        {/* ─── TAB 1: Faculty Directory ─────────────────────────────────────── */}
        {activeTab === 'faculty' && (
          <section className="pm-admin-panel-card">
            <div className="pm-panel-header-row">
              <div className="pm-search-input-wrap">
                <span>🔍</span>
                <input
                  type="text"
                  placeholder="Search mentors by name, email, department, or subject..."
                  value={facultySearch}
                  onChange={(e) => setFacultySearch(e.target.value)}
                />
                {facultySearch && (
                  <button className="pm-search-clear" onClick={() => setFacultySearch('')}>
                    ✕
                  </button>
                )}
              </div>

              <span className="pm-table-count">
                Showing <strong>{filteredFaculty.length}</strong> faculty member
                {filteredFaculty.length === 1 ? '' : 's'}
              </span>
            </div>

            {loading ? (
              <div className="pm-history-loading">
                <div className="pm-spinner" />
                <p>Loading faculty roster...</p>
              </div>
            ) : filteredFaculty.length === 0 ? (
              <div className="pm-history-empty">
                <span style={{ fontSize: '3rem' }}>🔍</span>
                <h3>No faculty members match your query</h3>
                <p>Try searching with another keyword or click &quot;+ Add Faculty Mentor&quot; above.</p>
              </div>
            ) : (
              <div className="pm-table-responsive">
                <table className="pm-admin-table">
                  <thead>
                    <tr>
                      <th>Faculty Name &amp; Email</th>
                      <th>Department / School</th>
                      <th>Assigned Subject</th>
                      <th>Privilege Level</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFaculty.map((fac) => (
                      <tr key={fac.id || fac.email}>
                        <td>
                          <div className="pm-faculty-cell">
                            <div className="pm-faculty-avatar">
                              {fac.realName.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <strong className="pm-faculty-name">{fac.realName}</strong>
                              <span className="pm-faculty-email">{fac.email}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="pm-dept-text">
                            {fac.department || 'School of Computing & IT'}
                          </span>
                        </td>
                        <td>
                          <span className="pm-subject-badge">
                            {fac.subject || 'Full Stack Web Development'}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`pm-role-pill ${
                              fac.role === 'admin' ? 'pm-role-admin' : 'pm-role-mentor'
                            }`}
                          >
                            {fac.role === 'admin' ? '🏛️ Administrator' : '🎓 Faculty Mentor'}
                          </span>
                        </td>
                        <td>
                          <span className="pm-status-verified">
                            <span className="pm-status-dot" /> Verified Faculty
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="pm-actions-row">
                            <button
                              className="pm-btn-icon-action"
                              onClick={() => handleOpenEdit(fac)}
                              title="Edit specialization and department"
                            >
                              ✏️ Edit
                            </button>
                            {fac.role !== 'admin' && (
                              <button
                                className="pm-btn-icon-action pm-action-danger"
                                onClick={() => handleRemoveFaculty(fac.email, fac.realName)}
                                title="Revoke faculty privileges (demote to student)"
                              >
                                ✕ Revoke
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ─── TAB 2: University Student Audit ──────────────────────────────── */}
        {activeTab === 'students' && (
          <section className="pm-admin-panel-card">
            <div className="pm-panel-header-row">
              <div className="pm-search-input-wrap">
                <span>🔍</span>
                <input
                  type="text"
                  placeholder="Audit student by name or university email ID..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                />
                {studentSearch && (
                  <button className="pm-search-clear" onClick={() => setStudentSearch('')}>
                    ✕
                  </button>
                )}
              </div>

              <span className="pm-table-count">
                Showing <strong>{studentAudit.length}</strong> participating student
                {studentAudit.length === 1 ? '' : 's'}
              </span>
            </div>

            {loading ? (
              <div className="pm-history-loading">
                <div className="pm-spinner" />
                <p>Auditing cross-subject student records...</p>
              </div>
            ) : studentAudit.length === 0 ? (
              <div className="pm-history-empty">
                <span style={{ fontSize: '3rem' }}>🎯</span>
                <h3>No student records found</h3>
                <p>When students take live quizzes across any mentor&apos;s class, their scores appear here.</p>
              </div>
            ) : (
              <div className="pm-table-responsive">
                <table className="pm-admin-table">
                  <thead>
                    <tr>
                      <th>Student Name</th>
                      <th>College Email</th>
                      <th>Quizzes Attempted</th>
                      <th>Average Score</th>
                      <th>Last Active Session</th>
                      <th>University Standing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentAudit.map((s, idx) => {
                      const scoreClass =
                        s.avgScore >= 1200
                          ? 'pm-score-high'
                          : s.avgScore >= 700
                          ? 'pm-score-mid'
                          : 'pm-score-low';
                      return (
                        <tr key={s.email || idx}>
                          <td>
                            <strong className="pm-student-name">{s.realName}</strong>
                          </td>
                          <td>
                            <code className="pm-student-email">{s.email}</code>
                          </td>
                          <td>
                            <span className="pm-count-badge">
                              {s.quizCount} {s.quizCount === 1 ? 'quiz' : 'quizzes'}
                            </span>
                          </td>
                          <td>
                            <span className={`pm-score-pill ${scoreClass}`}>
                              {s.avgScore} pts
                            </span>
                          </td>
                          <td>
                            <span className="pm-date-text">
                              {s.lastQuizDate
                                ? new Date(s.lastQuizDate).toLocaleDateString()
                                : '—'}
                            </span>
                          </td>
                          <td>
                            <span className="pm-badge-standing">
                              {s.quizCount >= 3 ? '🌟 Regular Participant' : '🌱 Active Student'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ─── TAB 3: Recent University Quiz Logs ────────────────────────────── */}
        {activeTab === 'quizzes' && (
          <section className="pm-admin-panel-card">
            <div className="pm-panel-header-row">
              <h3>All Quizzes Hosted Across Departments</h3>
              <span className="pm-table-count">
                <strong>{overview?.recentQuizzes?.length ?? 0}</strong> recent sessions
              </span>
            </div>

            {!overview?.recentQuizzes || overview.recentQuizzes.length === 0 ? (
              <div className="pm-history-empty">
                <span style={{ fontSize: '3rem' }}>📋</span>
                <h3>No classroom quizzes logged yet</h3>
                <p>When faculty mentors launch and end quizzes, university audit records will populate here.</p>
              </div>
            ) : (
              <div className="pm-table-responsive">
                <table className="pm-admin-table">
                  <thead>
                    <tr>
                      <th>Session Code</th>
                      <th>Topic &amp; Title</th>
                      <th>Subject Specialization</th>
                      <th>Host Mentor</th>
                      <th>Students Attended</th>
                      <th>Questions</th>
                      <th>Date Hosted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.recentQuizzes.map((q: any) => (
                      <tr key={q.id}>
                        <td>
                          <span className="pm-session-code-pill">#{q.code}</span>
                        </td>
                        <td>
                          <strong className="pm-quiz-topic">{q.topic || 'Classroom Quiz'}</strong>
                        </td>
                        <td>
                          <span className="pm-subject-badge">{q.subject || 'General'}</span>
                        </td>
                        <td>
                          <div className="pm-mentor-meta">
                            <span>{q.hostName || 'Faculty Mentor'}</span>
                            <small>{q.hostEmail}</small>
                          </div>
                        </td>
                        <td>
                          <span className="pm-count-badge">
                            👥 {q.participantCount || 0}
                          </span>
                        </td>
                        <td>
                          <span>{q.questionCount || 0} Qs</span>
                        </td>
                        <td>
                          <span className="pm-date-text">
                            {new Date(q.createdAt).toLocaleDateString()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>

      {/* ─── Add / Edit Faculty Modal ────────────────────────────────────────── */}
      {isFacultyModalOpen && (
        <div className="pm-auth-modal-backdrop" onClick={() => setIsFacultyModalOpen(false)}>
          <div className="pm-admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="pm-admin-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.6rem' }}>👨‍🏫</span>
                <div>
                  <h3 className="pm-admin-modal-title">
                    {editingFaculty ? 'Edit Faculty Mentor' : 'Add University Faculty Mentor'}
                  </h3>
                  <p className="pm-admin-modal-sub">
                    Grant classroom hosting and subject gradebook access
                  </p>
                </div>
              </div>
              <button
                className="pm-auth-close-btn"
                onClick={() => setIsFacultyModalOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="pm-auth-error-alert" style={{ margin: '1rem 1.5rem 0' }}>
                <span>⚠️ {modalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveFaculty} className="pm-admin-modal-form">
              <div className="pm-form-group">
                <label className="pm-form-label">
                  Faculty Full Name <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  className="pm-input"
                  placeholder="e.g. Dr. Rajesh Sharma"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                />
              </div>

              <div className="pm-form-group">
                <label className="pm-form-label">
                  Official College Email ID <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="email"
                  className="pm-input"
                  placeholder="mentor.name@medhaviskillsuniversity.edu.in"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  disabled={Boolean(editingFaculty)}
                  required
                />
                <small className="pm-form-hint">
                  Must end with <code>@medhaviskillsuniversity.edu.in</code>
                </small>
              </div>

              <div className="pm-form-row">
                <div className="pm-form-group" style={{ flex: 1 }}>
                  <label className="pm-form-label">Department / School</label>
                  <select
                    className="pm-select"
                    value={formDept}
                    onChange={(e) => setFormDept(e.target.value)}
                  >
                    {POPULAR_DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pm-form-group" style={{ flex: 1 }}>
                  <label className="pm-form-label">Subject Specialization</label>
                  <select
                    className="pm-select"
                    value={formSubject}
                    onChange={(e) => setFormSubject(e.target.value)}
                  >
                    {POPULAR_SUBJECTS.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pm-form-group">
                <label className="pm-form-label">Privilege Level</label>
                <div className="pm-role-select-cards">
                  <label
                    className={`pm-role-select-card ${formRole === 'mentor' ? 'selected' : ''}`}
                    onClick={() => setFormRole('mentor')}
                  >
                    <input
                      type="radio"
                      name="role"
                      checked={formRole === 'mentor'}
                      onChange={() => setFormRole('mentor')}
                    />
                    <div>
                      <strong>Faculty Mentor</strong>
                      <p>Host classroom quizzes, view subject gradebook &amp; export attendance CSVs.</p>
                    </div>
                  </label>

                  <label
                    className={`pm-role-select-card ${formRole === 'admin' ? 'selected' : ''}`}
                    onClick={() => setFormRole('admin')}
                  >
                    <input
                      type="radio"
                      name="role"
                      checked={formRole === 'admin'}
                      onChange={() => setFormRole('admin')}
                    />
                    <div>
                      <strong>University Administrator</strong>
                      <p>Full Super-Admin: Manage all faculty, add subjects &amp; audit all students.</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="pm-modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsFacultyModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={modalSaving}
                >
                  {modalSaving ? 'Saving...' : editingFaculty ? 'Save Changes' : 'Add Faculty Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
