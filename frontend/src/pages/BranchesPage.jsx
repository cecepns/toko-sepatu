import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useServerTable } from '@/hooks/useServerTable';
import { branchService } from '@/services/branchService';
import { useAuth } from '@/contexts/AuthContext';

export default function BranchesPage() {
  const { user } = useAuth();
  const isSuper = user?.role_slug === 'super_admin';
  const fetcher = useCallback((p) => branchService.list(p), []);
  const t = useServerTable(fetcher);
  const [modal, setModal] = useState({ open: false, row: null });

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
            label: '',
            render: (row) =>
              isSuper ? (
                <button type="button" className="text-brand-600 hover:text-brand-800" onClick={() => setModal({ open: true, row })}>
                  <Pencil className="h-4 w-4" />
                </button>
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
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
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
          <div>
            <label className="text-xs font-medium text-slate-600">Latitude</label>
            <input name="latitude" type="number" step="any" required defaultValue={modal.row?.latitude} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Longitude</label>
            <input name="longitude" type="number" step="any" required defaultValue={modal.row?.longitude} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
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
