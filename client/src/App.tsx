import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import HostPage from './pages/HostPage';
import JoinPage from './pages/JoinPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/host" element={<HostPage />} />
        <Route path="/join" element={<JoinPage />} />
        {/* Landing: redirect to /host */}
        <Route path="/" element={<Navigate to="/host" replace />} />
        <Route path="*" element={<Navigate to="/host" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
