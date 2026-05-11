import api from './api';

export const customerService = {
  list: (params) => api.get('/api/customers', { params }).then((r) => r.data),
  create: (body) => api.post('/api/customers', body).then((r) => r.data),
  update: (id, body) => api.put(`/api/customers/${id}`, body).then((r) => r.data),
  remove: (id) => api.delete(`/api/customers/${id}`).then((r) => r.data),
};
