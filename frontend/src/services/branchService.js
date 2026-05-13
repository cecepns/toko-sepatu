import api from './api';

export const branchService = {
  list: (params) => api.get('/api/branches', { params }).then((r) => r.data),
  create: (body) => api.post('/api/branches', body).then((r) => r.data),
  update: (id, body) => api.put(`/api/branches/${id}`, body).then((r) => r.data),
  remove: (id) => api.delete(`/api/branches/${id}`).then((r) => r.data),
};
