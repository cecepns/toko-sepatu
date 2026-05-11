import api from './api';

export const dashboardService = {
  summary: () => api.get('/api/dashboard/summary').then((r) => r.data),
};
