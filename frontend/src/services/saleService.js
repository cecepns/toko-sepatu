import api from './api';

export const saleService = {
  list: (params) => api.get('/api/sales', { params }).then((r) => r.data),
  get: (id) => api.get(`/api/sales/${id}`).then((r) => r.data),
  create: (body) => api.post('/api/sales', body).then((r) => r.data),
  printed: (id) => api.patch(`/api/sales/${id}/printed`).then((r) => r.data),
};
