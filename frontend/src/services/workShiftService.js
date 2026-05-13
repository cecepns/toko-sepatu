import api from './api';

export const workShiftService = {
  list: (params) => api.get('/api/work-shifts', { params }).then((r) => r.data),
  create: (body) => api.post('/api/work-shifts', body).then((r) => r.data),
  update: (id, body) => api.put(`/api/work-shifts/${id}`, body).then((r) => r.data),
  remove: (id) => api.delete(`/api/work-shifts/${id}`).then((r) => r.data),
};
