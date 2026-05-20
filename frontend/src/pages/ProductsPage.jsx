import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Layers } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useServerTable } from '@/hooks/useServerTable';
import { productModelService, variantService } from '@/services/productModelService';
import { categoryService } from '@/services/categoryService';
import { formatCurrency } from '@/utils/format';
import { mediaUrl } from '@/utils/mediaUrl';
import { confirmToast } from '@/utils/confirm';
import { iconActionDelete, iconActionEdit } from '@/utils/iconActionButton';
import { SPORT_TYPES, sportTypeLabel } from '@/utils/constants';

const emptyVariant = { color: '', size: '', sport_type: 'umum', barcode: '', hpp: '', retail_price: '', quantity: 0, min_stock: 0 };

export default function ProductsPage() {
  const fetcher = useCallback((p) => productModelService.list(p), []);
  const t = useServerTable(fetcher);
  const [modal, setModal] = useState({ open: false, row: null });
  const [cats, setCats] = useState([]);
  const [variants, setVariants] = useState([]);
  const [variantForm, setVariantForm] = useState(emptyVariant);
  const [editingVariant, setEditingVariant] = useState(null);

  useEffect(() => {
    categoryService.list({ limit: 200, active_only: true }).then((c) => {
      if (c.success) setCats(c.data || []);
    });
  }, []);

  const openEdit = async (row) => {
    setModal({ open: true, row });
    setEditingVariant(null);
    setVariantForm(emptyVariant);
    try {
      const res = await productModelService.get(row.id);
      if (res.success) setVariants(res.data?.variants || []);
    } catch {
      setVariants([]);
    }
  };

  const saveModel = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const file = fd.get('image');
    const payload = new FormData();
    payload.append('category_id', fd.get('category_id'));
    payload.append('name', fd.get('name'));
    payload.append('brand', fd.get('brand') || '');
    payload.append('description', fd.get('description') || '');
    payload.append('is_active', fd.get('is_active') === '1' ? 'true' : 'false');
    if (file && file.size) payload.append('image', file);
    try {
      if (modal.row?.id) await productModelService.update(modal.row.id, payload);
      else await productModelService.create(payload);
      toast.success('Model produk disimpan');
      setModal({ open: false, row: null });
      t.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const removeModel = async (id) => {
    if (!(await confirmToast('Hapus model beserta semua varian?'))) return;
    try {
      await productModelService.remove(id);
      toast.success('Dihapus');
      t.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const saveVariant = async (e) => {
    e.preventDefault();
    if (!modal.row?.id) return toast.error('Simpan model dulu sebelum menambah varian');
    const body = {
      model_id: modal.row.id,
      color: variantForm.color,
      size: variantForm.size,
      sport_type: variantForm.sport_type,
      barcode: variantForm.barcode || null,
      hpp: Number(variantForm.hpp) || 0,
      retail_price: Number(variantForm.retail_price) || 0,
      quantity: Number(variantForm.quantity) || 0,
      min_stock: Number(variantForm.min_stock) || 0,
      is_active: true,
    };
    try {
      if (editingVariant) await variantService.update(editingVariant.id, body);
      else await variantService.create(body);
      toast.success('Varian disimpan');
      const res = await productModelService.get(modal.row.id);
      if (res.success) setVariants(res.data?.variants || []);
      setVariantForm(emptyVariant);
      setEditingVariant(null);
      t.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const removeVariant = async (id) => {
    if (!(await confirmToast('Hapus varian ini?'))) return;
    try {
      await variantService.remove(id);
      toast.success('Varian dihapus');
      const res = await productModelService.get(modal.row.id);
      if (res.success) setVariants(res.data?.variants || []);
      t.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Produk"
        subtitle="Model sepatu dengan varian warna, ukuran & tipe (futsal / sepak bola)"
        action={
          <button
            type="button"
            onClick={() => {
              setModal({ open: true, row: null });
              setVariants([]);
              setVariantForm(emptyVariant);
              setEditingVariant(null);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" /> Tambah model
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
                <img src={mediaUrl(r.image_url)} alt="" className="h-10 w-10 rounded-lg border border-slate-100 object-cover" loading="lazy" />
              ) : (
                <span className="text-slate-300">—</span>
              ),
          },
          { key: 'name', label: 'Model', sortable: true },
          { key: 'brand', label: 'Merek' },
          { key: 'category_name', label: 'Kategori' },
          { key: 'variant_count', label: 'Varian' },
          { key: 'total_stock', label: 'Total stok' },
          {
            key: 'actions',
            label: '',
            render: (r) => (
              <div className="flex justify-end gap-1">
                <button type="button" onClick={() => openEdit(r)} className={iconActionEdit} title="Kelola">
                  <Layers className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => removeModel(r.id)} className={iconActionDelete} title="Hapus">
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

      <Modal open={modal.open} title={modal.row ? 'Kelola model & varian' : 'Model produk baru'} onClose={() => setModal({ open: false, row: null })} size="lg">
        <form onSubmit={saveModel} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-slate-600">Nama model *</label>
              <input name="name" required defaultValue={modal.row?.name} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Merek</label>
              <input name="brand" defaultValue={modal.row?.brand || ''} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Kategori *</label>
              <select name="category_id" required defaultValue={modal.row?.category_id} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="">Pilih</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-slate-600">Deskripsi</label>
              <textarea name="description" rows={2} defaultValue={modal.row?.description || ''} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Gambar</label>
              <input type="file" name="image" accept="image/*" className="input text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Status</label>
              <select name="is_active" defaultValue={modal.row?.is_active === 0 ? '0' : '1'} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="1">Aktif</option>
                <option value="0">Nonaktif</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button type="submit" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
              Simpan model
            </button>
          </div>
        </form>

        {modal.row?.id && (
          <div className="mt-6 border-t border-slate-100 pt-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">Varian (warna · ukuran · tipe)</h3>
            <form onSubmit={saveVariant} className="mb-4 grid gap-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3 sm:grid-cols-3 lg:grid-cols-6">
              <input
                placeholder="Warna *"
                required
                value={variantForm.color}
                onChange={(e) => setVariantForm({ ...variantForm, color: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                placeholder="Ukuran *"
                required
                value={variantForm.size}
                onChange={(e) => setVariantForm({ ...variantForm, size: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <select
                value={variantForm.sport_type}
                onChange={(e) => setVariantForm({ ...variantForm, sport_type: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                {SPORT_TYPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <input
                placeholder="Barcode"
                value={variantForm.barcode}
                onChange={(e) => setVariantForm({ ...variantForm, barcode: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                placeholder="HPP"
                type="number"
                value={variantForm.hpp}
                onChange={(e) => setVariantForm({ ...variantForm, hpp: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                placeholder="Harga jual"
                type="number"
                value={variantForm.retail_price}
                onChange={(e) => setVariantForm({ ...variantForm, retail_price: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              {!editingVariant && (
                <input
                  placeholder="Stok awal"
                  type="number"
                  value={variantForm.quantity}
                  onChange={(e) => setVariantForm({ ...variantForm, quantity: e.target.value })}
                  className="input sm:col-span-2"
                />
              )}
              <input
                placeholder="Min stok"
                type="number"
                value={variantForm.min_stock}
                onChange={(e) => setVariantForm({ ...variantForm, min_stock: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
                <button type="submit" className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white">
                  {editingVariant ? 'Update varian' : 'Tambah varian'}
                </button>
                {editingVariant && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingVariant(null);
                      setVariantForm(emptyVariant);
                    }}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
                  >
                    Batal edit
                  </button>
                )}
              </div>
            </form>
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">Warna</th>
                    <th className="px-3 py-2">Ukuran</th>
                    <th className="px-3 py-2">Tipe</th>
                    <th className="px-3 py-2">Harga</th>
                    <th className="px-3 py-2">Stok</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v) => (
                    <tr key={v.id} className="border-t border-slate-50">
                      <td className="px-3 py-2 font-mono text-xs">{v.sku}</td>
                      <td className="px-3 py-2">{v.color}</td>
                      <td className="px-3 py-2">{v.size}</td>
                      <td className="px-3 py-2">{sportTypeLabel(v.sport_type)}</td>
                      <td className="px-3 py-2">{formatCurrency(v.effective_price ?? v.retail_price)}</td>
                      <td className="px-3 py-2">{v.quantity}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          className={iconActionEdit}
                          onClick={() => {
                            setEditingVariant(v);
                            setVariantForm({
                              color: v.color,
                              size: v.size,
                              sport_type: v.sport_type,
                              barcode: v.barcode || '',
                              hpp: v.hpp,
                              retail_price: v.retail_price,
                              quantity: v.quantity,
                              min_stock: v.min_stock,
                            });
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button type="button" className={iconActionDelete} onClick={() => removeVariant(v.id)}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!variants.length && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                        Belum ada varian
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
