import api from './api';

export const dashboardService = {
  /** Params opsional: today_branch_id, today_cashier_id (filter blok omset hari ini) */
  summary: (params) => api.get('/api/dashboard/summary', { params }).then((r) => r.data),
};
