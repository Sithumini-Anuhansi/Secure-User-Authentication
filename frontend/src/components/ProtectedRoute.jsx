import { Navigate } from 'react-router-dom';

// Guards a route by checking for a stored auth token.
// If no token exists, the user is redirected to /login.
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('accessToken');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

export default ProtectedRoute;
