import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import HostPage from './pages/HostPage';
import JoinPage from './pages/JoinPage';
import LegalPage from './pages/LegalPage';
import AdminPage from './pages/AdminPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing page */}
        <Route path="/" element={<LandingPage />} />

        {/* University Admin Console */}
        <Route path="/admin" element={<AdminPage />} />

        {/* Teacher dashboard */}
        <Route path="/dashboard" element={<HostPage />} />

        {/* Student join */}
        <Route path="/join" element={<JoinPage />} />

        {/* Legal pages for Google OAuth compliance */}
        <Route path="/privacy" element={<LegalPage />} />
        <Route path="/terms" element={<LegalPage />} />

        {/* Legacy & convenient redirects */}
        <Route path="/student" element={<Navigate to="/join" replace />} />
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
