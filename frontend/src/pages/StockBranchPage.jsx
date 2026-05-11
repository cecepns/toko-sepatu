import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, PackagePlus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useServerTable } from '@/hooks/useServerTable';
import { stockService } from '@/services/stockService';
import { branchService } from '@/services/branchService';
import { productService } from '@/services/productService';
import { transferService } from '@/services/transferService';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';

export default function StockBranchPage() {
  const { user } = useAuth();
  const [branchId, setBranchId] = useState(user?.branch_id || 1);
  const [branches, setBranches] = useState([]);
  const [adj, setAdj] = useState({ open: false, product_id: '', quantity_delta: '', notes: '' });

  const [reqOpen, setReqOpen] = useState(false);
  const [reqLines, setReqLines] = useState([{ product_id: '', quantity: 1 }]);
  const [reqNotes, setReqNotes] = useState('');
  const [products, setProducts] = useState([]);
  const [pendingTransfers, setPendingTransfers] = useState([]);

  const canAdjust = user?.role_slug === 'super_admin' || user?.role_slug === 'admin_cabang';
  const canRequestStock =
    user?.role_slug === 'super_admin' || user?.role_slug === 'admin_cabang' || user?.role_slug === 'kasir';

  const loadPendingTransfers = useCallback(async () => {
    if (!branchId || !canRequestStock) return;
    try {
      const res = await transferService.list({ limit: 40, page: 1, sort: 'id', order: 'desc' });
      if (!res.success) return;
      const list = res.data || [];
      setPendingTransfers(list.filter((r) => r.status === 'pending' && Number(r.to_branch_id) === Number(branchId)));
    } catch {
      /* */
    }
  }, [branchId, canRequestStock]);

  useEffect(() => {
    if (user?.branch_id) {
      setBranchId(user.branch_id);
      return;
    }
    (async () => {
      try {
        const res = await branchService.list({ limit: 50 });
        if (res.success && res.data?.length) {
          setBranches(res.data);
          setBranchId(res.data[0].id);
        }
      } catch {
        /* */
      }
    })();
  }, [user?.branch_id]);

  useEffect(() => {
    loadPendingTransfers();
  }, [loadPendingTransfers]);

  useEffect(() => {
    if (!reqOpen) return;
    (async () => {
      try {
        const res = await productService.list({ limit: 500, page: 1 });
        if (res.success) setProducts(res.data || []);
      } catch {
        /* */
      }
    })();
  }, [reqOpen]);

  const fetcher = useCallback((p) => stockService.branch(branchId, p), [branchId]);
  const t = useServerTable(fetcher, [branchId]);

  const submitAdjust = async (e) => {
    e.preventDefault();
    const pid = Number(adj.product_id);
    const delta = Number(adj.quantity_delta);
    if (!pid || !Number.isFinite(delta) || delta === 0) return toast.error('Pilih produk & isi selisih qty (bukan 0)');
    try {
      const res = await stockService.adjust({
        scope: 'branch',
        branch_id: branchId,
        product_id: pid,
        quantity_delta: delta,
        notes: adj.notes || '',
      });
      if (!res.success) throw new Error(res.message);
      toast.success(res.message || 'Stok cabang diperbarui');
      setAdj({ open: false, product_id: '', quantity_delta: '', notes: '' });
      t.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const submitStockRequest = async (e) => {
    e.preventDefault();
    if (user?.role_slug === 'kasir' && user.branch_id && Number(user.branch_id) !== Number(branchId)) {
      toast.error('Ajuan hanya untuk cabang Anda');
      return;
    }
    const items = reqLines
      .filter((l) => l.product_id && Number(l.quantity) > 0)
      .map((l) => ({ product_id: Number(l.product_id), quantity: Math.floor(Number(l.quantity)) }));
    if (!items.length) return toast.error('Pilih minimal satu produk & qty');
    try {
      const res = await transferService.create({
        to_branch_id: branchId,
        items,
        notes: reqNotes || 'Minta stok dari pusat (Stok cabang)',
      });
      if (!res.success) throw new Error(res.message);
      toast.success(res.message || 'Pengajuan terkirim. Super admin akan cek stok pusat lalu menyetujui atau menolak.');
      setReqOpen(false);
      setReqLines([{ product_id: '', quantity: 1 }]);
      setReqNotes('');
      loadPendingTransfers();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Stok Cabang"
        subtitle="Permintaan stok ke gudang pusat diproses oleh super admin (cek ketersediaan pusat)."
        action={
          <div className="flex flex-wrap gap-2">
            {canRequestStock && (
              <button
                type="button"
                onClick={() => {
                  setReqLines([{ product_id: '', quantity: 1 }]);
                  setReqNotes('');
                  setReqOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-800 hover:bg-brand-100"
              >
                <PackagePlus className="h-4 w-4" /> Minta stok pusat
              </button>
            )}
            {canAdjust && (
              <button
                type="button"
                onClick={() => setAdj((s) => ({ ...s, open: true, product_id: t.rows[0]?.product_id || '' }))}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white"
              >
                <Plus className="h-4 w-4" /> Koreksi stok
              </button>
            )}
          </div>
        }
      />

      {canRequestStock && pendingTransfers.length > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm">
          <p className="font-semibold text-amber-950">Menunggu persetujuan super admin ({pendingTransfers.length})</p>
          <ul className="mt-2 space-y-1 text-amber-900">
            {pendingTransfers.slice(0, 6).map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2">
                <span className="font-mono text-xs">{r.transfer_number}</span>
                <span className="text-xs text-amber-800">{r.status}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-800">
            Detail &amp; status: menu{' '}
            <Link to="/transfers" className="font-semibold text-brand-700 underline">
              Transfer Stok
            </Link>
            .
          </p>
        </div>
      )}

      {!user?.branch_id && (
        <div className="mb-4 max-w-xs">
          <label className="text-xs font-medium text-slate-600">Pilih cabang</label>
          <select value={branchId} onChange={(e) => setBranchId(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <DataTable
        columns={[
          { key: 'sku', label: 'SKU' },
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

      <Modal open={reqOpen} title="Minta stok dari pusat" onClose={() => setReqOpen(false)} size="lg">
        <p className="mb-3 text-xs text-slate-600">
          Pengajuan masuk sebagai transfer pending. Super admin menyetujui jika stok pusat mencukupi, atau menolak jika tidak ada / kurang.
        </p>
        <form onSubmit={submitStockRequest} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600">Cabang penerima</label>
            <p className="mt-1 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-800">
              {user?.branch_id ? (
                <>
                  Cabang Anda (ID {branchId})
                </>
              ) : (
                <>ID {branchId} — pastikan cabang yang dipilih di halaman ini</>
              )}
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Catatan untuk pusat</label>
            <textarea
              value={reqNotes}
              onChange={(e) => setReqNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Opsional, mis. untuk event / restock mingguan"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">Produk &amp; jumlah diminta</span>
              <button
                type="button"
                className="text-xs font-medium text-brand-600"
                onClick={() => setReqLines((ls) => [...ls, { product_id: '', quantity: 1 }])}
              >
                + Baris
              </button>
            </div>
            {reqLines.map((ln, idx) => (
              <div key={idx} className="flex flex-wrap gap-2">
                <select
                  value={ln.product_id}
                  onChange={(e) => {
                    const v = e.target.value;
                    setReqLines((ls) => ls.map((x, i) => (i === idx ? { ...x, product_id: v } : x)));
                  }}
                  className="min-w-[12rem] flex-1 rounded-xl border border-slate-200 px-2 py-2 text-sm"
                >
                  <option value="">Pilih produk</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={ln.quantity}
                  onChange={(e) => {
                    const v = e.target.value;
                    setReqLines((ls) => ls.map((x, i) => (i === idx ? { ...x, quantity: v } : x)));
                  }}
                  className="w-24 rounded-xl border border-slate-200 px-2 py-2 text-sm"
                />
                {reqLines.length > 1 && (
                  <button
                    type="button"
                    className="text-xs text-red-600"
                    onClick={() => setReqLines((ls) => ls.filter((_, i) => i !== idx))}
                  >
                    Hapus
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setReqOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">
              Batal
            </button>
            <button type="submit" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
              Kirim pengajuan
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={adj.open} title="Koreksi stok cabang" onClose={() => setAdj({ open: false, product_id: '', quantity_delta: '', notes: '' })}>
        <form onSubmit={submitAdjust} className="space-y-3">
          <p className="text-xs text-slate-500">Cabang: {branchId}</p>
          <div>
            <label className="text-xs font-medium text-slate-600">Produk</label>
            <select
              required
              value={adj.product_id}
              onChange={(e) => setAdj((s) => ({ ...s, product_id: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Pilih dari daftar</option>
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
