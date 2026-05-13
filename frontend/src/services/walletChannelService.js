import api from './api';

export const walletChannelService = {
  list: (params) => api.get('/api/wallet-channels', { params }).then((r) => r.data),
  create: (body) => api.post('/api/wallet-channels', body).then((r) => r.data),
  update: (id, body) => api.put(`/api/wallet-channels/${id}`, body).then((r) => r.data),
  listProducts: (params) => api.get('/api/wallet-channel-products', { params }).then((r) => r.data),
  createProduct: (body) => api.post('/api/wallet-channel-products', body).then((r) => r.data),
  updateProduct: (id, body) => api.put(`/api/wallet-channel-products/${id}`, body).then((r) => r.data),
  deleteProduct: (id) => api.delete(`/api/wallet-channel-products/${id}`).then((r) => r.data),
};
