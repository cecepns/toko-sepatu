import api from './api';

export const resellerService = {
  list: (params) => api.get('/api/resellers', { params }).then((r) => r.data),
  create: (body) => api.post('/api/resellers', body).then((r) => r.data),
  update: (id, body) => api.put(`/api/resellers/${id}`, body).then((r) => r.data),
  remove: (id) => api.delete(`/api/resellers/${id}`).then((r) => r.data),
};
