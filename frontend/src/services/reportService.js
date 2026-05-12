import api from './api';

export const reportService = {
  dailyOmset: (params) => api.get('/api/reports/daily-omset', { params }).then((r) => r.data),
  sales: (params) => api.get('/api/reports/sales', { params }).then((r) => r.data),
  pl: (params) => api.get('/api/reports/pl', { params }).then((r) => r.data),
  stock: (params) => api.get('/api/reports/stock', { params }).then((r) => r.data),
  bestsellers: (params) => api.get('/api/reports/bestsellers', { params }).then((r) => r.data),
  attendance: (params) => api.get('/api/reports/attendance', { params }).then((r) => r.data),
  dailyShift: (params) => api.get('/api/reports/daily-shift', { params }).then((r) => r.data),
  saveWalletSnapshot: (body) => api.put('/api/wallet-snapshots', body).then((r) => r.data),
  listWalletManualLines: (params) => api.get('/api/wallet-manual-lines', { params }).then((r) => r.data),
  addWalletManualLine: (body) => api.post('/api/wallet-manual-lines', body).then((r) => r.data),
  deleteWalletManualLine: (id) => api.delete(`/api/wallet-manual-lines/${id}`).then((r) => r.data),
  listWalletTopups: (params) => api.get('/api/wallet-topups', { params }).then((r) => r.data),
  addWalletTopup: (body) => api.post('/api/wallet-topups', body).then((r) => r.data),
  deleteWalletTopup: (id) => api.delete(`/api/wallet-topups/${id}`).then((r) => r.data),
};
