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
export const fetchPaidUsers = (page = 1, limit = 20) => api.get('/users/paid?page=' + page + '&limit=' + limit);
export const fetchTrialUsers = (page = 1, limit = 20, source = '', hideUnused = false) => {
  let url = '/users/trial?page=' + page + '&limit=' + limit;
  if (source) url += '&source=' + source;
  if (hideUnused) url += '&hide_unused=1';
  return api.get(url);
};
export const fetchInactiveUsers = (type = 'expired_trial', page = 1, limit = 20) => api.get('/users/inactive?type=' + type + '&page=' + page + '&limit=' + limit);
export const throttleUser = (id) => api.post('/users/' + id + '/throttle');
export const unthrottleUser = (id) => api.post('/users/' + id + '/unthrottle');

export default api;