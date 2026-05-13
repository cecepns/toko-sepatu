import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Select from 'react-select';
import { Plus, Eye, Check, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useServerTable } from '@/hooks/useServerTable';
import { transferService } from '@/services/transferService';
import { productService } from '@/services/productService';
import { branchService } from '@/services/branchService';
import { useAuth } from '@/contexts/AuthContext';
import { confirmToast } from '@/utils/confirm';
import { formatReportDay } from '@/utils/format';
import { iconActionDelete, iconActionNeutral, iconActionToggleOn } from '@/utils/iconActionButton';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const branchSelectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 42,
    borderRadius: '0.75rem',
    borderColor: state.isFocused ? '#0ea5e9' : '#e2e8f0',
    boxShadow: state.isFocused ? '0 0 0 2px rgba(14, 165, 233, 0.15)' : 'none',
    fontSize: '0.875rem',
    '&:hover': { borderColor: '#cbd5e1' },
  }),
  menuPortal: (base) => ({ ...base, zIndex: 100 }),
  menu: (base) => ({ ...base, borderRadius: '0.75rem', overflow: 'hidden' }),
  option: (base, state) => ({
    ...base,
    fontSize: '0.875rem',
    backgroundColor: state.isSelected ? '#0284c7' : state.isFocused ? '#f1f5f9' : 'white',
    color: state.isSelected ? 'white' : '#1e293b',
  }),
  singleValue: (base) => ({ ...base, color: '#0f172a' }),
  placeholder: (base) => ({ ...base, color: '#94a3b8' }),
};

export default function TransfersPage() {
  const { user } = useAuth();
  const isSuper = user?.role_slug === 'super_admin';
  const isKasir = user?.role_slug === 'kasir';
  const fetcher = useCallback((p) => transferService.list(p), []);
  const t = useServerTable(fetcher);
  const [modal, setModal] = useState({ open: false, mode: 'create' });
  const [detail, setDetail] = useState(null);
  const [products, setProducts] = useState([]);
  const [lines, setLines] = useState([{ product_id: '', quantity: 1 }]);
  const [branchOptions, setBranchOptions] = useState([]);
  const [selectedToBranch, setSelectedToBranch] = useState(null);
  const [kasirBranchLabel, setKasirBranchLabel] = useState('');
  const [transferDate, setTransferDate] = useState(todayISO);

  useEffect(() => {
    if (!modal.open || modal.mode !== 'create') return;
    let cancelled = false;
    (async () => {
      try {
        const [prRes, brRes] = await Promise.all([
          productService.list({ limit: 200 }),
          isKasir ? Promise.resolve({ success: true, data: [] }) : branchService.list({ limit: 200 }),
        ]);
        if (cancelled) return;
        if (prRes.success) setProducts(prRes.data || []);
        if (isKasir && user?.branch_id) {
          const kb = await branchService.list({ limit: 200 });
          if (!cancelled && kb.success) {
            const b = (kb.data || []).find((x) => Number(x.id) === Number(user.branch_id));
            if (b) setKasirBranchLabel(`${b.code} — ${b.name}`);
          }
        } else if (!isKasir && brRes.success) {
          const opts = (brRes.data || []).map((b) => ({
            value: b.id,
            label: `${b.code} — ${b.name}`,
          }));
          setBranchOptions(opts);
          if (opts.length === 1) setSelectedToBranch(opts[0]);
          else setSelectedToBranch(null);
        }
      } catch {
        /* */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modal.open, modal.mode, isKasir, user?.branch_id]);

  useEffect(() => {
    if (modal.open && modal.mode === 'create') setTransferDate(todayISO());
  }, [modal.open, modal.mode]);

  const submit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const to_branch_id = isKasir ? Number(user?.branch_id) : Number(selectedToBranch?.value);
    if (!isKasir && !to_branch_id) return toast.error('Pilih cabang tujuan');
    const items = lines
      .filter((l) => l.product_id && Number(l.quantity) > 0)
      .map((l) => ({ product_id: Number(l.product_id), quantity: Number(l.quantity) }));
    if (!items.length) return toast.error('Tambah minimal satu item');
    try {
      await transferService.create({
        to_branch_id,
        items,
        notes: fd.get('notes') || '',
        transfer_date: transferDate,
      });
      toast.success('Pengajuan dikirim');
      setModal({ open: false, mode: 'create' });
      setLines([{ product_id: '', quantity: 1 }]);
      setSelectedToBranch(null);
      setBranchOptions([]);
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
        subtitle={
          isKasir
            ? 'Ajuan minta stok ke pusat — disetujui super admin jika stok gudang mencukupi'
            : 'Pusat → cabang, approval super admin'
        }
        action={
          <button
            type="button"
            onClick={() => {
              setLines([{ product_id: '', quantity: 1 }]);
              setSelectedToBranch(null);
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
          {
            key: 'transfer_date',
            label: 'Tanggal',
            sortable: true,
            render: (row) => <span className="tabular-nums text-slate-800">{formatReportDay(row.transfer_date)}</span>,
          },
          { key: 'to_branch_name', label: 'Ke cabang' },
          { key: 'status', label: 'Status', sortable: true },
          { key: 'requested_by_name', label: 'Pemohon' },
          {
            key: 'a',
            label: '',
            render: (row) => (
              <div className="flex gap-1.5">
                <button type="button" title="Detail" className={iconActionNeutral} onClick={() => openDetail(row.id)}>
                  <Eye className="h-4 w-4" />
                </button>
                {isSuper && row.status === 'pending' && (
                  <>
                    <button type="button" title="Setujui" className={iconActionToggleOn} onClick={() => approve(row.id)}>
                      <Check className="h-4 w-4" />
                    </button>
                    <button type="button" title="Tolak" className={iconActionDelete} onClick={() => reject(row.id)}>
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
            <p>
              Ke cabang: <span className="font-medium text-slate-900">{detail.to_branch_name || `ID ${detail.to_branch_id}`}</span>
            </p>
            <p>
              Tanggal transfer:{' '}
              <span className="font-medium text-slate-900">{formatReportDay(detail.transfer_date)}</span>
            </p>
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
            {!isKasir ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="transfer-to-branch">
                  Cabang tujuan
                </label>
                <Select
                  inputId="transfer-to-branch"
                  instanceId="transfer-to-branch"
                  placeholder="Pilih cabang…"
                  isSearchable
                  options={branchOptions}
                  value={selectedToBranch}
                  onChange={(opt) => setSelectedToBranch(opt)}
                  styles={branchSelectStyles}
                  menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
                  menuPosition="fixed"
                  noOptionsMessage={() => 'Tidak ada cabang'}
                />
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium text-slate-600">Cabang</label>
                <p className="mt-1 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {kasirBranchLabel || 'Cabang Anda'} (pengajuan hanya untuk cabang ini)
                </p>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="transfer-date">
                Tanggal transfer
              </label>
              <input
                id="transfer-date"
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
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
