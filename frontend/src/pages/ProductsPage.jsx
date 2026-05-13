import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useServerTable } from '@/hooks/useServerTable';
import { productService } from '@/services/productService';
import { categoryService } from '@/services/categoryService';
import { unitService } from '@/services/unitService';
import { formatCurrency } from '@/utils/format';
import { mediaUrl } from '@/utils/mediaUrl';
import { confirmToast } from '@/utils/confirm';
import { iconActionDelete, iconActionEdit } from '@/utils/iconActionButton';

export default function ProductsPage() {
  const fetcher = useCallback((p) => productService.list(p), []);
  const t = useServerTable(fetcher);
  const [modal, setModal] = useState({ open: false, row: null });
  const [cats, setCats] = useState([]);
  const [units, setUnits] = useState([]);
  const [form, setForm] = useState({ hpp: '', retail_price: '', wholesale_price: '', min_wholesale_qty: 1 });

  useEffect(() => {
    (async () => {
      try {
        const [c, u] = await Promise.all([categoryService.list({ limit: 200 }), unitService.list({ limit: 200 })]);
        if (c.success) setCats(c.data || []);
        if (u.success) setUnits(u.data || []);
      } catch {
        /* */
      }
    })();
  }, []);

  useEffect(() => {
    if (modal.row) {
      setForm({
        hpp: modal.row.hpp,
        retail_price: modal.row.catalog_retail_price ?? modal.row.retail_price,
        wholesale_price: modal.row.catalog_wholesale_price ?? modal.row.wholesale_price,
        min_wholesale_qty: modal.row.min_wholesale_qty,
      });
    } else {
      setForm({ hpp: '', retail_price: '', wholesale_price: '', min_wholesale_qty: 10 });
    }
  }, [modal]);

  const margin = useMemo(() => {
    const h = Number(form.hpp) || 0;
    const r = Number(form.retail_price) || 0;
    if (!h) return 0;
    return ((r - h) / h) * 100;
  }, [form.hpp, form.retail_price]);

  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const file = fd.get('image');
    const payload = new FormData();
    payload.append('category_id', fd.get('category_id'));
    payload.append('unit_id', fd.get('unit_id'));
    payload.append('name', fd.get('name'));
    payload.append('barcode', fd.get('barcode') || '');
    payload.append('hpp', fd.get('hpp'));
    payload.append('retail_price', fd.get('retail_price'));
    payload.append('wholesale_price', fd.get('wholesale_price'));
    payload.append('min_wholesale_qty', fd.get('min_wholesale_qty'));
    payload.append('min_stock', fd.get('min_stock'));
    payload.append('is_active', fd.get('is_active') === '1' ? 'true' : 'false');
    if (file && file.size) payload.append('image', file);
    try {
      if (modal.row?.id) await productService.update(modal.row.id, payload);
      else await productService.create(payload);
      toast.success('Produk disimpan');
      setModal({ open: false, row: null });
      t.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (id) => {
    if (!(await confirmToast('Hapus produk?'))) return;
    try {
      await productService.remove(id);
      toast.success('Dihapus');
      t.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Produk"
        subtitle="HPP, eceran, grosir & SKU otomatis"
        action={
          <button type="button" onClick={() => setModal({ open: true, row: null })} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white">
            <Plus className="h-4 w-4" /> Tambah
          </button>
        }
      />
      <DataTable
        columns={[
          {
            key: 'thumb',
            label: '',
            render: (r) =>
              r.image_url ? (
                <img src={mediaUrl(r.image_url)} alt="" className="h-10 w-10 rounded-lg object-cover border border-slate-100" loading="lazy" />
              ) : (
                <span className="text-slate-300">—</span>
              ),
          },
          { key: 'sku', label: 'SKU', sortable: true },
          { key: 'name', label: 'Nama', sortable: true },
          { key: 'category_name', label: 'Kategori' },
          { key: 'retail_price', label: 'Eceran (katalog)', sortable: true, render: (r) => formatCurrency(r.catalog_retail_price ?? r.retail_price) },
          { key: 'wholesale_price', label: 'Grosir (katalog)', render: (r) => formatCurrency(r.catalog_wholesale_price ?? r.wholesale_price) },
          {
            key: 'promo_pos',
            label: 'Di POS saat promo',
            render: (r) =>
              r.has_active_promo ? (
                <span className="text-xs font-medium text-brand-700">
                  {formatCurrency(r.retail_price)} / {formatCurrency(r.wholesale_price)}
                </span>
              ) : (
                <span className="text-slate-400">—</span>
              ),
          },
          { key: 'margin_percent', label: 'Margin %', render: (r) => `${Number(r.margin_percent || 0).toFixed(1)}%` },
          {
            key: 'a',
            label: '',
            render: (row) => (
              <div className="flex gap-1.5">
                <button type="button" title="Ubah" onClick={() => setModal({ open: true, row })} className={iconActionEdit}>
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" title="Hapus" onClick={() => remove(row.id)} className={iconActionDelete}>
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

      <Modal open={modal.open} title={modal.row ? 'Edit Produk' : 'Tambah Produk'} onClose={() => setModal({ open: false, row: null })} size="lg">
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-600">Kategori</label>
            <select name="category_id" required defaultValue={modal.row?.category_id} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Satuan</label>
            <select name="unit_id" required defaultValue={modal.row?.unit_id} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.abbreviation})
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-600">Nama</label>
            <input name="name" required defaultValue={modal.row?.name} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Barcode</label>
            <input name="barcode" defaultValue={modal.row?.barcode} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Gambar</label>
            {modal.row?.image_url && (
              <img src={mediaUrl(modal.row.image_url)} alt="" className="mb-2 h-20 w-20 rounded-lg border border-slate-100 object-cover" />
            )}
            <input name="image" type="file" accept="image/*" className="mt-1 w-full text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">HPP (modal)</label>
            <input
              name="hpp"
              type="number"
              required
              value={form.hpp}
              onChange={(e) => setForm((f) => ({ ...f, hpp: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Harga eceran</label>
            <input
              name="retail_price"
              type="number"
              required
              value={form.retail_price}
              onChange={(e) => setForm((f) => ({ ...f, retail_price: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Harga grosir (reseller)</label>
            <input
              name="wholesale_price"
              type="number"
              required
              value={form.wholesale_price}
              onChange={(e) => setForm((f) => ({ ...f, wholesale_price: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Min qty grosir</label>
            <input
              name="min_wholesale_qty"
              type="number"
              required
              value={form.min_wholesale_qty}
              onChange={(e) => setForm((f) => ({ ...f, min_wholesale_qty: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Stok minimum</label>
            <input name="min_stock" type="number" required defaultValue={modal.row?.min_stock ?? 0} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Aktif</label>
            <select name="is_active" defaultValue={modal.row?.is_active === 0 ? '0' : '1'} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="1">Ya</option>
              <option value="0">Tidak</option>
            </select>
          </div>
          <div className="sm:col-span-2 rounded-xl border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-brand-900">
            Margin keuntungan (eceran vs HPP): <strong>{margin.toFixed(1)}%</strong>
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
