import { useState } from 'react';

export default function LoginForm({ onLogin }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!token.trim()) { setError('Enter admin token'); return; }
    localStorage.setItem('admin_token', token.trim());
    onLogin();
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">V-FLUX</div>
        <div className="login-subtitle">Admin Panel</div>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={token}
            onChange={(e) => { setToken(e.target.value); setError(''); }}
            placeholder="Admin Token"
            className="login-input"
            autoFocus
          />
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="login-btn">Enter</button>
        </form>
      </div>
    </div>
  );
}