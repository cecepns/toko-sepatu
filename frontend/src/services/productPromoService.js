import api from './api';

export const productPromoService = {
  list: (params) => api.get('/api/product-promos', { params }).then((r) => r.data),
  create: (body) => api.post('/api/product-promos', body).then((r) => r.data),
  update: (id, body) => api.put(`/api/product-promos/${id}`, body).then((r) => r.data),
  remove: (id) => api.delete(`/api/product-promos/${id}`).then((r) => r.data),
  todayPopup: () => api.get('/api/product-promos/today-popup').then((r) => r.data),
};
