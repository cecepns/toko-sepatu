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
import { walletChannelService } from '@/services/walletChannelService';
import { formatCurrency } from '@/utils/format';

export default function PosPage() {
  const { user } = useAuth();
  const cart = usePosCart();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [resellers, setResellers] = useState([]);
  const [barcode, setBarcode] = useState('');
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(user?.branch_id || '');
  const [walletChannels, setWalletChannels] = useState([]);
  const [walletProducts, setWalletProducts] = useState([]);
  const [walletProductsLoading, setWalletProductsLoading] = useState(false);

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
    (async () => {
      try {
        const res = await walletChannelService.list({ active_only: true });
        if (res.success) setWalletChannels(res.data || []);
      } catch {
        setWalletChannels([]);
      }
    })();
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

  const loadWalletProducts = useCallback(async () => {
    const ch = cart.walletChannel;
    if (!ch) {
      setWalletProducts([]);
      return;
    }
    setWalletProductsLoading(true);
    try {
      const res = await walletChannelService.listProducts({ channel_slug: ch, active_only: 'true' });
      if (!res.success) throw new Error(res.message);
      setWalletProducts((res.data || []).filter((p) => p.is_active));
    } catch (e) {
      toast.error(e.message);
      setWalletProducts([]);
    } finally {
      setWalletProductsLoading(false);
    }
  }, [cart.walletChannel]);

  useEffect(() => {
    loadWalletProducts();
  }, [loadWalletProducts]);

  const addByBarcode = async () => {
    if (cart.walletChannel) return toast.error('Matikan kanal aplikasi untuk scan produk stok');
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
      if (it.kind === 'wallet_product') {
        return sum + Number(it.unit_price || 0) * it.quantity;
      }
      const p = it.product;
      const isRes = !!cart.resellerId;
      const qty = it.quantity;
      let price = Number(p.retail_price);
      if (isRes && qty >= Number(p.min_wholesale_qty)) price = Number(p.wholesale_price);
      return sum + price * qty;
    }, 0);
  }, [cart.items, cart.resellerId]);

  const walletChannelLabel = useMemo(
    () => walletChannels.find((c) => c.slug === cart.walletChannel)?.label || cart.walletChannel,
    [walletChannels, cart.walletChannel]
  );

  const onWalletChannelChange = (e) => {
    const v = e.target.value;
    const stockItems = cart.items.filter((i) => i.kind === 'product');
    const walletItems = cart.items.filter((i) => i.kind === 'wallet_product');
    if (v && stockItems.length) {
      toast.error('Hapus produk stok dari keranjang sebelum pilih kanal aplikasi');
      return;
    }
    if (v && cart.walletChannel && v !== cart.walletChannel && walletItems.length) {
      toast.error('Kosongkan keranjang produk kanal sebelum ganti kanal');
      return;
    }
    if (!v && walletItems.length) {
      walletItems.forEach((it) => cart.removeWalletItem(it.wallet_channel_product_id));
    }
    cart.setMeta({ walletChannel: v });
  };

  const taxAmt = ((Math.max(0, subtotal - Number(cart.discount || 0))) * Number(cart.taxPercent || 0)) / 100;
  const grand = Math.max(0, subtotal - Number(cart.discount || 0)) + taxAmt;

  const checkout = async () => {
    if (!cart.items.length) return toast.error('Keranjang kosong');
    const bid = user.branch_id || Number(branchId);
    if (!bid) return toast.error('Pilih cabang');
    try {
      const items = cart.items.map((i) => {
        if (i.kind === 'wallet_product') {
          return {
            wallet_channel_product_id: i.wallet_channel_product_id,
            quantity: i.quantity,
            unit_price: i.unit_price,
          };
        }
        return { product_id: i.product_id, quantity: i.quantity };
      });
      const body = {
        branch_id: bid,
        customer_id: cart.customerId || null,
        reseller_id: cart.resellerId || null,
        items,
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
        subtitle="Tanpa kanal: katalog = stok cabang. Dengan kanal: produk master kanal (tanpa stok) — masuk laporan Harian operator."
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
            <label className="text-sm font-medium text-slate-700">Saldo aplikasi (kanal)</label>
            <select
              value={cart.walletChannel || ''}
              onChange={onWalletChannelChange}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">— Tunai / produk stok cabang —</option>
              {walletChannels.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.label}
                </option>
              ))}
            </select>
            {cart.walletChannel ? (
              <p className="mt-2 text-xs text-slate-600">
                Mode kanal: pilih produk dari master kanal di bawah (tidak mengurangi stok). Keranjang stok harus kosong.
              </p>
            ) : null}
          </div>
          {cart.walletChannel ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-slate-800">Produk kanal — {walletChannelLabel}</p>
              <p className="mt-1 text-xs text-slate-500">Tap untuk tambah ke keranjang. Harga jual bisa diubah di kolom kanan.</p>
              <ul className="mt-3 max-h-72 divide-y divide-slate-100 overflow-y-auto text-sm">
                {walletProductsLoading ? (
                  <li className="py-6 text-center text-slate-500">Memuat…</li>
                ) : !walletProducts.length ? (
                  <li className="py-6 text-center text-slate-500">Belum ada produk aktif — atur di menu Produk kanal aplikasi.</li>
                ) : (
                  walletProducts.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => cart.addWalletProduct(p, 1)}
                        className="flex w-full items-center justify-between gap-3 py-3 pl-1 pr-2 text-left hover:bg-slate-50 sm:pl-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-slate-900">{p.name}</div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            Default {formatCurrency(Number(p.default_sale_price))} · modal {formatCurrency(Number(p.default_cost))}
                          </div>
                        </div>
                        <span className="shrink-0 text-xs font-semibold text-brand-600">+1</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          ) : (
            <>
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
            </>
          )}
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
                disabled={!!cart.walletChannel}
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
            {!cart.walletChannel ? (
              <p className="rounded-lg bg-slate-50 px-2 py-2 text-[11px] leading-relaxed text-slate-600">
                Pilih <strong>Kanal</strong> di kolom kiri untuk penjualan produk kanal. Laporan harian operator mengikuti kanal yang sama.
              </p>
            ) : null}
            <div>
              <label className="text-xs text-slate-500">Catatan</label>
              <textarea value={cart.notes} onChange={(e) => cart.setMeta({ notes: e.target.value })} rows={2} className="mt-1 w-full rounded-xl border border-slate-200 px-2 py-2 text-sm" />
            </div>
          </div>
          <ul className="max-h-56 space-y-2 overflow-y-auto text-sm">
            {cart.items.map((it) => {
              if (it.kind === 'wallet_product') {
                const w = it.wcp;
                return (
                  <li key={`wcp-${it.wallet_channel_product_id}`} className="flex flex-col gap-2 rounded-xl bg-sky-50 px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold uppercase text-sky-900">Kanal</div>
                        <div className="truncate font-medium text-slate-900">{w?.name}</div>
                      </div>
                      <button type="button" onClick={() => cart.removeWalletItem(it.wallet_channel_product_id)} className="shrink-0 text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-[10px] text-slate-600">Harga</label>
                      <input
                        type="number"
                        min={0}
                        step="1"
                        value={it.unit_price}
                        onChange={(e) => cart.setWalletUnitPrice(it.wallet_channel_product_id, e.target.value)}
                        className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                      />
                      <span className="text-xs text-slate-500">×</span>
                      <input
                        type="number"
                        min={1}
                        value={it.quantity}
                        onChange={(e) => cart.setWalletQty(it.wallet_channel_product_id, e.target.value)}
                        className="w-14 rounded-lg border border-slate-200 px-2 py-1 text-center text-xs"
                      />
                    </div>
                  </li>
                );
              }
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
