import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useServerTable } from '@/hooks/useServerTable';
import { stockService } from '@/services/stockService';

export default function StockCentralPage() {
  const fetcher = useCallback((p) => stockService.central(p), []);
  const t = useServerTable(fetcher);
  const [adj, setAdj] = useState({ open: false, product_id: '', quantity_delta: '', notes: '' });

  const submitAdjust = async (e) => {
    e.preventDefault();
    const pid = Number(adj.product_id);
    const delta = Number(adj.quantity_delta);
    if (!pid || !Number.isFinite(delta) || delta === 0) return toast.error('Pilih produk & isi selisih qty (bukan 0)');
    try {
      const res = await stockService.adjust({
        scope: 'central',
        product_id: pid,
        quantity_delta: delta,
        notes: adj.notes || '',
      });
      if (!res.success) throw new Error(res.message);
      toast.success(res.message || 'Stok pusat diperbarui');
      setAdj({ open: false, product_id: '', quantity_delta: '', notes: '' });
      t.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Stok Gudang Pusat"
        subtitle="Koreksi manual (tambah/kurang) tercatat di mutasi stok"
        action={
          <button
            type="button"
            onClick={() => setAdj((s) => ({ ...s, open: true, product_id: t.rows[0]?.product_id || '' }))}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" /> Koreksi stok
          </button>
        }
      />
      <DataTable
        columns={[
          { key: 'sku', label: 'SKU', sortable: true },
          { key: 'name', label: 'Produk' },
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

      <Modal open={adj.open} title="Koreksi stok pusat" onClose={() => setAdj({ open: false, product_id: '', quantity_delta: '', notes: '' })}>
        <form onSubmit={submitAdjust} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600">Produk</label>
            <select
              required
              value={adj.product_id}
              onChange={(e) => setAdj((s) => ({ ...s, product_id: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Pilih dari daftar (refresh jika kosong)</option>
              {t.rows.map((r) => (
                <option key={r.product_id} value={r.product_id}>
                  {r.sku} — {r.name} (stok {r.quantity})
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
              placeholder="contoh: 10 atau -2"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Catatan</label>
            <input
              value={adj.notes}
              onChange={(e) => setAdj((s) => ({ ...s, notes: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Opsional"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setAdj({ open: false, product_id: '', quantity_delta: '', notes: '' })} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">
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
