import api from './api';

export const attendanceService = {
  list: (params) => api.get('/api/attendances', { params }).then((r) => r.data),
  context: () => api.get('/api/attendances/context').then((r) => r.data),
  clockIn: (body) => api.post('/api/attendances/clock-in', body).then((r) => r.data),
  clockOut: (body) => api.post('/api/attendances/clock-out', body).then((r) => r.data),
};
