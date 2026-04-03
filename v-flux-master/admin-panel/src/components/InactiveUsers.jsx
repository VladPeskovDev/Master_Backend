import { useState, useEffect } from 'react';
import { fetchInactiveUsers } from '../api/admin';

const formatBytes = (bytes) => {
  const n = Number(bytes);
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 ** 3) return (n / 1024 ** 2).toFixed(1) + ' MB';
  return (n / 1024 ** 3).toFixed(2) + ' GB';
};

const formatDate = (d) => d ? new Date(d).toLocaleDateString('ru-RU') : '—';

const showExpired = (type) => type === 'expired_trial' || type === 'expired_paid';

export default function InactiveUsers() {
  const [type, setType] = useState('expired_trial');
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = async (t, p) => {
    setLoading(true);
    try {
      const res = await fetchInactiveUsers(t, p);
      setData(res.data);
    } catch {
      console.error('Failed to load inactive users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setPage(1); load(type, 1); }, [type]);
  useEffect(() => { load(type, page); }, [page]);

  if (loading && !data) return <div className="loading">Loading...</div>;

  return (
    <div className="paid-users">
      <div className="paid-header">
        <h2 className="section-title">Inactive Users ({data?.total || 0})</h2>
      </div>

      <div className="sub-tabs">
        <button className={'sub-tab' + (type === 'expired_trial' ? ' active' : '')} onClick={() => setType('expired_trial')}>Expired Trial</button>
        <button className={'sub-tab' + (type === 'expired_paid' ? ' active' : '')} onClick={() => setType('expired_paid')}>Expired Paid</button>
        <button className={'sub-tab' + (type === 'no_sub' ? ' active' : '')} onClick={() => setType('no_sub')}>No Subscription</button>
      </div>

      <div className="table-wrap">
        <table className="paid-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Source</th>
              <th>Registered</th>
              {type === 'expired_paid' && <th>Plan</th>}
              {showExpired(type) && <th>Expired</th>}
              {showExpired(type) && <th>Traffic Used</th>}
            </tr>
          </thead>
          <tbody>
            {(data?.users || []).map((u, i) => (
              <tr key={u.user_id || i}>
                <td>
                  <div className="user-cell">
                    <span className="user-name">{u.first_name || u.username || '—'}</span>
                    <span className="user-tg">@{u.username || u.telegram_id}</span>
                  </div>
                </td>
                <td><span className="source-tag">{u.source || 'organic'}</span></td>
                <td>{formatDate(u.registered_at)}</td>
                {type === 'expired_paid' && <td>{u.plan}</td>}
                {showExpired(type) && <td>{formatDate(u.expires_at)}</td>}
                {showExpired(type) && <td>{formatBytes(u.traffic_used)} / {formatBytes(u.traffic_limit)}</td>}
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
