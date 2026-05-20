import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useServerTable } from '@/hooks/useServerTable';
import { stockService } from '@/services/stockService';
import { sportTypeLabel } from '@/utils/constants';

export default function StockPage() {
  const fetcher = useCallback((p) => stockService.list(p), []);
  const t = useServerTable(fetcher);
  const [adj, setAdj] = useState({ open: false, variant_id: '', quantity_delta: '', notes: '' });

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
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Stok"
        subtitle="Stok per varian (warna, ukuran, tipe)"
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
      <DataTable
        columns={[
          { key: 'sku', label: 'SKU', sortable: true },
          { key: 'model_name', label: 'Model', sortable: true },
          { key: 'color', label: 'Warna' },
          { key: 'size', label: 'Ukuran' },
          { key: 'sport_type', label: 'Tipe', render: (r) => sportTypeLabel(r.sport_type) },
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
