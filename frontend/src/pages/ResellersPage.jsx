import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useServerTable } from '@/hooks/useServerTable';
import { resellerService } from '@/services/resellerService';
import { customerService } from '@/services/customerService';
import { useAuth } from '@/contexts/AuthContext';
import { confirmToast } from '@/utils/confirm';

export default function ResellersPage() {
  const { user } = useAuth();
  const canEditRow = user?.role_slug !== 'kasir';
  const fetcher = useCallback((p) => resellerService.list(p), []);
  const t = useServerTable(fetcher);
  const [modal, setModal] = useState({ open: false, row: null });
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    if (!modal.open || modal.row) return;
    (async () => {
      try {
        const res = await customerService.list({ limit: 200 });
        if (res.success) setCustomers(res.data || []);
      } catch {
        /* */
      }
    })();
  }, [modal.open, modal.row]);

  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      customer_id: Number(fd.get('customer_id')),
      company_name: fd.get('company_name'),
      tax_id: fd.get('tax_id'),
      is_active: fd.get('is_active') === '1',
    };
    try {
      if (modal.row?.id) await resellerService.update(modal.row.id, body);
      else await resellerService.create(body);
      toast.success('Disimpan');
      setModal({ open: false, row: null });
      t.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (id) => {
    if (!(await confirmToast('Hapus reseller?'))) return;
    try {
      await resellerService.remove(id);
      toast.success('Dihapus');
      t.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Reseller"
        subtitle="Harga grosir hanya untuk akun reseller di POS"
        action={
          <button
            type="button"
            onClick={() => setModal({ open: true, row: null })}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> Tambah
          </button>
        }
      />
      <DataTable
        columns={[
          { key: 'company_name', label: 'Perusahaan', sortable: true },
          { key: 'customer_name', label: 'Customer' },
          { key: 'phone', label: 'Telepon' },
          { key: 'is_active', label: 'Aktif', render: (r) => (r.is_active ? 'Ya' : 'Tidak') },
          {
            key: 'a',
            label: '',
            render: (row) =>
              canEditRow ? (
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
      <Modal open={modal.open} title={modal.row ? 'Edit Reseller' : 'Tambah Reseller'} onClose={() => setModal({ open: false, row: null })}>
        <form onSubmit={save} className="space-y-3">
          {!modal.row && (
            <div>
              <label className="text-xs font-medium text-slate-600">Customer</label>
              <select name="customer_id" required className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="">Pilih</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-slate-600">Nama perusahaan</label>
            <input name="company_name" required defaultValue={modal.row?.company_name} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">NPWP / Tax ID</label>
            <input name="tax_id" defaultValue={modal.row?.tax_id} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          {modal.row && (
            <div>
              <label className="text-xs font-medium text-slate-600">Aktif</label>
              <select name="is_active" defaultValue={modal.row?.is_active === 0 ? '0' : '1'} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="1">Ya</option>
                <option value="0">Tidak</option>
              </select>
            </div>
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
