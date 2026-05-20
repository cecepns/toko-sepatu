import api from './api';

export const stockService = {
  list: (params) => api.get('/api/stock', { params }).then((r) => r.data),
  mutations: (params) => api.get('/api/stock-mutations', { params }).then((r) => r.data),
  adjust: (body) => api.post('/api/stock/adjust', body).then((r) => r.data),
};
