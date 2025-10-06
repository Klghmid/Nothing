import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const success = await login(username, password);
    if (!success) {
      setError('Invalid username or password');
    }
    setLoading(false);
  };

  return (
    <div className="login-container">
      <div className="terminal-card" style={{ maxWidth: '400px', margin: '2rem auto' }}>
        <div className="terminal-header">
          <h1 className="terminal-title">TERMINAL SOCIAL</h1>
          <p className="terminal-subtitle">Login to access the matrix</p>
        </div>
        
        <form onSubmit={handleSubmit} style={{ padding: '2rem' }}>
          {error && <div className="error">{error}</div>}
          
          <div className="form-group">
            <label className="form-label">Username:</label>
            <input
              type="text"
              className="terminal-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Password:</label>
            <input
              type="password"
              className="terminal-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>
          
          <button
            type="submit"
            className="terminal-btn primary"
            disabled={loading}
            style={{ width: '100%', marginTop: '1rem' }}
          >
            {loading ? 'CONNECTING...' : 'LOGIN'}
          </button>
          
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <p style={{ color: '#00aa00', marginBottom: '0.5rem' }}>
              Don't have an account?
            </p>
            <Link to="/register" className="terminal-btn" style={{ textDecoration: 'none' }}>
              REGISTER
            </Link>
          </div>
          
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <Link to="/admin" className="terminal-btn" style={{ textDecoration: 'none', fontSize: '0.9rem' }}>
              ADMIN PANEL
            </Link>
          </div>
        </form>
      </div>
      
      <div style={{ textAlign: 'center', marginTop: '2rem', color: '#00aa00' }}>
        <p>Default admin credentials: admin / admin123</p>
      </div>
    </div>
  );
};

export default Login;