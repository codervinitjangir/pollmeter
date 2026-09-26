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
  fetchBatches,
  fetchAdminAuditLogs,
  AuditLogItem,
  isAdminEmail,
  refreshAuthUser,
} from '../auth';
import CollegeAuthModal from '../components/CollegeAuthModal';
import { getActiveTheme, toggleTheme, Theme } from '../theme';

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
  const [adminTheme, setAdminTheme] = useState<Theme>(getActiveTheme());

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', adminTheme);
  }, [adminTheme]);

  // Core Data
  const [overview, setOverview] = useState<UniversityOverview | null>(null);
  const [facultyList, setFacultyList] = useState<FacultyMember[]>([]);
  const [studentAudit, setStudentAudit] = useState<StudentAuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'faculty' | 'students' | 'quizzes' | 'audit'>('faculty');
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

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
  const [formBatches, setFormBatches] = useState<string[]>([]);
  const [standardBatches, setStandardBatches] = useState<string[]>([
    '1st Year - Batch A',
    '1st Year - Batch B',
    '1st Year - Batch C',
    '2nd Year - Batch A',
    '2nd Year - Batch B',
    '2nd Year - Batch C',
    '3rd Year - Batch A',
  ]);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const [rechecking, setRechecking] = useState(false);

  // Synchronize and auto-resolve admin privileges on mount
  useEffect(() => {
    const current = getAuthUser();
    if (current && isAdminEmail(current.email) && current.role !== 'admin') {
      current.role = 'admin';
      setAuthUser({ ...current });
    }
    refreshAuthUser().then((synced) => {
      if (synced) {
        setAuthUser({ ...synced });
      }
    });
  }, []);

  const handleRecheckPrivileges = async () => {
    setRechecking(true);
    try {
      const refreshed = await refreshAuthUser();
      if (refreshed) {
        setAuthUser({ ...refreshed });
        if (refreshed.role === 'admin') {
          showToast('Administrator privileges verified and active!');
        } else {
          showToast(`Account confirmed with role: ${refreshed.role.toUpperCase()}`);
        }
      }
    } finally {
      setRechecking(false);
    }
  };

  // Fetch batches on mount
  useEffect(() => {
    fetchBatches()
      .then((b) => {
        if (b && b.length > 0) setStandardBatches(b);
      })
      .catch(() => {});
  }, []);

  const toggleFormBatch = (b: string) => {
    setFormBatches((prev) =>
      prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]
    );
  };

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
    setFormBatches(['1st Year - Batch A', '1st Year - Batch B']);
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
    setFormBatches(f.batches && f.batches.length > 0 ? f.batches : []);
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
        batches: formBatches,
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
      <div className="pm-admin-gateway-page">
        <header className="pm-gateway-header">
          <div className="pm-gateway-header-left">
            <div className="pm-admin-crest">
              <span style={{ fontSize: '1.25rem' }}>🏛️</span>
            </div>
            <div>
              <span className="pm-gateway-header-title">Medhavi Skills University</span>
              <span className="pm-gateway-header-sub">Central Institutional Administration</span>
            </div>
          </div>
          <div className="pm-gateway-header-right">
            <span className="pm-gateway-status-pill">● SECURE ACADEMIC GATEWAY</span>
            <button
              className="pm-theme-toggle-btn"
              onClick={() => setAdminTheme(toggleTheme())}
              title="Toggle Theme"
            >
              {adminTheme === 'dark' ? '☀️ Light' : '🌙 Dark'}
            </button>
            <button className="pm-gateway-nav-btn" onClick={() => navigate('/')}>
              ← Campus Home
            </button>
          </div>
        </header>

        <div className="pm-gateway-container">
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

          <div className="pm-gateway-card">
            <div className="pm-gateway-emblem-wrap">
              <div className="pm-gateway-emblem-glow"></div>
              <div className="pm-gateway-emblem">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="3" ry="3" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
            </div>

            <div className="pm-gateway-clearance-pill">
              <span>SECURITY PROTOCOL · TIER 4 ACADEMIC CLEARANCE</span>
            </div>

            <h1 className="pm-gateway-title">University Administration Portal</h1>
            <p className="pm-gateway-desc">
              Institutional governance of faculty rosters, departmental syllabi, cross-cohort performance analytics, and audit logging requires verified Super-Admin credentials.
            </p>

            <div className="pm-gateway-notice-box">
              <div className="pm-gateway-notice-icon">🛡️</div>
              <div className="pm-gateway-notice-text">
                <strong>Official University Tenant Only</strong>
                <span>Authentication is restricted to verified <code>@medhaviskillsuniversity.edu.in</code> credentials.</span>
              </div>
            </div>

            <div className="pm-gateway-actions">
              <button
                className="pm-btn-gateway-primary"
                onClick={() => setShowAuthModal(true)}
                id="btn-admin-signin"
              >
                <span>🔐 Authenticate with University ID</span>
              </button>
              <button
                className="pm-btn-gateway-secondary"
                onClick={() => navigate('/dashboard')}
              >
                Launch Mentor Studio
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Guard: Signed in but not an Admin ─────────────────────────────────────
  if (authUser.role !== 'admin') {
    const isKnownAdmin = isAdminEmail(authUser.email);

    return (
      <div className="pm-admin-gateway-page">
        <header className="pm-gateway-header">
          <div className="pm-gateway-header-left">
            <div className="pm-admin-crest">
              <span style={{ fontSize: '1.25rem' }}>🏛️</span>
            </div>
            <div>
              <span className="pm-gateway-header-title">Medhavi Skills University</span>
              <span className="pm-gateway-header-sub">Central Institutional Administration</span>
            </div>
          </div>
          <div className="pm-gateway-header-right">
            <span className="pm-gateway-status-pill pm-status-restricted">● CLEARANCE REQUIRED</span>
            <button
              className="pm-theme-toggle-btn"
              onClick={() => setAdminTheme(toggleTheme())}
              title="Toggle Theme"
            >
              {adminTheme === 'dark' ? '☀️ Light' : '🌙 Dark'}
            </button>
            <button className="pm-gateway-nav-btn" onClick={() => navigate('/dashboard')}>
              ⚡ Mentor Studio →
            </button>
          </div>
        </header>

        <div className="pm-gateway-container">
          <div className="pm-gateway-card">
            <div className="pm-gateway-emblem-wrap">
              <div className="pm-gateway-emblem-glow"></div>
              <div className="pm-gateway-emblem">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="M12 8v4" />
                  <path d="M12 16h.01" />
                </svg>
              </div>
            </div>

            <div className="pm-gateway-clearance-pill">
              <span>ACCESS RESTRICTION · ELEVATED PRIVILEGES REQUIRED</span>
            </div>

            <h1 className="pm-gateway-title">University Administrator Access Required</h1>
            <p className="pm-gateway-desc">
              Central faculty rosters, academic departments, course curricula, and campus-wide compliance audits are reserved for designated university administrators.
            </p>

            {/* Verified Identity Credential Box */}
            <div className="pm-gateway-identity-card">
              <div className="pm-gateway-identity-top">
                <div className="pm-gateway-avatar">
                  {authUser.realName.slice(0, 2).toUpperCase()}
                </div>
                <div className="pm-gateway-identity-details">
                  <div className="pm-gateway-name-row">
                    <strong>{authUser.realName}</strong>
                    <span className="pm-gateway-verified-badge">✓ MSU Verified</span>
                  </div>
                  <span className="pm-gateway-email">{authUser.email}</span>
                </div>
              </div>

              <div className="pm-gateway-identity-meta">
                <div className="pm-gateway-meta-item">
                  <span className="pm-gateway-meta-label">Current Role:</span>
                  <span className="pm-gateway-role-tag">{authUser.role.toUpperCase()}</span>
                </div>
                <div className="pm-gateway-meta-item">
                  <span className="pm-gateway-meta-label">Domain:</span>
                  <span className="pm-gateway-meta-val">medhaviskillsuniversity.edu.in</span>
                </div>
              </div>
            </div>

            {/* Dynamic notice if known admin email or standard mentor */}
            {isKnownAdmin ? (
              <div className="pm-gateway-alert-box pm-alert-sync">
                <span className="pm-alert-icon">⚡</span>
                <div className="pm-alert-content">
                  <strong>Registered Administrator Identity Detected</strong>
                  <p>Your institutional email matches the university administrator register. Click below to synchronize your active token.</p>
                </div>
              </div>
            ) : (
              <p className="pm-gateway-sub-note">
                Only appointed University Deans &amp; Institutional Super-Administrators may modify university faculty rosters or access raw audit records.
              </p>
            )}

            {/* Action Buttons */}
            <div className="pm-gateway-actions">
              {isKnownAdmin && (
                <button
                  className="pm-btn-gateway-primary"
                  onClick={handleRecheckPrivileges}
                  disabled={rechecking}
                  style={{ width: '100%' }}
                >
                  <span>{rechecking ? '🔄 Synchronizing Privileges...' : '⚡ Establish Administrator Session'}</span>
                </button>
              )}
              <div className="pm-gateway-actions-row">
                <button
                  className={isKnownAdmin ? "pm-btn-gateway-secondary" : "pm-btn-gateway-primary"}
                  onClick={() => navigate('/dashboard')}
                >
                  ⚡ Open Mentor Studio →
                </button>
                <button
                  className="pm-btn-gateway-secondary"
                  onClick={() => {
                    clearStoredAuth();
                    setAuthUser(null);
                    setShowAuthModal(true);
                  }}
                >
                  Switch University ID
                </button>
              </div>
            </div>
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
            className="pm-theme-toggle-btn"
            onClick={() => setAdminTheme(toggleTheme())}
            title="Toggle Dark / Light Theme"
            id="admin-theme-toggle-btn"
          >
            {adminTheme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
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

        {/* ─── Batch Distribution Cohort Pills ─────────────────────────────────── */}
        {overview?.batches && overview.batches.length > 0 && (
          <section className="pm-admin-subjects-section" style={{ marginTop: '0.65rem' }}>
            <span className="pm-subjects-heading">Active Academic Cohorts &amp; Batches:</span>
            <div className="pm-subject-tags-list">
              {overview.batches.map((b, i) => (
                <div key={i} className="pm-subject-pill" style={{ background: '#EEF2FF', borderColor: '#C7D2FE' }}>
                  <span className="pm-subject-dot" style={{ background: '#4F46E5' }} />
                  <strong>{b.batch}</strong>
                  <span className="pm-subject-count" style={{ background: '#E0E7FF', color: '#3730A3' }}>
                    {b.count} {b.count === 1 ? 'quiz' : 'quizzes'}
                  </span>
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
            <button
              className={`pm-admin-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('audit');
                setLoadingAudit(true);
                fetchAdminAuditLogs()
                  .then(setAuditLogs)
                  .catch(() => {})
                  .finally(() => setLoadingAudit(false));
              }}
            >
              <span>🛡️ Security &amp; Audit Trail</span>
              <span className="pm-tab-pill">{auditLogs.length || 'Logs'}</span>
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
                      <th>Assigned Batches</th>
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
                          <div className="pm-mentor-batches-cell">
                            {fac.batches && fac.batches.length > 0 ? (
                              fac.batches.map((b) => (
                                <span key={b} className="pm-batch-badge">
                                  {b}
                                </span>
                              ))
                            ) : (
                              <span style={{ color: '#94A3B8', fontSize: '0.8rem', fontStyle: 'italic' }}>
                                All Batches
                              </span>
                            )}
                          </div>
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
                      <th>Target Batch</th>
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
                          <span className="pm-batch-badge">🎓 {q.batch || 'General'}</span>
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

        {/* ─── TAB 4: Institutional Audit & Security Trail ─────────────────── */}
        {activeTab === 'audit' && (
          <section className="pm-admin-panel-card">
            <div className="pm-panel-header-row">
              <div>
                <h3>Institutional Compliance &amp; Security Audit Trail</h3>
                <p style={{ fontSize: '0.82rem', color: '#64748B', marginTop: '0.2rem' }}>
                  Permanent log of gradebook exports, live session creations, faculty promotions, and revocations
                </p>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setLoadingAudit(true);
                  fetchAdminAuditLogs()
                    .then(setAuditLogs)
                    .catch(() => {})
                    .finally(() => setLoadingAudit(false));
                }}
              >
                🔄 Refresh Logs
              </button>
            </div>

            {loadingAudit ? (
              <div className="pm-history-loading">
                <div className="pm-spinner" />
                <p>Loading security audit logs...</p>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="pm-history-empty">
                <span style={{ fontSize: '3rem' }}>🛡️</span>
                <h3>No audit events logged yet</h3>
                <p>When mentors launch sessions, export gradebooks, or admin modifies faculty, events appear here.</p>
              </div>
            ) : (
              <div className="pm-table-responsive">
                <table className="pm-admin-table">
                  <thead>
                    <tr>
                      <th>Event Action</th>
                      <th>Actor Identity</th>
                      <th>Target Entity</th>
                      <th>Event Metadata</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td>
                          <span
                            className={`pm-role-pill ${
                              log.action.includes('EXPORT')
                                ? 'pm-role-mentor'
                                : log.action.includes('REVOKE')
                                ? 'pm-role-admin'
                                : 'pm-badge-role'
                            }`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td>
                          <strong>{log.actorId}</strong>
                        </td>
                        <td>
                          <code>{log.targetId || '-'}</code>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                            {log.metadata ? JSON.stringify(log.metadata) : '-'}
                          </span>
                        </td>
                        <td>
                          <span className="pm-date-text">
                            {new Date(log.createdAt).toLocaleString()}
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
                <label className="pm-form-label">
                  Assigned Batches / Cohorts
                </label>
                <div className="pm-batch-checkbox-grid">
                  {standardBatches.map((b) => {
                    const checked = formBatches.includes(b);
                    return (
                      <label
                        key={b}
                        className={`pm-batch-checkbox-item ${checked ? 'checked' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleFormBatch(b)}
                        />
                        <span>{b}</span>
                      </label>
                    );
                  })}
                </div>
                <small className="pm-form-hint">
                  Mentors are isolated to hosting sessions and viewing gradebooks for their assigned batches.
                </small>
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
