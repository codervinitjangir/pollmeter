import { useState } from 'react';
import { AuthUser, verifyMentorPin } from '../auth';

interface Props {
  isOpen: boolean;
  currentUser: AuthUser | null;
  onSuccess: (updatedUser: AuthUser) => void;
  onCancel: () => void;
}

export default function MentorPinModal({
  isOpen,
  currentUser,
  onSuccess,
  onCancel,
}: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pin.trim()) {
      setError('Please enter the security PIN.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const data = await verifyMentorPin(pin.trim());
      onSuccess(data.user);
    } catch (err) {
      setError((err as Error).message || 'Invalid passcode.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pm-auth-modal-backdrop">
      <div className="pm-auth-modal-card pm-pin-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="pm-auth-header">
          <div className="pm-auth-badge">
            <span className="pm-auth-badge-icon">🛡️</span>
            <span>Faculty Verification</span>
          </div>
          <h2 className="pm-auth-title">Mentor Security Access</h2>
          <p className="pm-auth-subtitle">
            Enter the Faculty Passcode to unlock quiz hosting and student tracking privileges for{' '}
            <strong>{currentUser?.email}</strong>.
          </p>
        </div>

        {error && (
          <div className="pm-auth-error-alert" role="alert">
            <span className="pm-auth-error-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="pm-auth-form">
          <div className="pm-auth-field">
            <label htmlFor="mentor-pin-input">Faculty Passcode</label>
            <div className="pm-auth-input-wrapper">
              <input
                id="mentor-pin-input"
                type="password"
                placeholder="Enter PIN (e.g. medhavi2026)"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError('');
                }}
                disabled={loading}
                autoFocus
                required
              />
              <span className="pm-auth-input-icon">🔑</span>
            </div>
          </div>

          <div className="pm-pin-modal-actions">
            <button
              type="button"
              className="pm-pin-cancel-btn"
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="pm-auth-submit-btn"
              disabled={loading}
              id="verify-pin-submit-btn"
            >
              {loading ? 'Verifying...' : 'Unlock Mentor Mode →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
