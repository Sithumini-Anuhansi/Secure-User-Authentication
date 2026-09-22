import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/axios';

const VerifyEmail = () => {
  const { token } = useParams();
  const [status, setStatus] = useState('verifying'); // verifying | success | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verify = async () => {
      try {
        const res = await api.get(`/auth/verify-email/${token}`);
        setStatus('success');
        setMessage(res.data.message);
      } catch (err) {
        setStatus('error');
        setMessage(err.response?.data?.message || 'Verification link is invalid or has expired.');
      }
    };
    verify();
  }, [token]);

  return (
    <div className="auth-container">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <h2>Email Verification</h2>
        {status === 'verifying' && <p>Verifying your email...</p>}
        {status === 'success' && <div className="success-banner">{message}</div>}
        {status === 'error' && <div className="error-banner">{message}</div>}
        <p className="switch-link"><Link to="/login">Back to login</Link></p>
      </div>
    </div>
  );
};

export default VerifyEmail;
