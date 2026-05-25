import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ScanBarcode, Trash2, ShoppingBag, CreditCard } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { usePosCart } from '@/store/posCart';
import { variantService } from '@/services/productModelService';
import { saleService } from '@/services/saleService';
import { formatCurrency } from '@/utils/format';
import { PAYMENT_METHODS, sportTypeLabel, variantDisplayName } from '@/utils/constants';

export default function PosPage() {
  const cart = usePosCart();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [barcode, setBarcode] = useState('');

  const search = useCallback(async (term) => {
    try {
      const params = { limit: 12, page: 1, sort: 'name', order: 'asc', active_only: true, in_stock: false };
      const t = term.trim();
      if (t) params.search = t;
      const res = await variantService.list(params);
      if (res.success) setHits(res.data || []);
    } catch {
      setHits([]);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(q), 300);
    return () => clearTimeout(timer);
  }, [q, search]);

  const addByBarcode = async () => {
    const code = barcode.trim();
    if (!code) return;
    try {
      const res = await variantService.list({ search: code, limit: 5, page: 1, active_only: true });
      const row = (res.data || []).find((p) => p.barcode === code) || res.data?.[0];
      if (!row) return toast.error('Varian tidak ditemukan');
      if (Number(row.quantity) < 1) return toast.error('Stok kosong');
      cart.addItem(row, 1);
      setBarcode('');
      toast.success('Ditambahkan ke keranjang');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const subtotal = useMemo(() => {
    return cart.items.reduce((sum, it) => {
      const price = Number(it.variant.effective_price ?? it.variant.retail_price) || 0;
      return sum + price * it.quantity;
    }, 0);
  }, [cart.items]);

  const taxAmt = ((Math.max(0, subtotal - Number(cart.discount || 0))) * Number(cart.taxPercent || 0)) / 100;
  const grand = Math.max(0, subtotal - Number(cart.discount || 0)) + taxAmt;

  const checkout = async () => {
    if (!cart.items.length) return toast.error('Keranjang kosong');
    try {
      const items = cart.items.map((i) => ({
        variant_id: i.variant_id,
        quantity: i.quantity,
      }));
      const res = await saleService.create({
        customer_id: cart.customerId || null,
        items,
        discount_amount: Number(cart.discount) || 0,
        tax_percent: Number(cart.taxPercent) || 0,
        notes: cart.notes || '',
        payment_method: cart.paymentMethod || 'cash',
      });
      if (!res.success) throw new Error(res.message);
      toast.success(`Transaksi ${res.data.sale_number}`);
      cart.clear();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="POS" subtitle="Jual per varian: warna, ukuran, futsal / sepak bola" />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
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
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Nama model / SKU / warna"
            />
            <ul className="mt-3 max-h-72 divide-y divide-slate-100 overflow-y-auto text-sm">
              {hits.map((v) => {
                const stock = Number(v.quantity ?? 0);
                const outOfStock = stock < 1;
                const price = Number(v.effective_price ?? v.retail_price);
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      disabled={outOfStock}
                      onClick={() => cart.addItem(v, 1)}
                      className={`flex w-full items-center justify-between gap-3 py-3 text-left ${
                        outOfStock ? 'cursor-not-allowed opacity-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-900">{variantDisplayName(v)}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {v.sku} · {sportTypeLabel(v.sport_type)} · Stok {outOfStock ? 'kosong' : stock} · {formatCurrency(price)}
                        </div>
                      </div>
                      {!outOfStock ? <span className="shrink-0 text-xs font-semibold text-brand-600">+1</span> : null}
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
              <label className="text-xs font-medium text-slate-600">Metode pembayaran</label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => cart.setMeta({ paymentMethod: m.value })}
                    className={`rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${
                      cart.paymentMethod === m.value
                        ? 'border-brand-600 bg-brand-600 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
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
          <ul className="max-h-56 space-y-2 overflow-y-auto text-sm">
            {cart.items.map((it) => {
              const v = it.variant;
              const price = Number(v.effective_price ?? v.retail_price);
              return (
                <li key={it.variant_id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{variantDisplayName(v)}</div>
                    <div className="text-xs text-slate-500">{formatCurrency(price)}</div>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={v.quantity}
                    value={it.quantity}
                    onChange={(e) => cart.setQty(it.variant_id, e.target.value)}
                    className="w-14 rounded-lg border border-slate-200 px-2 py-1 text-center text-xs"
                  />
                  <button type="button" onClick={() => cart.removeItem(it.variant_id)} className="text-red-600">
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
