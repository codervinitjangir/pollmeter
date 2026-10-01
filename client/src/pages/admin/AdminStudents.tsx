import React, { useState, useEffect } from 'react';
import { searchStudentAudit } from '../../auth';
import { useAdminData } from './AdminContext';

export default function AdminStudents() {
  const {
    authUser,
    studentAudit,
    setStudentAudit,
    loading,
  } = useAdminData();

  const [studentSearch, setStudentSearch] = useState('');

  // Handle student audit search debounce
  useEffect(() => {
    if (!authUser || authUser.role !== 'admin') return;
    const timer = setTimeout(() => {
      searchStudentAudit(studentSearch)
        .then((data) => setStudentAudit(data))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [studentSearch, authUser, setStudentAudit]);

  return (
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
          <div className="spinner" />
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
  );
}
