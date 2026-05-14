import api from './api';

export const userService = {
  list: (params) => api.get('/api/users', { params }).then((r) => r.data),
  roles: () => api.get('/api/roles').then((r) => r.data),
  create: (body) => api.post('/api/users', body).then((r) => r.data),
  update: (id, body) => api.put(`/api/users/${id}`, body).then((r) => r.data),
  remove: (id) => api.delete(`/api/users/${id}`).then((r) => r.data),
};
