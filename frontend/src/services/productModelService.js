import api from './api';

export const productModelService = {
  list: (params) => api.get('/api/product-models', { params }).then((r) => r.data),
  get: (id) => api.get(`/api/product-models/${id}`).then((r) => r.data),
  create: (formData) =>
    api.post('/api/product-models', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
  update: (id, formData) =>
    api.put(`/api/product-models/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
  remove: (id) => api.delete(`/api/product-models/${id}`).then((r) => r.data),
};

export const variantService = {
  list: (params) => api.get('/api/product-variants', { params }).then((r) => r.data),
  create: (body) => api.post('/api/product-variants', body).then((r) => r.data),
  update: (id, body) => api.put(`/api/product-variants/${id}`, body).then((r) => r.data),
  remove: (id) => api.delete(`/api/product-variants/${id}`).then((r) => r.data),
};
