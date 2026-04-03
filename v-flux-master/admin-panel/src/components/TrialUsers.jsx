import { useState, useEffect } from 'react';
import { fetchTrialUsers } from '../api/admin';

const formatBytes = (bytes) => {
  const n = Number(bytes);
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 ** 3) return (n / 1024 ** 2).toFixed(1) + ' MB';
  return (n / 1024 ** 3).toFixed(2) + ' GB';
};

const formatDate = (d) => d ? new Date(d).toLocaleDateString('ru-RU') : '—';
const formatDateTime = (d) => d ? new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export default function TrialUsers() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = async (p) => {
    setLoading(true);
    try {
      const res = await fetchTrialUsers(p);
      setData(res.data);
    } catch {
      console.error('Failed to load trial users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(page); }, [page]);

  if (loading && !data) return <div className="loading">Loading...</div>;

  return (
    <div className="paid-users">
      <div className="paid-header">
        <h2 className="section-title">Trial Users ({data?.total || 0})</h2>
      </div>

      <div className="table-wrap">
        <table className="paid-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Source</th>
              <th>Started</th>
              <th>Expires</th>
              <th>Traffic</th>
              <th>Status</th>
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
                <td><span className="source-tag">{u.source || 'organic'}</span></td>
                <td>{formatDateTime(u.started_at)}</td>
                <td>{formatDate(u.expires_at)}</td>
                <td>{formatBytes(u.traffic_used)} / {formatBytes(u.traffic_limit)}</td>
                <td>
                  {u.throttled
                    ? <span className="badge badge-red">Throttled</span>
                    : <span className="badge badge-green">Active</span>
                  }
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
