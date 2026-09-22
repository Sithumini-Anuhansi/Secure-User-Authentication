import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { email });
      setMessage(res.data.message);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>Forgot Password</h2>
        <p className="hint">We'll email you a reset link (mocked - check the backend server logs for the link during development).</p>
        {error && <div className="error-banner">{error}</div>}
        {message && <div className="success-banner">{message}</div>}
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <button type="submit" disabled={loading}>{loading ? 'Sending...' : 'Send Reset Link'}</button>
        <p className="switch-link"><Link to="/login">Back to login</Link></p>
      </form>
    </div>
  );
};

export default ForgotPassword;
