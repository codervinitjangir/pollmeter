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

        {/* Legacy redirect: keep /host working so old links don't break */}
        <Route path="/host" element={<Navigate to="/dashboard" replace />} />

        {/* 404 → landing */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
