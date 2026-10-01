import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FacultyMember,
  addAdminFaculty,
  removeAdminFaculty,
  setFacultyApproval,
  isFacultyEmail,
  FACULTY_DOMAIN,
} from '../../auth';
import { useAdminData } from './AdminContext';
import { POPULAR_DEPARTMENTS, POPULAR_SUBJECTS } from './constants';

export default function AdminFaculty() {
  const {
    facultyList,
    standardBatches,
    loading,
    pendingCount,
    showToast,
    showConfirmDialog,
    loadAllData,
  } = useAdminData();

  const [searchParams, setSearchParams] = useSearchParams();

  // Search and filter state
  const [facultySearch, setFacultySearch] = useState('');
  const [facultyDeptFilter, setFacultyDeptFilter] = useState('all');
  const [facultyRoleFilter, setFacultyRoleFilter] = useState('all');

  // Modal State for Add / Edit Mentor
  const [isFacultyModalOpen, setIsFacultyModalOpen] = useState(false);
  const [editingFaculty, setEditingFaculty] = useState<FacultyMember | null>(null);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formDept, setFormDept] = useState(POPULAR_DEPARTMENTS[0]);
  const [formSubject, setFormSubject] = useState(POPULAR_SUBJECTS[0]);
  const [formRole, setFormRole] = useState<'mentor' | 'admin'>('mentor');
  const [formBatches, setFormBatches] = useState<string[]>([]);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const [approvingEmail, setApprovingEmail] = useState('');

  // Open modal for adding
  const handleOpenAdd = useCallback(() => {
    setEditingFaculty(null);
    setFormName('');
    setFormEmail('');
    setFormDept(POPULAR_DEPARTMENTS[0]);
    setFormSubject(POPULAR_SUBJECTS[0]);
    setFormRole('mentor');
    setFormBatches(['1st Year - Batch A', '1st Year - Batch B']);
    setModalError('');
    setIsFacultyModalOpen(true);
  }, []);

  // Check ?add=true query param to open modal automatically
  useEffect(() => {
    if (searchParams.get('add') === 'true') {
      handleOpenAdd();
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, handleOpenAdd]);

  // Filtered faculty list with department and role status filters
  const filteredFaculty = useMemo(() => {
    let list = facultyList;
    if (facultyDeptFilter !== 'all') {
      list = list.filter((f) => f.department === facultyDeptFilter);
    }
    if (facultyRoleFilter === 'admin') {
      list = list.filter((f) => f.role === 'admin');
    } else if (facultyRoleFilter === 'mentor') {
      list = list.filter((f) => f.role === 'mentor' && f.approved !== false);
    } else if (facultyRoleFilter === 'pending') {
      list = list.filter((f) => f.approved === false);
    }
    const q = facultySearch.toLowerCase().trim();
    if (!q) return list;
    return list.filter(
      (f) =>
        f.realName.toLowerCase().includes(q) ||
        f.email.toLowerCase().includes(q) ||
        (f.department && f.department.toLowerCase().includes(q)) ||
        (f.subject && f.subject.toLowerCase().includes(q))
    );
  }, [facultyList, facultySearch, facultyDeptFilter, facultyRoleFilter]);

  // Open modal for editing
  const handleOpenEdit = (f: FacultyMember) => {
    setEditingFaculty(f);
    setFormName(f.realName);
    setFormEmail(f.email);
    setFormDept(f.department || POPULAR_DEPARTMENTS[0]);
    setFormSubject(f.subject || POPULAR_SUBJECTS[0]);
    setFormRole(f.role === 'admin' ? 'admin' : 'mentor');
    setFormBatches(f.batches && f.batches.length > 0 ? f.batches : []);
    setModalError('');
    setIsFacultyModalOpen(true);
  };

  const toggleFormBatch = (b: string) => {
    setFormBatches((prev) =>
      prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]
    );
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

    if (!isFacultyEmail(cleanEmail)) {
      setModalError(`Faculty email must belong to official @${FACULTY_DOMAIN} domain.`);
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

  // Remove / Revoke Faculty with in-UI confirmation
  const handleRemoveFaculty = (email: string, name: string) => {
    showConfirmDialog({
      title: 'Revoke Faculty Privileges?',
      message: `Are you sure you want to revoke faculty mentor privileges for ${name} (${email})? Their role will revert to student access.`,
      confirmLabel: 'Revoke Privileges',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await removeAdminFaculty(email);
          showToast(`Revoked faculty privileges for ${name}`, 'success');
          await loadAllData();
        } catch (err: any) {
          showToast(err.message || 'Failed to revoke faculty member.', 'error');
        }
      },
    });
  };

  // Approve / revoke the faculty gate for an account that has already signed in
  const handleSetApproval = async (fac: FacultyMember, approve: boolean) => {
    if (!approve) {
      showConfirmDialog({
        title: 'Withdraw Faculty Approval?',
        message: `Withdraw faculty approval for ${fac.realName} (${fac.email})? They will drop back to student access and lose the ability to host quizzes.`,
        confirmLabel: 'Withdraw Approval',
        isDestructive: true,
        onConfirm: async () => {
          setApprovingEmail(fac.email);
          try {
            await setFacultyApproval(fac.email, false);
            showToast(`Withdrew faculty approval for ${fac.realName}`, 'success');
            await loadAllData();
          } catch (err: any) {
            showToast(err.message || 'Failed to update faculty approval.', 'error');
          } finally {
            setApprovingEmail('');
          }
        },
      });
      return;
    }

    setApprovingEmail(fac.email);
    try {
      await setFacultyApproval(fac.email, true);
      showToast(`Approved ${fac.realName} as faculty mentor`, 'success');
      await loadAllData();
    } catch (err: any) {
      showToast(err.message || 'Failed to update faculty approval.', 'error');
    } finally {
      setApprovingEmail('');
    }
  };

  return (
    <>
      <section className="pm-admin-panel-card">
        <div className="pm-panel-header-row">
          <div className="pm-panel-toolbar-left">
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

            <select
              className="pm-filter-select"
              value={facultyDeptFilter}
              onChange={(e) => setFacultyDeptFilter(e.target.value)}
              title="Filter by department"
            >
              <option value="all">🏢 All Departments</option>
              {POPULAR_DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>

            <select
              className="pm-filter-select"
              value={facultyRoleFilter}
              onChange={(e) => setFacultyRoleFilter(e.target.value)}
              title="Filter by role status"
            >
              <option value="all">👥 All Roles</option>
              <option value="mentor">🎓 Verified Mentors</option>
              <option value="admin">🏛️ Super-Admins</option>
              <option value="pending">⏳ Awaiting Approval ({pendingCount})</option>
            </select>
          </div>

          <div className="pm-panel-toolbar-right" style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <span className="pm-table-count">
              Showing <strong>{filteredFaculty.length}</strong> of <strong>{facultyList.length}</strong> faculty
            </span>
            <button
              className="pm-admin-add-btn"
              onClick={handleOpenAdd}
              style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem' }}
              id="admin-faculty-add-btn"
            >
              <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>+</span> Add Faculty Mentor
            </button>
          </div>
        </div>

        {pendingCount > 0 && (
          <div className="pm-pending-banner">
            <span className="pm-pending-banner-icon">⚠️</span>
            <div>
              <strong>
                {pendingCount} campus {pendingCount === 1 ? 'account has' : 'accounts have'} faculty privileges revoked
              </strong>
              <span>
                Domain-verified @{FACULTY_DOMAIN} accounts receive mentor access automatically upon login. Revoked accounts
                listed below are barred from hosting quizzes until an administrator re-approves them.
              </span>
            </div>
          </div>
        )}

        {loading ? (
          <div className="pm-history-loading">
            <div className="spinner" />
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
                          fac.role === 'admin'
                            ? 'pm-role-admin'
                            : fac.approved === false
                            ? 'pm-role-pending'
                            : 'pm-role-mentor'
                        }`}
                      >
                        {fac.role === 'admin'
                          ? '🏛️ Administrator'
                          : fac.approved === false
                          ? '⏳ Awaiting Approval'
                          : '🎓 Faculty Mentor'}
                      </span>
                    </td>
                    <td>
                      {fac.approved === false ? (
                        <span className="pm-status-pending">
                          <span className="pm-status-dot" /> Revoked — cannot host quizzes
                        </span>
                      ) : (
                        <span className="pm-status-verified">
                          <span className="pm-status-dot" /> Verified Faculty
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="pm-actions-row">
                        {fac.approved === false ? (
                          <button
                            className="pm-btn-icon-action pm-action-approve"
                            onClick={() => handleSetApproval(fac, true)}
                            disabled={approvingEmail === fac.email}
                            title="Grant faculty mentor privileges"
                          >
                            {approvingEmail === fac.email ? '⏳ Approving...' : '✓ Approve'}
                          </button>
                        ) : (
                          <button
                            className="pm-btn-icon-action"
                            onClick={() => handleOpenEdit(fac)}
                            title="Edit specialization and department"
                          >
                            ✏️ Edit
                          </button>
                        )}
                        {fac.role !== 'admin' && fac.approved !== false && (
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

      {/* ─── ADD / EDIT FACULTY MODAL ─── */}
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
                  Official College Email <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="email"
                  className="pm-input"
                  placeholder={`name@${FACULTY_DOMAIN}`}
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  required
                  disabled={Boolean(editingFaculty)}
                />
                <small className="pm-form-hint">
                  Must be an official institutional email (@{FACULTY_DOMAIN})
                </small>
              </div>

              <div className="pm-form-row">
                <div className="pm-form-group">
                  <label className="pm-form-label">Academic Department</label>
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

                <div className="pm-form-group">
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
    </>
  );
}
