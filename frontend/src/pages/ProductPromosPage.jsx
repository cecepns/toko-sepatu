import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useServerTable } from '@/hooks/useServerTable';
import { productPromoService } from '@/services/productPromoService';
import { productService } from '@/services/productService';
import { formatCurrency } from '@/utils/format';
import { iconActionDelete, iconActionEdit } from '@/utils/iconActionButton';

const SCOPES = [
  { id: 'all', label: 'Semua' },
  { id: 'running', label: 'Berjalan' },
  { id: 'upcoming', label: 'Akan datang' },
  { id: 'past', label: 'Berakhir' },
];

function statusBadge(status) {
  const s = String(status || '');
  const cls =
    s === 'running'
      ? 'bg-emerald-100 text-emerald-900'
      : s === 'upcoming'
        ? 'bg-amber-100 text-amber-900'
        : 'bg-slate-100 text-slate-600';
  const txt = s === 'running' ? 'Berjalan' : s === 'upcoming' ? 'Menunggu' : 'Selesai';
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{txt}</span>;
}

export default function ProductPromosPage() {
  const [scope, setScope] = useState('running');
  const fetcher = useCallback((p) => productPromoService.list({ ...p, scope }), [scope]);
  const t = useServerTable(fetcher, [scope]);

  const [modal, setModal] = useState({ open: false, row: null });
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({
    product_id: '',
    promo_retail_price: '',
    promo_wholesale_price: '',
    valid_from: '',
    valid_until: '',
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await productService.list({ limit: 500, page: 1, sort: 'name', order: 'asc' });
        if (res.success) setProducts(res.data || []);
      } catch {
        setProducts([]);
      }
    })();
  }, []);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (!modal.row) {
      setForm({
        product_id: '',
        promo_retail_price: '',
        promo_wholesale_price: '',
        valid_from: today,
        valid_until: today,
      });
    } else {
      const r = modal.row;
      setForm({
        product_id: String(r.product_id),
        promo_retail_price: String(r.promo_retail_price ?? ''),
        promo_wholesale_price: r.promo_wholesale_price != null && r.promo_wholesale_price !== '' ? String(r.promo_wholesale_price) : '',
        valid_from: String(r.valid_from || '').slice(0, 10),
        valid_until: String(r.valid_until || '').slice(0, 10),
      });
    }
  }, [modal]);

  const save = async (e) => {
    e.preventDefault();
    const body = {
      product_id: Number(form.product_id),
      promo_retail_price: Number(form.promo_retail_price),
      promo_wholesale_price: form.promo_wholesale_price === '' ? null : Number(form.promo_wholesale_price),
      valid_from: form.valid_from,
      valid_until: form.valid_until,
    };
    if (!body.product_id) return toast.error('Pilih produk');
    if (Number.isNaN(body.promo_retail_price) || body.promo_retail_price < 0) return toast.error('Harga promo ecer tidak valid');
    if (body.promo_wholesale_price != null && (Number.isNaN(body.promo_wholesale_price) || body.promo_wholesale_price < 0)) {
      return toast.error('Harga promo grosir tidak valid');
    }
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
    if (!window.confirm(`Hapus promo untuk ${row.product_name}?`)) return;
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
      <PageHeader
        title="Promo produk"
        subtitle="Harga ecer & grosir di POS mengikuti periode promo; setelah tanggal selesai kembali ke harga katalog."
        action={
          <button
            type="button"
            onClick={() => setModal({ open: true, row: null })}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-600/25"
          >
            <Plus className="h-4 w-4" /> Tambah promo
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setScope(s.id)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              scope === s.id ? 'bg-brand-600 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <DataTable
        columns={[
          { key: 'product_name', label: 'Produk', sortable: true },
          {
            key: 'product_sku',
            label: 'SKU',
            render: (r) => <span className="font-mono text-xs text-slate-600">{r.product_sku}</span>,
          },
          { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) },
          {
            key: 'promo_retail_price',
            label: 'Promo ecer',
            render: (r) => formatCurrency(r.promo_retail_price),
          },
          {
            key: 'promo_wholesale_price',
            label: 'Promo grosir',
            render: (r) =>
              r.promo_wholesale_price != null && r.promo_wholesale_price !== '' ? formatCurrency(r.promo_wholesale_price) : '— (= ecer)',
          },
          {
            key: 'catalog',
            label: 'Katalog ecer → grosir',
            render: (r) => (
              <span className="text-xs text-slate-600">
                {formatCurrency(r.catalog_retail_price)} → {formatCurrency(r.catalog_wholesale_price)}
              </span>
            ),
          },
          {
            key: 'valid_from',
            label: 'Mulai',
            sortable: true,
            render: (r) => <span className="whitespace-nowrap text-sm">{String(r.valid_from || '').slice(0, 10)}</span>,
          },
          {
            key: 'valid_until',
            label: 'Sampai',
            sortable: true,
            render: (r) => <span className="whitespace-nowrap text-sm">{String(r.valid_until || '').slice(0, 10)}</span>,
          },
          {
            key: 'a',
            label: '',
            render: (row) => (
              <div className="flex gap-1.5">
                <button type="button" title="Ubah" onClick={() => setModal({ open: true, row })} className={iconActionEdit}>
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" title="Hapus" onClick={() => remove(row)} className={iconActionDelete}>
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

      <Modal open={modal.open} title={modal.row ? 'Edit promo' : 'Tambah promo'} onClose={() => setModal({ open: false, row: null })} size="lg">
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-600">Produk</label>
            <select
              required
              value={form.product_id}
              onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">— Pilih —</option>
              {products.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.sku} — {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Harga promo ecer</label>
            <input
              type="number"
              min={0}
              step="0.01"
              required
              value={form.promo_retail_price}
              onChange={(e) => setForm((f) => ({ ...f, promo_retail_price: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Harga promo grosir (opsional)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.promo_wholesale_price}
              onChange={(e) => setForm((f) => ({ ...f, promo_wholesale_price: e.target.value }))}
              placeholder="Kosongkan = sama dengan ecer promo"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Berlaku dari</label>
            <input
              type="date"
              required
              value={form.valid_from}
              onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Berlaku sampai</label>
            <input
              type="date"
              required
              value={form.valid_until}
              onChange={(e) => setForm((f) => ({ ...f, valid_until: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <p className="sm:col-span-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Promo yang tanggalnya beririsan untuk produk yang sama tidak diperbolehkan. Harga di POS dan saat checkout mengikuti promo
            otomatis selama hari ini di antara tanggal mulai & selesai.
          </p>
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
