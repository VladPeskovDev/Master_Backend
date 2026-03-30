import LoginForm from './components/LoginForm';
import Dashboard from './components/Dashboard';
import PaidUsers from './components/PaidUsers';
import { useState } from 'react';
import './App.css';

export default function App() {
  const [authed, setAuthed] = useState(() => !!localStorage.getItem('admin_token'));
  const [tab, setTab] = useState('dashboard');

  if (!authed) return <LoginForm onLogin={() => setAuthed(true)} />;

  return (
    <div>
      <div className="tab-bar">
        <button className={'tab-btn' + (tab === 'dashboard' ? ' active' : '')} onClick={() => setTab('dashboard')}>Dashboard</button>
        <button className={'tab-btn' + (tab === 'paid' ? ' active' : '')} onClick={() => setTab('paid')}>Paid Users</button>
      </div>
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'paid' && <PaidUsers />}
    </div>
  );
}
