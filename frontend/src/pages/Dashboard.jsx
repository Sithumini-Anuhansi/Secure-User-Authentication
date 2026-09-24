import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';

// This is the protected page — it only renders data returned by the
// /api/auth/profile endpoint, which requires a valid Bearer token.
const Dashboard = () => {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get('/auth/profile');
        setProfile(res.data.user);
      } catch (err) {
        setError('Session expired. Please log in again.');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        setTimeout(() => navigate('/login'), 1500);
      }
    };
    fetchProfile();
  }, [navigate]);

  const handleLogout = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    try {
      // Blacklists the current access token server-side and revokes
      // the refresh token, not just a client-side localStorage clear.
      await api.post('/auth/logout', { refreshToken });
    } catch (err) {
      // Even if the server call fails (e.g. token already expired),
      // still clear local state so the user isn't stuck.
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      navigate('/login');
    }
  };

  return (
    <div className="dashboard-container">
      <nav className="navbar">
        <h3>Secure Dashboard</h3>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Link to="/sessions" className="switch-link" style={{ color: '#38bdf8' }}>Active Sessions</Link>
          <button onClick={handleLogout}>Logout</button>
        </div>
      </nav>
      <div className="dashboard-content">
        {error && <div className="error-banner">{error}</div>}
        {profile ? (
          <div className="profile-card">
            <h2>Protected Data</h2>
            <p>This content is only visible because your request included a valid JWT.</p>
            <ul>
              <li><strong>Name:</strong> {profile.name}</li>
              <li><strong>Email:</strong> {profile.email}</li>
              <li><strong>User ID:</strong> {profile._id}</li>
              <li><strong>Verified:</strong> {profile.isVerified ? 'Yes' : 'No (check server logs for verification link)'}</li>
              <li><strong>Joined:</strong> {new Date(profile.createdAt).toLocaleString()}</li>
            </ul>
          </div>
        ) : (
          !error && <p>Loading profile...</p>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
