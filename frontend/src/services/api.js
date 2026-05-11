import axios from 'axios';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'https://api-inventory.isavralabel.com/pos-multicabang').replace(/\/$/, '');

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => {
    const d = res.data;
    if (d && d.success === false) {
      return Promise.reject(new Error(d.message || 'Request gagal'));
    }
    return res;
  },
  (err) => {
    const msg = err.response?.data?.message || err.message || 'Request gagal';
    return Promise.reject(new Error(msg));
  }
);

export default api;
