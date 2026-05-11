import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useServerTable } from '@/hooks/useServerTable';
import { categoryService } from '@/services/categoryService';
import { confirmToast } from '@/utils/confirm';

export default function CategoriesPage() {
  const fetcher = useCallback((p) => categoryService.list(p), []);
  const t = useServerTable(fetcher);
  const [modal, setModal] = useState({ open: false, row: null });

  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = { name: fd.get('name'), description: fd.get('description'), is_active: fd.get('is_active') === '1' };
    try {
      if (modal.row?.id) await categoryService.update(modal.row.id, body);
      else await categoryService.create(body);
      toast.success('Disimpan');
      setModal({ open: false, row: null });
      t.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (id) => {
    if (!(await confirmToast('Hapus kategori?'))) return;
    try {
      await categoryService.remove(id);
      toast.success('Dihapus');
      t.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Kategori Produk"
        action={
          <button type="button" onClick={() => setModal({ open: true, row: null })} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white">
            <Plus className="h-4 w-4" /> Tambah
          </button>
        }
      />
      <DataTable
        columns={[
          { key: 'name', label: 'Nama', sortable: true },
          { key: 'description', label: 'Deskripsi' },
          { key: 'is_active', label: 'Aktif', render: (r) => (r.is_active ? 'Ya' : 'Tidak') },
          {
            key: 'a',
            label: '',
            render: (row) => (
              <div className="flex gap-2">
                <button type="button" onClick={() => setModal({ open: true, row })} className="text-brand-600">
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => remove(row.id)} className="text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ),
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
      <Modal open={modal.open} title={modal.row ? 'Edit' : 'Tambah'} onClose={() => setModal({ open: false, row: null })}>
        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600">Nama</label>
            <input name="name" required defaultValue={modal.row?.name} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Deskripsi</label>
            <textarea name="description" rows={2} defaultValue={modal.row?.description} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Aktif</label>
            <select name="is_active" defaultValue={modal.row?.is_active === 0 ? '0' : '1'} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="1">Ya</option>
              <option value="0">Tidak</option>
            </select>
          </div>
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
