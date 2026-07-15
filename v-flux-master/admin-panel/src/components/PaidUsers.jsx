import { useState, useEffect } from 'react';
import { fetchPaidUsers, throttleUser, unthrottleUser } from '../api/admin';

const formatBytes = (bytes) => {
  const n = Number(bytes);
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 ** 3) return (n / 1024 ** 2).toFixed(1) + ' MB';
  return (n / 1024 ** 3).toFixed(2) + ' GB';
};

const formatDate = (d) => d ? new Date(d).toLocaleDateString('ru-RU') : '—';

export default function PaidUsers() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  const load = async (p) => {
    setLoading(true);
    try {
      const res = await fetchPaidUsers(p);
      setData(res.data);
    } catch {
      console.error('Failed to load paid users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(page); }, [page]);

  const handleToggleThrottle = async (userId, isThrottled) => {
    setActionLoading(userId);
    try {
      if (isThrottled) {
        await unthrottleUser(userId);
      } else {
        await throttleUser(userId);
      }
      await load(page);
    } catch {
      console.error('Failed to toggle throttle');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading && !data) return <div className="loading">Loading...</div>;

  return (
    <div className="paid-users">
      <div className="paid-header">
        <h2 className="section-title">Paid Subscriptions ({data?.total || 0})</h2>
      </div>

      <div className="table-wrap">
        <table className="paid-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Registered</th>
              <th>Source</th>
              <th>Plan</th>
              <th>Method</th>
              <th>Purchased</th>
              <th>Expires</th>
              <th>Traffic</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {(data?.users || []).map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="user-cell">
                    <span className="user-name">{u.first_name || u.username || '—'}</span>
                    <span className="user-tg">@{u.username || u.telegram_id}</span>
                  </div>
                </td>
                <td>{formatDate(u.user_created_at)}</td>
                <td><span className="source-tag">{u.source || 'organic'}</span></td>
                <td>{u.plan}</td>
                <td><span className="method-tag">{u.method || '—'}</span></td>
                <td>{formatDate(u.started_at)}</td>
                <td>{formatDate(u.expires_at)}</td>
                <td>{formatBytes(u.traffic_used)} / {formatBytes(u.traffic_limit)}</td>
                <td>
                  {u.throttled
                    ? <span className="badge badge-red">Throttled</span>
                    : <span className="badge badge-green">Active</span>
                  }
                </td>
                <td>
                  <button
                    className={'action-btn' + (u.throttled ? ' btn-unthrottle' : ' btn-throttle')}
                    disabled={actionLoading === u.user_id}
                    onClick={() => handleToggleThrottle(u.user_id, u.throttled)}
                  >
                    {actionLoading === u.user_id ? '...' : u.throttled ? 'Unthrottle' : 'Throttle'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.pages > 1 && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
          <span>{page} / {data.pages}</span>
          <button disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
