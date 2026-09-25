import { Link, useLocation } from 'react-router-dom';

export default function LegalPage() {
  const { pathname } = useLocation();
  const isPrivacy = pathname.includes('privacy');

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', padding: '2rem 1rem', fontFamily: 'inherit', color: '#1E293B' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto', background: '#FFFFFF', padding: '2.5rem', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #E2E8F0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', color: '#1E40AF', fontWeight: 'bold', fontSize: '1.25rem' }}>
            <span>⚡</span>
            <span>PollMeter</span>
          </Link>
          <Link to="/" style={{ textDecoration: 'none', color: '#64748B', fontSize: '0.9rem', fontWeight: 600 }}>
            ← Back to Home
          </Link>
        </div>

        {isPrivacy ? (
          <div>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '1rem', color: '#0F172A' }}>Privacy Policy</h1>
            <p style={{ color: '#64748B', marginBottom: '1.5rem', fontSize: '0.95rem' }}>Last updated: September 2026</p>
            <p style={{ lineHeight: '1.7', marginBottom: '1rem' }}>
              PollMeter ("we", "our", or "us") provides a real-time classroom polling and live quiz platform. This Privacy Policy describes how we collect, use, and handle your information when you use our service.
            </p>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '1.5rem 0 0.5rem', color: '#1E293B' }}>1. Information We Collect</h2>
            <p style={{ lineHeight: '1.7', marginBottom: '1rem' }}>
              When you sign in using your college Google account (@medhaviskillsuniversity.edu.in), we access your basic public profile information: your official email address, display name, and profile avatar. We use this strictly to verify educational credentials and associate your quiz responses with your student identity.
            </p>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '1.5rem 0 0.5rem', color: '#1E293B' }}>2. How We Use Information</h2>
            <p style={{ lineHeight: '1.7', marginBottom: '1rem' }}>
              Your account details are used exclusively to provide classroom scoring, attendance verification, and past quiz performance history for you and your educators. We do not sell, rent, or share personal data with any third parties.
            </p>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '1.5rem 0 0.5rem', color: '#1E293B' }}>3. Data Retention</h2>
            <p style={{ lineHeight: '1.7', marginBottom: '1rem' }}>
              Quiz results and participant metrics are retained for educational performance tracking. You may contact your institutional administrator or the developer to request data deletion.
            </p>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '1.5rem 0 0.5rem', color: '#1E293B' }}>4. Contact</h2>
            <p style={{ lineHeight: '1.7', marginBottom: '1rem' }}>
              For inquiries regarding data privacy, contact the developer at <strong>djangir0090@gmail.com</strong>.
            </p>
          </div>
        ) : (
          <div>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '1rem', color: '#0F172A' }}>Terms of Service</h1>
            <p style={{ color: '#64748B', marginBottom: '1.5rem', fontSize: '0.95rem' }}>Last updated: September 2026</p>
            <p style={{ lineHeight: '1.7', marginBottom: '1rem' }}>
              By accessing or using PollMeter, you agree to comply with and be bound by these Terms of Service.
            </p>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '1.5rem 0 0.5rem', color: '#1E293B' }}>1. Educational Usage</h2>
            <p style={{ lineHeight: '1.7', marginBottom: '1rem' }}>
              PollMeter is designed for interactive learning, educational quizzes, and classroom assessments. Users must adhere to institutional codes of conduct and academic integrity.
            </p>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '1.5rem 0 0.5rem', color: '#1E293B' }}>2. Account Responsibility</h2>
            <p style={{ lineHeight: '1.7', marginBottom: '1rem' }}>
              Users are responsible for maintaining the confidentiality of their college login credentials and all activities occurring under their account.
            </p>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '1.5rem 0 0.5rem', color: '#1E293B' }}>3. Contact</h2>
            <p style={{ lineHeight: '1.7', marginBottom: '1rem' }}>
              Questions about these Terms may be directed to <strong>djangir0090@gmail.com</strong>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
