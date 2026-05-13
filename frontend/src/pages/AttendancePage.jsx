import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { MapPin, LogIn, LogOut } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { useServerTable } from '@/hooks/useServerTable';
import { attendanceService } from '@/services/attendanceService';
import { formatDate } from '@/utils/format';

function fmtTime(t) {
  if (!t) return '—';
  const s = String(t);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

export default function AttendancePage() {
  const fetcher = useCallback((p) => attendanceService.list(p), []);
  const t = useServerTable(fetcher);
  const [gps, setGps] = useState({ lat: '', lng: '' });
  const [ctx, setCtx] = useState(null);

  const loadCtx = useCallback(async () => {
    try {
      const res = await attendanceService.context();
      if (res.success) setCtx(res.data);
      else setCtx(null);
    } catch {
      setCtx(null);
    }
  }, []);

  useEffect(() => {
    loadCtx();
  }, [loadCtx]);

  const locate = () => {
    if (!navigator.geolocation) return toast.error('Browser tidak mendukung GPS');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGps({ lat: p.coords.latitude, lng: p.coords.longitude });
        toast.success('Lokasi diperbarui');
      },
      () => toast.error('Izin lokasi ditolak'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const clockIn = async () => {
    if (gps.lat === '' || gps.lng === '') return toast.error('Ambil lokasi terlebih dahulu');
    try {
      const res = await attendanceService.clockIn({ latitude: gps.lat, longitude: gps.lng });
      if (!res.success) throw new Error(res.message);
      toast.success(`Clock in — ${res.data.status}`);
      t.reload();
      loadCtx();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const clockOut = async () => {
    if (gps.lat === '' || gps.lng === '') return toast.error('Ambil lokasi terlebih dahulu');
    try {
      const res = await attendanceService.clockOut({ latitude: gps.lat, longitude: gps.lng });
      if (!res.success) throw new Error(res.message);
      toast.success('Clock out berhasil');
      t.reload();
      loadCtx();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const shift = ctx?.shift;
  const hasInactive = shift && shift.inactive;

  return (
    <div>
      <PageHeader title="Absensi" subtitle="Clock in/out dengan radius GPS cabang — waktu mengikuti shift Anda." />

      {ctx?.employee && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
          {hasInactive ? (
            <p className="font-medium text-amber-800">{shift.message}</p>
          ) : shift?.name ? (
            <div className="space-y-1">
              <p>
                <span className="text-slate-600">Shift:</span>{' '}
                <span className="font-semibold text-slate-900">{shift.name}</span>
              </p>
              <p className="text-xs text-slate-600">
                Jam masuk (acuan): <strong>{fmtTime(shift.time_in)}</strong> · toleransi telat:{' '}
                <strong>{shift.grace_in_minutes ?? 0} menit</strong> · jam keluar: <strong>{fmtTime(shift.time_out)}</strong>
              </p>
              {ctx.open_attendance ? (
                <p className="text-xs text-emerald-800">Sesi hari ini sudah clock in — silakan clock out saat selesai.</p>
              ) : (
                <p className="text-xs text-slate-600">Belum clock in hari ini.</p>
              )}
            </div>
          ) : (
            <p className="text-amber-800">Shift belum ditetapkan untuk akun Anda. Hubungi admin cabang.</p>
          )}
        </div>
      )}

      <div className="mb-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
        <div className="sm:col-span-2">
          <p className="text-sm font-medium text-slate-700">Koordinat</p>
          <p className="mt-1 text-xs text-slate-500">
            Lat: {gps.lat || '—'} Lng: {gps.lng || '—'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={locate} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium">
            <MapPin className="h-4 w-4" /> GPS
          </button>
          <button type="button" onClick={clockIn} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">
            <LogIn className="h-4 w-4" /> In
          </button>
          <button type="button" onClick={clockOut} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
            <LogOut className="h-4 w-4" /> Out
          </button>
        </div>
      </div>
      <DataTable
        columns={[
          { key: 'employee_code', label: 'Kode' },
          { key: 'full_name', label: 'Nama' },
          { key: 'branch_name', label: 'Cabang' },
          { key: 'shift_name', label: 'Shift', render: (r) => r.shift_name || '—' },
          { key: 'clock_in_at', label: 'Masuk', sortable: true, render: (r) => formatDate(r.clock_in_at) },
          { key: 'clock_out_at', label: 'Keluar', render: (r) => (r.clock_out_at ? formatDate(r.clock_out_at) : '-') },
          { key: 'status', label: 'Status', sortable: true },
          { key: 'distance_in_meters', label: 'Jarak (m)', render: (r) => r.distance_in_meters ?? '-' },
        ]}
        rows={t.rows}
        loading={t.loading}
        search={t.search}
        onSearchChange={t.setSearch}
        sortKey={t.sort}
        sortOrder={t.order}
        onSort={t.setSort}
        limit={t.limit}
        onLimitChange={t.setLimit}
        pagination={{ page: t.page, totalPages: t.totalPages, total: t.total, onPage: t.setPage }}
      />
    </div>
  );
}
