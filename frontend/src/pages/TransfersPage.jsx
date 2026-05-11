import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Eye, Check, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useServerTable } from '@/hooks/useServerTable';
import { transferService } from '@/services/transferService';
import { productService } from '@/services/productService';
import { useAuth } from '@/contexts/AuthContext';
import { confirmToast } from '@/utils/confirm';

export default function TransfersPage() {
  const { user } = useAuth();
  const isSuper = user?.role_slug === 'super_admin';
  const fetcher = useCallback((p) => transferService.list(p), []);
  const t = useServerTable(fetcher);
  const [modal, setModal] = useState({ open: false, mode: 'create' });
  const [detail, setDetail] = useState(null);
  const [products, setProducts] = useState([]);
  const [lines, setLines] = useState([{ product_id: '', quantity: 1 }]);

  useEffect(() => {
    if (!modal.open) return;
    (async () => {
      try {
        const res = await productService.list({ limit: 200 });
        if (res.success) setProducts(res.data || []);
      } catch {
        /* */
      }
    })();
  }, [modal.open]);

  const submit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const to_branch_id = Number(fd.get('to_branch_id'));
    const items = lines
      .filter((l) => l.product_id && Number(l.quantity) > 0)
      .map((l) => ({ product_id: Number(l.product_id), quantity: Number(l.quantity) }));
    if (!items.length) return toast.error('Tambah minimal satu item');
    try {
      await transferService.create({ to_branch_id, items, notes: fd.get('notes') || '' });
      toast.success('Pengajuan dikirim');
      setModal({ open: false, mode: 'create' });
      setLines([{ product_id: '', quantity: 1 }]);
      t.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const openDetail = async (id) => {
    try {
      const res = await transferService.get(id);
      if (!res.success) throw new Error(res.message);
      setDetail(res.data);
      setModal({ open: true, mode: 'detail' });
    } catch (e) {
      toast.error(e.message);
    }
  };

  const approve = async (id) => {
    if (!(await confirmToast('Setujui transfer & kurangi stok pusat?'))) return;
    try {
      await transferService.approve(id);
      toast.success('Disetujui');
      setModal({ open: false, mode: 'create' });
      setDetail(null);
      t.reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const reject = async (id) => {
    if (!(await confirmToast('Tolak transfer?'))) return;
    try {
      await transferService.reject(id);
      toast.success('Ditolak');
      setModal({ open: false, mode: 'create' });
      t.reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Transfer Stok"
        subtitle="Pusat → cabang, approval super admin"
        action={
          <button
            type="button"
            onClick={() => {
              setLines([{ product_id: '', quantity: 1 }]);
              setModal({ open: true, mode: 'create' });
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" /> Ajukan
          </button>
        }
      />
      <DataTable
        columns={[
          { key: 'transfer_number', label: 'No' },
          { key: 'to_branch_name', label: 'Ke cabang' },
          { key: 'status', label: 'Status', sortable: true },
          { key: 'requested_by_name', label: 'Pemohon' },
          {
            key: 'a',
            label: '',
            render: (row) => (
              <div className="flex gap-2">
                <button type="button" className="text-brand-600" onClick={() => openDetail(row.id)}>
                  <Eye className="h-4 w-4" />
                </button>
                {isSuper && row.status === 'pending' && (
                  <>
                    <button type="button" className="text-emerald-600" onClick={() => approve(row.id)}>
                      <Check className="h-4 w-4" />
                    </button>
                    <button type="button" className="text-red-600" onClick={() => reject(row.id)}>
                      <XCircle className="h-4 w-4" />
                    </button>
                  </>
                )}
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

      <Modal
        open={modal.open}
        title={modal.mode === 'detail' ? detail?.transfer_number : 'Pengajuan transfer'}
        onClose={() => {
          setModal({ open: false, mode: 'create' });
          setDetail(null);
        }}
        size="lg"
      >
        {modal.mode === 'detail' && detail ? (
          <div className="space-y-2 text-sm">
            <p>Status: {detail.status}</p>
            <p>Ke cabang ID: {detail.to_branch_id}</p>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">Produk</th>
                  <th>Qty</th>
                </tr>
              </thead>
              <tbody>
                {(detail.items || []).map((i) => (
                  <tr key={i.id} className="border-b border-slate-100">
                    <td className="py-2">{i.name}</td>
                    <td>{i.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Cabang tujuan (ID)</label>
              <input name="to_branch_id" type="number" required defaultValue={user?.branch_id || 2} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Catatan</label>
              <textarea name="notes" rows={2} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">Item</span>
                <button
                  type="button"
                  className="text-xs text-brand-600"
                  onClick={() => setLines((ls) => [...ls, { product_id: '', quantity: 1 }])}
                >
                  + Baris
                </button>
              </div>
              {lines.map((ln, idx) => (
                <div key={idx} className="flex gap-2">
                  <select
                    value={ln.product_id}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLines((ls) => ls.map((x, i) => (i === idx ? { ...x, product_id: v } : x)));
                    }}
                    className="flex-1 rounded-xl border border-slate-200 px-2 py-2 text-sm"
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
                      setLines((ls) => ls.map((x, i) => (i === idx ? { ...x, quantity: v } : x)));
                    }}
                    className="w-24 rounded-xl border border-slate-200 px-2 py-2 text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="submit" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
                Kirim
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
