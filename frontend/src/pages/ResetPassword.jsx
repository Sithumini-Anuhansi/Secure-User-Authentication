import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';

const ResetPassword = () => {
  const { token } = useParams();
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res = await api.post(`/auth/reset-password/${token}`, { password });
      setMessage(res.data.message);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.response?.data?.message || 'Reset link is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>Reset Password</h2>
        {error && <div className="error-banner">{error}</div>}
        {message && <div className="success-banner">{message}</div>}
        <label>New Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        <button type="submit" disabled={loading}>{loading ? 'Resetting...' : 'Reset Password'}</button>
        <p className="switch-link"><Link to="/login">Back to login</Link></p>
      </form>
    </div>
  );
};

export default ResetPassword;
