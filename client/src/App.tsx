import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import HostPage from './pages/HostPage';
import JoinPage from './pages/JoinPage';
import LegalPage from './pages/LegalPage';
import AdminLayout from './pages/admin/AdminLayout';
import AdminFaculty from './pages/admin/AdminFaculty';
import AdminStudents from './pages/admin/AdminStudents';
import AdminQuizzes from './pages/admin/AdminQuizzes';
import AdminAuditLog from './pages/admin/AdminAuditLog';
import AdminBatches from './pages/admin/AdminBatches';
import AdminReports from './pages/admin/AdminReports';

import StudentDashboard from './pages/StudentDashboard';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing page */}
        <Route path="/" element={<LandingPage />} />

        {/* University Admin Console */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="faculty" replace />} />
          <Route path="faculty" element={<AdminFaculty />} />
          <Route path="students" element={<AdminStudents />} />
          <Route path="quizzes" element={<AdminQuizzes />} />
          <Route path="audit" element={<AdminAuditLog />} />
          <Route path="batches" element={<AdminBatches />} />
          <Route path="reports" element={<AdminReports />} />
        </Route>

        {/* Teacher dashboard */}
        <Route path="/dashboard" element={<HostPage />} />

        {/* Student portal & analytics dashboard */}
        <Route path="/student" element={<StudentDashboard />} />
        <Route path="/student/dashboard" element={<StudentDashboard />} />

        {/* Live quiz join arena */}
        <Route path="/join" element={<JoinPage />} />

        {/* Legal pages for Google OAuth compliance */}
        <Route path="/privacy" element={<LegalPage />} />
        <Route path="/terms" element={<LegalPage />} />

        {/* Fast join aliases */}
        <Route path="/play" element={<Navigate to="/join" replace />} />
        <Route path="/arena" element={<Navigate to="/join" replace />} />
        <Route path="/quiz" element={<Navigate to="/join" replace />} />
        <Route path="/host" element={<Navigate to="/dashboard" replace />} />
        <Route path="/polaris" element={<Navigate to="/dashboard" replace />} />
        <Route path="/faculty" element={<Navigate to="/dashboard" replace />} />
        <Route path="/mentor" element={<Navigate to="/dashboard" replace />} />
        <Route path="/teacher" element={<Navigate to="/dashboard" replace />} />

        {/* 404 → landing */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
