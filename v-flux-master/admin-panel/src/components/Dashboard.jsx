import { useState, useEffect } from 'react';
import NodeCard from './NodeCard';
import { fetchNodeStats } from '../api/admin';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const loadData = async () => {
  try {
    setError(null);
    const statsRes = await fetchNodeStats();
    setStats(statsRes.data);
    setLastUpdate(new Date());
  // eslint-disable-next-line no-unused-vars
  } catch (err) {
    setError('Failed to load data');
  } finally {
    setLoading(false);
  }
};

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    window.location.reload();
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return (
    <div className="error-screen">
      <div>{error}</div>
      <button onClick={loadData} className="retry-btn">Retry</button>
    </div>
  );

  const totalOnline = (stats?.nodes || []).reduce((s, n) => s + (n.users_online || 0), 0);
  const totalConns = (stats?.nodes || []).reduce((s, n) => s + (n.total_connections || 0), 0);
  const totalThrottled = (stats?.nodes || []).reduce((s, n) => s + (n.online_details || []).filter((u) => u.throttled).length, 0);

  return (
    <div className="dashboard">
      <div className="dash-header">
        <div className="dash-title">V-FLUX Admin</div>
        <div className="dash-actions">
          {lastUpdate && <span className="last-upd">{lastUpdate.toLocaleTimeString()}</span>}
          <button onClick={loadData} className="btn-refresh">Refresh</button>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </div>

      <div className="cards-row">
        <div className="card"><div className="card-val">{stats?.db?.total_users || 0}</div><div className="card-lbl">Users</div></div>
        <div className="card green"><div className="card-val">{totalOnline}</div><div className="card-lbl">Online</div></div>
        <div className="card"><div className="card-val">{stats?.db?.active_subscriptions || 0}</div><div className="card-lbl">Active Subs</div></div>
        
        <div className="card"><div className="card-val">{totalConns}</div><div className="card-lbl">Connections</div></div>
        <div className="card"><div className="card-val">{(stats?.nodes || []).length}</div><div className="card-lbl">Nodes</div></div>
        <div className="card"><div className="card-val">{totalThrottled}</div><div className="card-lbl">Throttled</div></div>
      </div>

      <h2 className="section-title">Nodes</h2>
      <div className="nodes-grid">
        {(stats?.nodes || []).map((node) => <NodeCard key={node.id} node={node} />)}
      </div>

    </div>
  );
}