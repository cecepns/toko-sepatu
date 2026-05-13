import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useServerTable } from '@/hooks/useServerTable';
import { branchService } from '@/services/branchService';
import { useAuth } from '@/contexts/AuthContext';
import { iconActionDelete, iconActionEdit } from '@/utils/iconActionButton';

export default function BranchesPage() {
  const { user } = useAuth();
  const isSuper = user?.role_slug === 'super_admin';
  const fetcher = useCallback((p) => branchService.list(p), []);
  const t = useServerTable(fetcher);
  const [modal, setModal] = useState({ open: false, row: null });
  const [gpsLoading, setGpsLoading] = useState(false);
  const latInputRef = useRef(null);
  const lngInputRef = useRef(null);

  useEffect(() => {
    if (!modal.open) setGpsLoading(false);
  }, [modal.open]);

  const fillCoordinatesFromGps = () => {
    if (!navigator.geolocation) {
      toast.error('Browser tidak mendukung GPS / lokasi');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (latInputRef.current) latInputRef.current.value = String(lat);
        if (lngInputRef.current) lngInputRef.current.value = String(lng);
        setGpsLoading(false);
        toast.success('Koordinat dari GPS sudah diisi');
      },
      (err) => {
        setGpsLoading(false);
        const code = err?.code;
        const msg =
          code === 1 ? 'Izin lokasi ditolak — aktifkan di pengaturan browser' : code === 2 ? 'Lokasi tidak tersedia' : code === 3 ? 'Timeout GPS' : 'Gagal mengambil lokasi';
        toast.error(msg);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    body.latitude = Number(body.latitude);
    body.longitude = Number(body.longitude);
    body.attendance_radius_meters = Number(body.attendance_radius_meters);
    try {
      if (modal.row?.id) {
        await branchService.update(modal.row.id, body);
        toast.success('Cabang diperbarui');
      } else {
        await branchService.create(body);
        toast.success('Cabang dibuat');
      }
      setModal({ open: false, row: null });
      t.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const removeBranch = async (row) => {
    if (
      !window.confirm(
        `Hapus cabang "${row.name}" (${row.code})? Stok, absensi, dan data terkait cabang ini akan ikut terhapus dari database. Pastikan tidak ada penjualan dan pengguna yang masih terikat ke cabang ini.`
      )
    ) {
      return;
    }
    try {
      await branchService.remove(row.id);
      toast.success('Cabang dihapus');
      t.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Master Cabang"
        subtitle="Alamat, telepon, status & radius absensi"
        action={
          isSuper && (
            <button
              type="button"
              onClick={() => setModal({ open: true, row: null })}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" /> Tambah
            </button>
          )
        }
      />
      <DataTable
        columns={[
          { key: 'code', label: 'Kode', sortable: true },
          { key: 'name', label: 'Nama', sortable: true },
          { key: 'phone', label: 'Telepon' },
          { key: 'status', label: 'Status', sortable: true },
          {
            key: 'actions',
            label: 'Aksi',
            render: (row) =>
              isSuper ? (
                <div className="flex items-center gap-1.5">
                  <button type="button" className={iconActionEdit} title="Ubah" onClick={() => setModal({ open: true, row })}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" className={iconActionDelete} title="Hapus cabang" onClick={() => removeBranch(row)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ) : null,
          },
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

      <Modal open={modal.open} title={modal.row ? 'Edit Cabang' : 'Tambah Cabang'} onClose={() => setModal({ open: false, row: null })} size="lg">
        <form key={modal.row?.id ?? 'new-branch'} onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" defaultValue={modal.row?.id} />
          <div>
            <label className="text-xs font-medium text-slate-600">Kode</label>
            <input name="code" required defaultValue={modal.row?.code} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Telepon</label>
            <input name="phone" required defaultValue={modal.row?.phone} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-600">Nama</label>
            <input name="name" required defaultValue={modal.row?.name} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-600">Alamat</label>
            <textarea name="address" required rows={2} defaultValue={modal.row?.address} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
              <div className="min-w-0 flex-1">
                <label className="text-xs font-medium text-slate-600">Latitude</label>
                <input
                  ref={latInputRef}
                  name="latitude"
                  type="number"
                  step="any"
                  required
                  defaultValue={modal.row?.latitude ?? ''}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="min-w-0 flex-1">
                <label className="text-xs font-medium text-slate-600">Longitude</label>
                <input
                  ref={lngInputRef}
                  name="longitude"
                  type="number"
                  step="any"
                  required
                  defaultValue={modal.row?.longitude ?? ''}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={fillCoordinatesFromGps}
                disabled={gpsLoading}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 sm:mb-0.5"
              >
                <MapPin className="h-4 w-4 text-brand-600" />
                {gpsLoading ? 'Mencari GPS…' : 'Isi dari GPS'}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Buka form ini di lokasi cabang, lalu izinkan akses lokasi di browser.</p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Radius absensi (m)</label>
            <input name="attendance_radius_meters" type="number" required defaultValue={modal.row?.attendance_radius_meters ?? 100} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Status</label>
            <select name="status" defaultValue={modal.row?.status || 'active'} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </select>
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModal({ open: false, row: null })} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">
              Batal
            </button>
            <button type="submit" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
              Simpan
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
