import axios from 'axios';

const api = axios.create({
  baseURL: '/api/admin',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = 'Bearer ' + token;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && (err.response.status === 401 || err.response.status === 403)) {
      localStorage.removeItem('admin_token');
      window.location.reload();
    }
    return Promise.reject(err);
  },
);

export const fetchNodeStats = () => api.get('/nodes/stats');
export const fetchUsers = () => api.get('/users');
export const fetchNodeUsers = (id) => api.get('/nodes/' + id + '/users');

export default api;