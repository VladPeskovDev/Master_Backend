import LoginForm from './components/LoginForm';
import Dashboard from './components/Dashboard';
import { useState } from 'react';
import './App.css';

export default function App() {
  const [authed, setAuthed] = useState(() => !!localStorage.getItem('admin_token'));

  if (!authed) return <LoginForm onLogin={() => setAuthed(true)} />;
  return <Dashboard />;
}