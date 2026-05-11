import api from './api';

export const authService = {
  login: (body) => api.post('/api/auth/login', body).then((r) => r.data),
  me: () => api.get('/api/auth/me').then((r) => r.data),
};
