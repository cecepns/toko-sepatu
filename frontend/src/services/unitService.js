import api from './api';

export const unitService = {
  list: (params) => api.get('/api/units', { params }).then((r) => r.data),
  create: (body) => api.post('/api/units', body).then((r) => r.data),
  update: (id, body) => api.put(`/api/units/${id}`, body).then((r) => r.data),
  remove: (id) => api.delete(`/api/units/${id}`).then((r) => r.data),
};
