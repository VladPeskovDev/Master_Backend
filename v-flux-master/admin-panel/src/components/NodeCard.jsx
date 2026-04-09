import { useState } from 'react';
import { fetchNodeUsers } from '../api/admin';

const parseSpeed = (str) => {
  if (!str) return 0;
  const num = parseFloat(str);
  if (str.includes('Gbps')) return num * 1000;
  if (str.includes('Mbps')) return num;
  if (str.includes('Kbps')) return num / 1000;
  return 0;
};

const formatBytes = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
};

export default function NodeCard({ node }) {
  const [users, setUsers] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showCount, setShowCount] = useState(20);

  const maxUsers = 250;
  const usersPct = Math.min((node.users_online / maxUsers) * 100, 100);
  const usersColor = usersPct < 40 ? '#10b981' : usersPct < 70 ? '#f59e0b' : '#ef4444';

  const speedRx = parseSpeed(node.current_speed_rx);
  const speedTx = parseSpeed(node.current_speed_tx);
  const totalSpeed = speedRx + speedTx;
  const bwPct = node.bandwidth_mbps ? Math.min((totalSpeed / node.bandwidth_mbps) * 100, 100) : 0;
  const bwColor = bwPct < 40 ? '#10b981' : bwPct < 70 ? '#f59e0b' : '#ef4444';

  const handleToggle = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetchNodeUsers(node.id);
      setUsers(res.data);
      setShowCount(20);
      setExpanded(true);
    } catch {
      console.error('Failed to load node users');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="node-card">
      <div className="node-header">
        <span className="node-name">{node.name}</span>
        <span className="node-location">{node.location}</span>
      </div>

      <div className="node-stats-grid">
        <div className="node-stat">
          <span className="stat-val">{node.users_online}</span>
          <span className="stat-lbl">Online</span>
        </div>
        <div className="node-stat">
          <span className="stat-val">{node.users_on_node}</span>
          <span className="stat-lbl">On Node</span>
        </div>
        <div className="node-stat">
          <span className="stat-val">{node.total_connections}</span>
          <span className="stat-lbl">Conns</span>
        </div>
      </div>

      <div className="node-bar-wrap">
        <div className="node-bar-info">
          <span>Users</span>
          <span>{node.users_online}/{maxUsers}</span>
        </div>
        <div className="bar-bg">
          <div className="bar-fill" style={{ width: usersPct + '%', background: usersColor }} />
        </div>
      </div>

      {node.bandwidth_mbps && (
        <div className="node-bar-wrap">
          <div className="node-bar-info">
            <span>Bandwidth</span>
            <span>{totalSpeed.toFixed(1)} / {node.bandwidth_mbps} Mbps ({bwPct.toFixed(1)}%)</span>
          </div>
          <div className="bar-bg">
            <div className="bar-fill" style={{ width: bwPct + '%', background: bwColor }} />
          </div>
        </div>
      )}

      <div className="node-speeds">
        <span className="speed-up">TX {node.current_speed_tx}</span>
        <span className="speed-down">RX {node.current_speed_rx}</span>
      </div>

      {node.cpu_load !== null && (
        <div className="node-bar-wrap">
          <div className="node-bar-info">
            <span>CPU</span>
            <span>{(node.cpu_load * 100).toFixed(0)}%</span>
          </div>
          <div className="bar-bg">
            <div className="bar-fill" style={{ width: (node.cpu_load * 100) + '%', background: node.cpu_load < 0.4 ? '#10b981' : node.cpu_load < 0.7 ? '#f59e0b' : '#ef4444' }} />
          </div>
        </div>
      )}

      {node.memory_total_bytes && node.memory_used_bytes && (
        <div className="node-bar-wrap">
          <div className="node-bar-info">
            <span>RAM</span>
            <span>{formatBytes(node.memory_used_bytes)} / {formatBytes(node.memory_total_bytes)}</span>
          </div>
          <div className="bar-bg">
            <div className="bar-fill" style={{ width: (node.memory_used_bytes / node.memory_total_bytes * 100) + '%', background: (node.memory_used_bytes / node.memory_total_bytes) < 0.4 ? '#10b981' : (node.memory_used_bytes / node.memory_total_bytes) < 0.7 ? '#f59e0b' : '#ef4444' }} />
          </div>
        </div>
      )}

      <div className="node-uptime">Uptime: {node.uptime}</div>

      <button onClick={handleToggle} className="node-users-btn" disabled={loading}>
        {loading ? 'Loading...' : expanded ? 'Hide Users' : 'Show Users'}
      </button>

      {expanded && users && (
        <div className="node-users-list">
          <div className="node-users-header">
            {users.online} online / {users.total} total
          </div>
          {users.users.slice(0, showCount).map((u) => (
            <div key={u.uuid} className={'user-row' + (u.online ? ' user-online' : '')}>
              <div className="user-row-top">
                <span className="user-name">{u.username || u.first_name || u.uuid.substring(0, 8)}</span>
                <span className="user-plan">{u.plan || 'No plan'}</span>
                <span className="user-indicators">
                  {u.throttled && <span className="throttle-dot" title="Throttled" />}
                  {u.online && <span className="online-dot" title="Online" />}
                </span>
              </div>
              <div className="user-row-bottom">
                <span>Traffic: {formatBytes(Number(u.traffic_used))} / {formatBytes(Number(u.traffic_limit))}</span>
                <span>{u.active_connections} conn</span>
                {u.expires_at && <span>Exp: {new Date(u.expires_at).toLocaleDateString()}</span>}
              </div>
            </div>
          ))}
          {users.users.length > showCount && (
            <button className="node-users-btn" onClick={() => setShowCount(showCount + 20)}>
              Show more ({users.users.length - showCount} remaining)
            </button>
          )}
        </div>
      )}
    </div>
  );
}