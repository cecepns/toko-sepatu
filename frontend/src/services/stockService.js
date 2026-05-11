import api from './api';

export const stockService = {
  central: (params) => api.get('/api/stock/central', { params }).then((r) => r.data),
  branch: (branchId, params) => api.get(`/api/stock/branch/${branchId}`, { params }).then((r) => r.data),
  mutations: (params) => api.get('/api/stock-mutations', { params }).then((r) => r.data),
};
