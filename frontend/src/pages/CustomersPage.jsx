import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useServerTable } from '@/hooks/useServerTable';
import { customerService } from '@/services/customerService';
import { useAuth } from '@/contexts/AuthContext';
import { confirmToast } from '@/utils/confirm';

export default function CustomersPage() {
  const { user } = useAuth();
  const canEdit = user?.role_slug !== 'kasir';
  const fetcher = useCallback((p) => customerService.list(p), []);
  const t = useServerTable(fetcher);
  const [modal, setModal] = useState({ open: false, row: null });

  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      name: fd.get('name'),
      phone: fd.get('phone'),
      address: fd.get('address'),
      tier: fd.get('tier'),
      points: Number(fd.get('points') || 0),
      is_active: fd.get('is_active') === '1',
    };
    try {
      if (modal.row?.id) await customerService.update(modal.row.id, body);
      else await customerService.create({ name: body.name, phone: body.phone, address: body.address });
      toast.success('Disimpan');
      setModal({ open: false, row: null });
      t.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (id) => {
    if (!(await confirmToast('Hapus customer?'))) return;
    try {
      await customerService.remove(id);
      toast.success('Dihapus');
      t.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Customer"
        subtitle="Membership & riwayat transaksi (via penjualan)"
        action={
          canEdit && (
            <button type="button" onClick={() => setModal({ open: true, row: null })} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white">
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
          { key: 'tier', label: 'Tier' },
          { key: 'points', label: 'Poin' },
          {
            key: 'a',
            label: '',
            render: (row) =>
              canEdit ? (
                <div className="flex gap-2">
                  <button type="button" onClick={() => setModal({ open: true, row })} className="text-brand-600">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => remove(row.id)} className="text-red-600">
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
      <Modal open={modal.open} title={modal.row ? 'Edit Customer' : 'Tambah Customer'} onClose={() => setModal({ open: false, row: null })}>
        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600">Nama</label>
            <input name="name" required defaultValue={modal.row?.name} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Telepon</label>
            <input name="phone" defaultValue={modal.row?.phone} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Alamat</label>
            <textarea name="address" rows={2} defaultValue={modal.row?.address} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          {modal.row && (
            <>
              <div>
                <label className="text-xs font-medium text-slate-600">Tier</label>
                <select name="tier" defaultValue={modal.row?.tier || 'bronze'} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <option value="bronze">Bronze</option>
                  <option value="silver">Silver</option>
                  <option value="gold">Gold</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Poin</label>
                <input name="points" type="number" defaultValue={modal.row?.points ?? 0} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Aktif</label>
                <select name="is_active" defaultValue={modal.row?.is_active === 0 ? '0' : '1'} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <option value="1">Ya</option>
                  <option value="0">Tidak</option>
                </select>
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 pt-2">
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
