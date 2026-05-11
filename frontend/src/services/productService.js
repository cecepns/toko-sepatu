import api from './api';

export const productService = {
  list: (params) => api.get('/api/products', { params }).then((r) => r.data),
  get: (id) => api.get(`/api/products/${id}`).then((r) => r.data),
  create: (formData) =>
    api.post('/api/products', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
  update: (id, formData) =>
    api.put(`/api/products/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
  remove: (id) => api.delete(`/api/products/${id}`).then((r) => r.data),
};
