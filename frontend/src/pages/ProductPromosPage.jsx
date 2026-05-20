import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useServerTable } from '@/hooks/useServerTable';
import { productPromoService } from '@/services/productPromoService';
import { variantService } from '@/services/productModelService';
import { formatCurrency } from '@/utils/format';
import { iconActionDelete, iconActionEdit } from '@/utils/iconActionButton';
import { sportTypeLabel, variantDisplayName } from '@/utils/constants';

export default function ProductPromosPage() {
  const fetcher = useCallback((p) => productPromoService.list(p), []);
  const t = useServerTable(fetcher);
  const [modal, setModal] = useState({ open: false, row: null });
  const [variants, setVariants] = useState([]);
  const [form, setForm] = useState({ variant_id: '', promo_price: '', valid_from: '', valid_until: '' });

  useEffect(() => {
    variantService.list({ limit: 500, page: 1, active_only: true }).then((res) => {
      if (res.success) setVariants(res.data || []);
    });
  }, []);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (!modal.row) {
      setForm({ variant_id: '', promo_price: '', valid_from: today, valid_until: today });
    } else {
      setForm({
        variant_id: String(modal.row.variant_id),
        promo_price: String(modal.row.promo_price ?? ''),
        valid_from: String(modal.row.valid_from || '').slice(0, 10),
        valid_until: String(modal.row.valid_until || '').slice(0, 10),
      });
    }
  }, [modal]);

  const save = async (e) => {
    e.preventDefault();
    const body = {
      variant_id: Number(form.variant_id),
      promo_price: Number(form.promo_price),
      valid_from: form.valid_from,
      valid_until: form.valid_until,
    };
    if (!body.variant_id) return toast.error('Pilih varian');
    try {
      if (modal.row?.id) await productPromoService.update(modal.row.id, body);
      else await productPromoService.create(body);
      toast.success('Promo disimpan');
      setModal({ open: false, row: null });
      t.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (row) => {
    if (!window.confirm('Hapus promo ini?')) return;
    try {
      await productPromoService.remove(row.id);
      toast.success('Promo dihapus');
      t.reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <PageHeader title="Promo" subtitle="Harga promo per varian di POS" action={
        <button type="button" onClick={() => setModal({ open: true, row: null })} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white">
          <Plus className="h-4 w-4" /> Tambah
        </button>
      } />
      <DataTable
        columns={[
          {
            key: 'product',
            label: 'Varian',
            render: (r) => (
              <div>
                <div className="font-medium">{r.model_name}</div>
                <div className="text-xs text-slate-500">
                  {r.color} · {r.size} · {sportTypeLabel(r.sport_type)} · {r.sku}
                </div>
              </div>
            ),
          },
          { key: 'promo_price', label: 'Harga promo', render: (r) => formatCurrency(r.promo_price) },
          {
            key: 'period',
            label: 'Periode',
            render: (r) => `${String(r.valid_from).slice(0, 10)} s/d ${String(r.valid_until).slice(0, 10)}`,
          },
          {
            key: 'actions',
            label: '',
            render: (r) => (
              <div className="flex justify-end gap-1">
                <button type="button" onClick={() => setModal({ open: true, row: r })} className={iconActionEdit}>
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => remove(r)} className={iconActionDelete}>
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
        limit={t.limit}
        onLimitChange={t.setLimit}
        pagination={{ page: t.page, totalPages: t.totalPages, total: t.total, onPage: t.setPage }}
      />

      <Modal open={modal.open} title={modal.row ? 'Edit promo' : 'Promo baru'} onClose={() => setModal({ open: false, row: null })}>
        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600">Varian</label>
            <select
              required
              value={form.variant_id}
              onChange={(e) => setForm({ ...form, variant_id: e.target.value })}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Pilih</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {variantDisplayName(v)} — {v.sku}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Harga promo</label>
            <input
              type="number"
              required
              value={form.promo_price}
              onChange={(e) => setForm({ ...form, promo_price: e.target.value })}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-slate-600">Dari</label>
              <input type="date" required value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Sampai</label>
              <input type="date" required value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
          </div>
          <button type="submit" className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white">
            Simpan
          </button>
        </form>
      </Modal>
    </div>
  );
}
