import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ScanBarcode, Trash2, ShoppingBag, CreditCard } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { usePosCart } from '@/store/posCart';
import { productService } from '@/services/productService';
import { resellerService } from '@/services/resellerService';
import { saleService } from '@/services/saleService';
import { branchService } from '@/services/branchService';
import { reportService } from '@/services/reportService';
import { formatCurrency } from '@/utils/format';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const WALLET_LABEL = { simpel: 'Simpel', digipos: 'Digipos', bonafit: 'Bonafit' };

export default function PosPage() {
  const { user } = useAuth();
  const cart = usePosCart();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [resellers, setResellers] = useState([]);
  const [barcode, setBarcode] = useState('');
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(user?.branch_id || '');
  const [walletManual, setWalletManual] = useState(null);
  const [walletManualLoading, setWalletManualLoading] = useState(false);
  const [wmForm, setWmForm] = useState({ phone: '', desc: '', cost: '', sale: '' });
  const [walletTopup, setWalletTopup] = useState(null);
  const [walletTopupLoading, setWalletTopupLoading] = useState(false);
  const [wtForm, setWtForm] = useState({ amount: '', notes: '' });

  useEffect(() => {
    if (!user?.branch_id) {
      (async () => {
        try {
          const res = await branchService.list({ limit: 50 });
          if (res.success) {
            setBranches(res.data || []);
            if (res.data?.[0]) setBranchId(res.data[0].id);
          }
        } catch {
          /* */
        }
      })();
    }
  }, [user?.branch_id]);

  const effectiveBranchId = user?.branch_id || Number(branchId) || 0;

  const search = useCallback(async (term, bid) => {
    try {
      const params = { limit: 10, page: 1, sort: 'name', order: 'asc' };
      if (bid > 0) params.branch_id = bid;
      const t = term.trim();
      if (t) params.search = t;
      const res = await productService.list(params);
      if (res.success) setHits(res.data || []);
    } catch {
      setHits([]);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(q, effectiveBranchId), 300);
    return () => clearTimeout(t);
  }, [q, search, effectiveBranchId]);

  useEffect(() => {
    (async () => {
      try {
        const res = await resellerService.list({ limit: 100, page: 1 });
        if (res.success) setResellers(res.data || []);
      } catch {
        /* */
      }
    })();
  }, []);

  const loadWalletManual = useCallback(async () => {
    const bid = effectiveBranchId;
    const ch = cart.walletChannel;
    if (!bid || !ch) {
      setWalletManual(null);
      return;
    }
    setWalletManualLoading(true);
    try {
      const res = await reportService.listWalletManualLines({
        branch_id: bid,
        line_date: todayISO(),
        channel: ch,
      });
      if (!res.success) throw new Error(res.message);
      setWalletManual(res.data || { lines: [], total_modal: 0, total_sale: 0, profit: 0 });
    } catch (e) {
      toast.error(e.message);
      setWalletManual(null);
    } finally {
      setWalletManualLoading(false);
    }
  }, [effectiveBranchId, cart.walletChannel]);

  useEffect(() => {
    loadWalletManual();
  }, [loadWalletManual]);

  const loadWalletTopups = useCallback(async () => {
    const bid = effectiveBranchId;
    const ch = cart.walletChannel;
    if (!bid || !ch) {
      setWalletTopup(null);
      return;
    }
    setWalletTopupLoading(true);
    try {
      const res = await reportService.listWalletTopups({
        branch_id: bid,
        topup_date: todayISO(),
        channel: ch,
      });
      if (!res.success) throw new Error(res.message);
      setWalletTopup(res.data || { lines: [], total_topup: 0 });
    } catch (e) {
      toast.error(e.message);
      setWalletTopup(null);
    } finally {
      setWalletTopupLoading(false);
    }
  }, [effectiveBranchId, cart.walletChannel]);

  useEffect(() => {
    loadWalletTopups();
  }, [loadWalletTopups]);

  const addWalletManualRow = async () => {
    const bid = effectiveBranchId;
    const ch = cart.walletChannel;
    if (!bid || !ch) return toast.error('Pilih cabang dan kanal saldo aplikasi');
    const desc = (wmForm.desc || '').trim();
    if (!desc) return toast.error('Isi keterangan produk');
    const cost = wmForm.cost === '' ? 0 : Number(wmForm.cost);
    const sale = wmForm.sale === '' ? 0 : Number(wmForm.sale);
    if (Number.isNaN(cost) || cost < 0 || Number.isNaN(sale) || sale < 0) return toast.error('Modal dan harga jual harus angka valid');
    try {
      const res = await reportService.addWalletManualLine({
        branch_id: bid,
        line_date: todayISO(),
        channel: ch,
        customer_phone: (wmForm.phone || '').trim() || null,
        description: desc,
        cost_amount: cost,
        sale_amount: sale,
      });
      if (!res.success) throw new Error(res.message);
      toast.success(res.message || 'Baris ditambahkan');
      setWmForm({ phone: '', desc: '', cost: '', sale: '' });
      loadWalletManual();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const deleteWalletManualRow = async (id) => {
    try {
      const res = await reportService.deleteWalletManualLine(id);
      if (!res.success) throw new Error(res.message);
      toast.success(res.message || 'Dihapus');
      loadWalletManual();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const addWalletTopupRow = async () => {
    const bid = effectiveBranchId;
    const ch = cart.walletChannel;
    if (!bid || !ch) return toast.error('Pilih cabang dan kanal saldo aplikasi');
    const amt = wtForm.amount === '' ? NaN : Number(wtForm.amount);
    if (Number.isNaN(amt) || amt <= 0) return toast.error('Nominal saldo masuk harus lebih dari 0');
    try {
      const res = await reportService.addWalletTopup({
        branch_id: bid,
        topup_date: todayISO(),
        channel: ch,
        amount: amt,
        notes: (wtForm.notes || '').trim() || null,
      });
      if (!res.success) throw new Error(res.message);
      toast.success(res.message || 'Saldo masuk tercatat');
      setWtForm({ amount: '', notes: '' });
      loadWalletTopups();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const deleteWalletTopupRow = async (id) => {
    try {
      const res = await reportService.deleteWalletTopup(id);
      if (!res.success) throw new Error(res.message);
      toast.success(res.message || 'Dihapus');
      loadWalletTopups();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const addByBarcode = async () => {
    const code = barcode.trim();
    if (!code) return;
    const bid = user?.branch_id || Number(branchId);
    if (!bid) return toast.error('Pilih cabang penjualan dulu');
    try {
      const res = await productService.list({ search: code, limit: 5, page: 1, branch_id: bid });
      const row = (res.data || []).find((p) => p.barcode === code) || res.data?.[0];
      if (!row) return toast.error('Produk tidak ditemukan');
      const stock = Number(row.branch_stock ?? 0);
      if (stock < 1) return toast.error('Stok cabang kosong');
      cart.addItem(row, 1);
      setBarcode('');
      toast.success(`${row.name} ditambahkan`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const subtotal = useMemo(() => {
    return cart.items.reduce((sum, it) => {
      const p = it.product;
      const isRes = !!cart.resellerId;
      const qty = it.quantity;
      let price = Number(p.retail_price);
      if (isRes && qty >= Number(p.min_wholesale_qty)) price = Number(p.wholesale_price);
      return sum + price * qty;
    }, 0);
  }, [cart.items, cart.resellerId]);

  const taxAmt = ((Math.max(0, subtotal - Number(cart.discount || 0))) * Number(cart.taxPercent || 0)) / 100;
  const grand = Math.max(0, subtotal - Number(cart.discount || 0)) + taxAmt;

  const checkout = async () => {
    if (!cart.items.length) return toast.error('Keranjang kosong');
    const bid = user.branch_id || Number(branchId);
    if (!bid) return toast.error('Pilih cabang');
    try {
      const body = {
        branch_id: bid,
        customer_id: cart.customerId || null,
        reseller_id: cart.resellerId || null,
        items: cart.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
        discount_amount: Number(cart.discount) || 0,
        tax_percent: Number(cart.taxPercent) || 0,
        notes: cart.notes || '',
        payment_method: 'cash',
        wallet_channel: cart.walletChannel || null,
      };
      const res = await saleService.create(body);
      if (!res.success) throw new Error(res.message);
      toast.success(`Transaksi ${res.data.sale_number}`);
      cart.clear();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="POS / Penjualan"
        subtitle="Produk katalog = stok cabang. Kanal saldo = catat pulsa/PLN manual (modal vs jual) — sama dengan laporan Harian operator."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {!user?.branch_id && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <label className="font-medium">Cabang penjualan</label>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="mt-2 w-full rounded-xl border border-amber-200 bg-white px-3 py-2">
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <ScanBarcode className="h-4 w-4" /> Scan barcode
            </label>
            <div className="mt-2 flex gap-2">
              <input
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addByBarcode()}
                placeholder="Scan / ketik barcode"
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <button type="button" onClick={addByBarcode} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                Tambah
              </button>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="text-sm font-medium text-slate-700">Cari produk</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Nama / SKU" />
            <ul className="mt-3 max-h-64 divide-y divide-slate-100 overflow-y-auto text-sm">
              {hits.map((p) => {
                const stock = Number(p.branch_stock ?? 0);
                const noBranch = !effectiveBranchId;
                const outOfStock = effectiveBranchId > 0 && stock < 1;
                const disabled = noBranch || outOfStock;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (disabled) return;
                        cart.addItem(p, 1);
                      }}
                      className={`flex w-full items-center justify-between gap-3 py-3 pl-1 pr-2 text-left sm:pl-2 ${
                        disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer hover:bg-slate-50 active:bg-slate-100'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-900">{p.name}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                          <span>{p.sku}</span>
                          {effectiveBranchId > 0 ? (
                            <span className={outOfStock ? 'font-medium text-amber-800' : 'text-slate-600'}>
                              Stok: {outOfStock ? 'kosong' : stock}
                            </span>
                          ) : (
                            <span className="text-amber-800">Pilih cabang</span>
                          )}
                        </div>
                      </div>
                      {!disabled ? <span className="shrink-0 text-xs font-semibold text-brand-600">+1</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-slate-800">
            <ShoppingBag className="h-5 w-5" />
            <span className="font-semibold">Keranjang</span>
          </div>
          <div className="mb-3 space-y-2 text-sm">
            <div>
              <label className="text-xs text-slate-500">Reseller (untuk harga grosir)</label>
              <select
                value={cart.resellerId || ''}
                onChange={(e) => cart.setMeta({ resellerId: e.target.value ? Number(e.target.value) : null })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-2 py-2 text-sm"
              >
                <option value="">— Umum (eceran) —</option>
                {resellers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.company_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500">Diskon</label>
                <input
                  type="number"
                  value={cart.discount}
                  onChange={(e) => cart.setMeta({ discount: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-2 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Pajak %</label>
                <input
                  type="number"
                  value={cart.taxPercent}
                  onChange={(e) => cart.setMeta({ taxPercent: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-2 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500">Saldo aplikasi (top-up / non tunai)</label>
              <select
                value={cart.walletChannel || ''}
                onChange={(e) => cart.setMeta({ walletChannel: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 px-2 py-2 text-sm"
              >
                <option value="">— Tunai / tidak pakai kanal —</option>
                <option value="simpel">Simpel</option>
                <option value="digipos">Digipos</option>
                <option value="bonafit">Bonafit</option>
              </select>
            </div>
            {!cart.walletChannel ? (
              <p className="rounded-lg bg-slate-50 px-2 py-2 text-[11px] leading-relaxed text-slate-600">
                Pilih <strong>Saldo aplikasi</strong> untuk form <strong>Input manual</strong> (penjualan tanpa master) dan <strong>Saldo masuk</strong> (top-up). Keduanya masuk{' '}
                <strong>Laporan → Harian operator</strong>.
              </p>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/90 p-3">
                <p className="text-xs font-semibold text-slate-800">Input manual — {WALLET_LABEL[cart.walletChannel] || cart.walletChannel}</p>
                <p className="mt-0.5 text-[11px] text-slate-600">Tanpa master produk. Modal = potong saldo aplikasi. Tercatat per tanggal hari ini.</p>
                <div className="mt-2 grid gap-2">
                  <input
                    type="text"
                    inputMode="tel"
                    placeholder="No. HP (opsional)"
                    value={wmForm.phone}
                    onChange={(e) => setWmForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Keterangan / nama produk"
                    value={wmForm.desc}
                    onChange={(e) => setWmForm((f) => ({ ...f, desc: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min={0}
                      step="1"
                      placeholder="Modal"
                      value={wmForm.cost}
                      onChange={(e) => setWmForm((f) => ({ ...f, cost: e.target.value }))}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                    />
                    <input
                      type="number"
                      min={0}
                      step="1"
                      placeholder="Harga jual"
                      value={wmForm.sale}
                      onChange={(e) => setWmForm((f) => ({ ...f, sale: e.target.value }))}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addWalletManualRow}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                  >
                    Tambah baris
                  </button>
                </div>
                <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white text-xs">
                  {walletManualLoading ? (
                    <p className="p-3 text-center text-slate-500">Memuat…</p>
                  ) : !(walletManual?.lines || []).length ? (
                    <p className="p-3 text-center text-slate-500">Belum ada baris hari ini</p>
                  ) : (
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50 text-slate-600">
                          <th className="px-2 py-1.5 font-medium">Keterangan</th>
                          <th className="px-2 py-1.5 text-right font-medium">Modal</th>
                          <th className="px-2 py-1.5 text-right font-medium">Jual</th>
                          <th className="w-12" />
                        </tr>
                      </thead>
                      <tbody>
                        {(walletManual.lines || []).map((row) => (
                          <tr key={row.id} className="border-b border-slate-50">
                            <td className="px-2 py-1.5">
                              <div className="font-medium text-slate-900">{row.description}</div>
                              {row.customer_phone ? <div className="text-[10px] text-slate-500">{row.customer_phone}</div> : null}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(Number(row.cost_amount))}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(Number(row.sale_amount))}</td>
                            <td className="px-1 py-1.5 text-center">
                              <button type="button" onClick={() => deleteWalletManualRow(row.id)} className="text-red-600 hover:underline">
                                Hapus
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                {walletManual && !walletManualLoading ? (
                  <div className="mt-2 space-y-0.5 border-t border-slate-200 pt-2 text-[11px] text-slate-700">
                    <div className="flex justify-between">
                      <span>Total modal (estimasi)</span>
                      <span className="font-semibold">{formatCurrency(Number(walletManual.total_modal || 0))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total jual</span>
                      <span className="font-semibold">{formatCurrency(Number(walletManual.total_sale || 0))}</span>
                    </div>
                    <div className="flex justify-between text-slate-900">
                      <span>Profit (jual − modal)</span>
                      <span className="font-bold">{formatCurrency(Number(walletManual.profit || 0))}</span>
                    </div>
                  </div>
                ) : null}
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                  <p className="text-xs font-semibold text-emerald-900">Saldo masuk (top-up)</p>
                  <p className="mt-0.5 text-[11px] text-emerald-800/90">Transfer/isi saldo ke aplikasi — tidak mengurangi stok.</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min={1}
                      step="1"
                      placeholder="Nominal"
                      value={wtForm.amount}
                      onChange={(e) => setWtForm((f) => ({ ...f, amount: e.target.value }))}
                      className="rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Keterangan (opsional)"
                      value={wtForm.notes}
                      onChange={(e) => setWtForm((f) => ({ ...f, notes: e.target.value }))}
                      className="rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addWalletTopupRow}
                    className="mt-2 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-50"
                  >
                    Catat saldo masuk
                  </button>
                  <div className="mt-2 max-h-32 overflow-y-auto rounded border border-emerald-100 bg-white text-[11px]">
                    {walletTopupLoading ? (
                      <p className="p-2 text-center text-slate-500">Memuat…</p>
                    ) : !(walletTopup?.lines || []).length ? (
                      <p className="p-2 text-center text-slate-500">Belum ada top-up hari ini</p>
                    ) : (
                      <ul className="divide-y divide-emerald-50">
                        {(walletTopup.lines || []).map((row) => (
                          <li key={row.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                            <span className="min-w-0 truncate text-slate-700">{row.notes || '—'}</span>
                            <span className="shrink-0 font-medium tabular-nums">{formatCurrency(Number(row.amount))}</span>
                            <button type="button" onClick={() => deleteWalletTopupRow(row.id)} className="shrink-0 text-red-600 hover:underline">
                              Hapus
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {walletTopup && !walletTopupLoading ? (
                    <div className="mt-2 border-t border-emerald-200 pt-2 text-[11px] font-semibold text-emerald-900">
                      Total saldo masuk hari ini: {formatCurrency(Number(walletTopup.total_topup || 0))}
                    </div>
                  ) : null}
                </div>
              </div>
            )}
            <div>
              <label className="text-xs text-slate-500">Catatan</label>
              <textarea value={cart.notes} onChange={(e) => cart.setMeta({ notes: e.target.value })} rows={2} className="mt-1 w-full rounded-xl border border-slate-200 px-2 py-2 text-sm" />
            </div>
          </div>
          <ul className="max-h-56 space-y-2 overflow-y-auto text-sm">
            {cart.items.map((it) => {
              const p = it.product;
              const isRes = !!cart.resellerId;
              const price = isRes && it.quantity >= Number(p.min_wholesale_qty) ? Number(p.wholesale_price) : Number(p.retail_price);
              return (
                <li key={it.product_id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="text-xs text-slate-500">{formatCurrency(price)} ×</div>
                  </div>
                  <input
                    type="number"
                    min={1}
                    value={it.quantity}
                    onChange={(e) => cart.setQty(it.product_id, e.target.value)}
                    className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center text-xs"
                  />
                  <button type="button" onClick={() => cart.removeItem(it.product_id)} className="text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Pajak</span>
              <span>{formatCurrency(taxAmt)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-slate-900">
              <span>Total</span>
              <span>{formatCurrency(grand)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={checkout}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <CreditCard className="h-4 w-4" /> Bayar / Simpan
          </button>
        </div>
      </div>
    </div>
  );
}
