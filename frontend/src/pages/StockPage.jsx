import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Package, Tags, Award } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useServerTable } from '@/hooks/useServerTable';
import { stockService } from '@/services/stockService';
import { categoryService } from '@/services/categoryService';
import { sportTypeLabel } from '@/utils/constants';
import { formatCurrency } from '@/utils/format';

function StockBreakdown({ title, icon: Icon, items, emptyText }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-brand-600" />
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      </div>
      <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
        {(items || []).map((row) => (
          <li key={row.category_name || row.brand} className="flex justify-between gap-2 text-slate-700">
            <span className="truncate">{row.category_name || row.brand}</span>
            <span className="shrink-0 tabular-nums font-medium">{row.total_quantity}</span>
          </li>
        ))}
        {!items?.length && <li className="text-slate-400">{emptyText}</li>}
      </ul>
    </div>
  );
}

export default function StockPage() {
  const [categoryId, setCategoryId] = useState('');
  const [brand, setBrand] = useState('');
  const [cats, setCats] = useState([]);
  const [brandOptions, setBrandOptions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const fetcher = useCallback(
    (p) =>
      stockService.list({
        ...p,
        ...(categoryId ? { category_id: categoryId } : {}),
        ...(brand ? { brand } : {}),
      }),
    [categoryId, brand]
  );
  const t = useServerTable(fetcher, [categoryId, brand]);
  const [adj, setAdj] = useState({ open: false, variant_id: '', quantity_delta: '', notes: '' });

  useEffect(() => {
    categoryService.list({ limit: 200, active_only: true }).then((c) => {
      if (c.success) setCats(c.data || []);
    });
  }, []);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await stockService.summary({
        search: t.appliedSearch || undefined,
        ...(categoryId ? { category_id: categoryId } : {}),
        ...(brand ? { brand } : {}),
      });
      if (res.success) {
        setSummary(res.data);
        setBrandOptions(res.data?.brands || []);
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSummaryLoading(false);
    }
  }, [categoryId, brand, t.appliedSearch]);

  useEffect(() => {
    const timer = setTimeout(loadSummary, 350);
    return () => clearTimeout(timer);
  }, [loadSummary]);

  const submitAdjust = async (e) => {
    e.preventDefault();
    const vid = Number(adj.variant_id);
    const delta = Number(adj.quantity_delta);
    if (!vid || !Number.isFinite(delta) || delta === 0) return toast.error('Pilih varian & isi selisih qty');
    try {
      const res = await stockService.adjust({ variant_id: vid, quantity_delta: delta, notes: adj.notes || '' });
      if (!res.success) throw new Error(res.message);
      toast.success(res.message || 'Stok diperbarui');
      setAdj({ open: false, variant_id: '', quantity_delta: '', notes: '' });
      t.reload();
      loadSummary();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const totals = summary?.totals;
  const filterActive = Boolean(categoryId || brand || t.appliedSearch);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stok"
        subtitle="Stok per varian — filter & ringkasan per kategori / merek"
        action={
          <button
            type="button"
            onClick={() => setAdj((s) => ({ ...s, open: true, variant_id: t.rows[0]?.variant_id || '' }))}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" /> Koreksi stok
          </button>
        }
      />

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-[180px] flex-1">
          <label className="text-xs font-medium text-slate-600">Kategori</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">Semua kategori</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[180px] flex-1">
          <label className="text-xs font-medium text-slate-600">Merek</label>
          <select
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">Semua merek</option>
            {brandOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        {(categoryId || brand) && (
          <button
            type="button"
            onClick={() => {
              setCategoryId('');
              setBrand('');
            }}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Reset filter
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">Total stok (qty)</p>
            <Package className="h-5 w-5 text-brand-600" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900">
            {summaryLoading ? '…' : Number(totals?.total_quantity) || 0}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {filterActive ? 'Sesuai filter / pencarian' : 'Semua varian aktif'}
            {!summaryLoading && totals?.variant_count != null ? ` · ${totals.variant_count} varian` : ''}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:col-span-2">
          <p className="text-sm font-medium text-slate-500">Nilai modal stok (HPP)</p>
          <p className="mt-3 text-2xl font-bold text-slate-900">
            {summaryLoading ? '…' : formatCurrency(totals?.total_asset)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Σ qty × HPP · mengikuti filter yang sama</p>
        </div>
      </div>

      {!filterActive && !summaryLoading && (
        <div className="grid gap-4 md:grid-cols-2">
          <StockBreakdown title="Stok per kategori" icon={Tags} items={summary?.by_category} emptyText="Belum ada data" />
          <StockBreakdown title="Stok per merek" icon={Award} items={summary?.by_brand} emptyText="Belum ada data" />
        </div>
      )}

      <DataTable
        columns={[
          { key: 'sku', label: 'SKU', sortable: true },
          { key: 'model_name', label: 'Model', sortable: true },
          { key: 'category_name', label: 'Kategori' },
          { key: 'brand', label: 'Merek' },
          { key: 'color', label: 'Warna' },
          { key: 'size', label: 'Ukuran' },
          { key: 'sport_type', label: 'Jenis olahraga', render: (r) => sportTypeLabel(r.sport_type) },
          { key: 'quantity', label: 'Qty', sortable: true },
          { key: 'min_stock', label: 'Min' },
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

      <Modal open={adj.open} title="Koreksi stok" onClose={() => setAdj({ open: false, variant_id: '', quantity_delta: '', notes: '' })}>
        <form onSubmit={submitAdjust} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600">Varian</label>
            <select
              required
              value={adj.variant_id}
              onChange={(e) => setAdj((s) => ({ ...s, variant_id: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Pilih varian</option>
              {t.rows.map((r) => (
                <option key={r.variant_id} value={r.variant_id}>
                  {r.sku} — {r.model_name} {r.color} {r.size} (stok {r.quantity})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Selisih qty (+ tambah, − kurang)</label>
            <input
              type="number"
              required
              value={adj.quantity_delta}
              onChange={(e) => setAdj((s) => ({ ...s, quantity_delta: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="contoh: 5 atau -2"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Catatan</label>
            <input
              value={adj.notes}
              onChange={(e) => setAdj((s) => ({ ...s, notes: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <button type="submit" className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white">
            Simpan
          </button>
        </form>
      </Modal>
    </div>
  );
}
