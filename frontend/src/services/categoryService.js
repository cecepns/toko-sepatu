import api from './api';

export const categoryService = {
  list: (params) => api.get('/api/categories', { params }).then((r) => r.data),
  create: (body) => api.post('/api/categories', body).then((r) => r.data),
  update: (id, body) => api.put(`/api/categories/${id}`, body).then((r) => r.data),
  remove: (id) => api.delete(`/api/categories/${id}`).then((r) => r.data),
};
