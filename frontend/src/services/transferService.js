import api from './api';

export const transferService = {
  list: (params) => api.get('/api/stock-transfers', { params }).then((r) => r.data),
  get: (id) => api.get(`/api/stock-transfers/${id}`).then((r) => r.data),
  create: (body) => api.post('/api/stock-transfers', body).then((r) => r.data),
  approve: (id) => api.patch(`/api/stock-transfers/${id}/approve`).then((r) => r.data),
  reject: (id) => api.patch(`/api/stock-transfers/${id}/reject`).then((r) => r.data),
};
