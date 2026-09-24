import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';

// A lightweight, browser-only decode of the JWT payload (no
// signature verification needed here — this is purely to read the
// `family` claim so we can highlight "this device" in the list).
// Never use this pattern for anything security-sensitive.
const decodeJwtPayload = (token) => {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
};

const formatDate = (iso) => new Date(iso).toLocaleString();

// Very rough device/browser label from the User-Agent string — good
// enough for a human scanning a list, not meant to be precise.
const describeDevice = (userAgent = '') => {
  const ua = userAgent.toLowerCase();
  let os = 'Unknown OS';
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('mac os')) os = 'macOS';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';
  else if (ua.includes('linux')) os = 'Linux';

  let browser = 'Unknown browser';
  if (ua.includes('edg/')) browser = 'Edge';
  else if (ua.includes('chrome')) browser = 'Chrome';
  else if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('safari')) browser = 'Safari';

  return `${browser} on ${os}`;
};

const Sessions = () => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState(null);

  const currentFamily = decodeJwtPayload(localStorage.getItem('refreshToken') || '')?.family;

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const res = await api.get('/auth/sessions');
      setSessions(res.data.sessions);
    } catch (err) {
      setError('Failed to load sessions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleRevoke = async (id) => {
    setBusyId(id);
    setError('');
    try {
      await api.delete(`/auth/sessions/${id}`);
      setMessage('Session revoked.');
      fetchSessions();
    } catch (err) {
      setError('Could not revoke that session.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRevokeOthers = async () => {
    if (!window.confirm('Log out of every other device? This device will stay signed in.')) return;
    setError('');
    try {
      const res = await api.delete('/auth/sessions', { data: { currentFamily } });
      setMessage(res.data.message);
      fetchSessions();
    } catch (err) {
      setError('Could not revoke other sessions.');
    }
  };

  return (
    <div className="dashboard-container">
      <nav className="navbar">
        <h3>Active Sessions</h3>
        <Link to="/dashboard" className="switch-link" style={{ color: '#38bdf8' }}>← Back to Dashboard</Link>
      </nav>
      <div className="dashboard-content">
        <p style={{ color: '#94a3b8', marginBottom: '1rem' }}>
          Every device currently signed in to your account. If you don't recognize one, revoke it immediately.
        </p>

        {error && <div className="error-banner">{error}</div>}
        {message && <div className="success-banner">{message}</div>}

        {loading ? (
          <p>Loading sessions...</p>
        ) : (
          <>
            {sessions.length > 1 && (
              <button onClick={handleRevokeOthers} style={{ marginBottom: '1rem', background: '#ef4444', color: 'white', border: 'none', padding: '0.6rem 1rem', borderRadius: '8px', cursor: 'pointer' }}>
                Log out all other devices
              </button>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {sessions.map((s) => {
                const isCurrent = s.family === currentFamily;
                return (
                  <div key={s.id} className="profile-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontWeight: 600 }}>
                        {describeDevice(s.userAgent)}
                        {isCurrent && <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', background: '#38bdf8', color: '#0f172a', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>This device</span>}
                      </p>
                      <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.3rem' }}>
                        IP: {s.ip || 'unknown'} · Last active {formatDate(s.lastUsedAt)}
                      </p>
                      <p style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        Signed in {formatDate(s.createdAt)}
                      </p>
                    </div>
                    {!isCurrent && (
                      <button
                        onClick={() => handleRevoke(s.id)}
                        disabled={busyId === s.id}
                        style={{ background: '#ef4444', color: 'white', border: 'none', padding: '0.5rem 0.9rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}
                      >
                        {busyId === s.id ? 'Revoking...' : 'Log out'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Sessions;
