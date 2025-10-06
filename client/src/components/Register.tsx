import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Register: React.FC = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setLoading(true);

    const success = await register(username, email, password, displayName);
    if (!success) {
      setError('Registration failed. Username or email may already exist.');
    }
    setLoading(false);
  };

  return (
    <div className="login-container">
      <div className="terminal-card" style={{ maxWidth: '400px', margin: '2rem auto' }}>
        <div className="terminal-header">
          <h1 className="terminal-title">TERMINAL SOCIAL</h1>
          <p className="terminal-subtitle">Join the matrix</p>
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
              placeholder="Choose a username"
              required
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Display Name:</label>
            <input
              type="text"
              className="terminal-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your display name"
              required
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Email:</label>
            <input
              type="email"
              className="terminal-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
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
              placeholder="Create a password (min 6 characters)"
              required
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Confirm Password:</label>
            <input
              type="password"
              className="terminal-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              required
            />
          </div>
          
          <button
            type="submit"
            className="terminal-btn primary"
            disabled={loading}
            style={{ width: '100%', marginTop: '1rem' }}
          >
            {loading ? 'CREATING ACCOUNT...' : 'REGISTER'}
          </button>
          
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <p style={{ color: '#00aa00', marginBottom: '0.5rem' }}>
              Already have an account?
            </p>
            <Link to="/login" className="terminal-btn" style={{ textDecoration: 'none' }}>
              LOGIN
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;