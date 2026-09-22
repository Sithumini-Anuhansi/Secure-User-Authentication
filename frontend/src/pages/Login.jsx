import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';

const Login = () => {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', form);
      localStorage.setItem('accessToken', res.data.accessToken);
      localStorage.setItem('refreshToken', res.data.refreshToken);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      navigate('/dashboard');
    } catch (err) {
      // Account-lockout (423) and rate-limit (429) responses get their
      // own message from the server; surface it directly.
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>Welcome Back</h2>
        {error && <div className="error-banner">{error}</div>}
        <label>Email</label>
        <input type="email" name="email" value={form.email} onChange={handleChange} required />
        <label>Password</label>
        <input type="password" name="password" value={form.password} onChange={handleChange} required />
        <button type="submit" disabled={loading}>{loading ? 'Logging in...' : 'Login'}</button>
        <p className="switch-link"><Link to="/forgot-password">Forgot password?</Link></p>
        <p className="switch-link">Don't have an account? <Link to="/register">Register</Link></p>
      </form>
    </div>
  );
};

export default Login;
