import { useCallback, useEffect, useRef, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { TrendingUp, Wallet, Package, Tags, Award, Footprints, Boxes } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { dashboardService } from '@/services/dashboardService';
import { formatCurrency } from '@/utils/format';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';

function chartLabel(row, staffToday) {
  if (staffToday && row.h != null) {
    const h = Number(row.h);
    return `${String(Number.isFinite(h) ? h : 0).padStart(2, '0')}:00`;
  }
  return row.d;
}

function TopList({ title, icon: Icon, items, valueKey = 'qty', emptyText = 'Belum ada data' }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-5 w-5 text-brand-600" />
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      </div>
      <ul className="space-y-1.5 text-sm text-slate-700">
        {(items || []).slice(0, 5).map((p) => (
          <li key={p.name || p.brand} className="flex justify-between gap-2">
            <span className="truncate">{p.name || p.brand}</span>
            <span className="shrink-0 tabular-nums text-slate-500">{p[valueKey]}</span>
          </li>
        ))}
        {!items?.length && <li className="text-slate-400">{emptyText}</li>}
      </ul>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const firstLoad = useRef(true);

  const loadSummary = useCallback(async () => {
    try {
      const res = await dashboardService.summary({});
      if (res.success) setData(res.data);
      else toast.error(res.message);
    } catch (e) {
      toast.error(e.message);
    } finally {
      if (firstLoad.current) {
        setLoading(false);
        firstLoad.current = false;
      }
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-slate-200" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  const staffToday = data?.scope === 'staff_today';
  const s = data?.sales_30d;
  const tom = data?.today_omset;
  const inv = data?.inventory;
  const chart = (data?.chart_sales || []).map((r) => ({
    name: chartLabel(r, staffToday),
    total: Number(r.total) || 0,
  }));

  const subtitle = staffToday ? 'Ringkasan hari ini (akun Anda)' : 'Ringkasan penjualan, stok & pembayaran';
  const trxLabel = staffToday ? 'Transaksi hari ini' : 'Transaksi (30 hari)';
  const revLabel = staffToday ? 'Pendapatan hari ini' : 'Pendapatan (30 hari)';
  const topProdLabel = staffToday ? 'Produk terlaris (hari ini)' : 'Produk terlaris (30 hari)';
  const topCatLabel = staffToday ? 'Kategori terlaris (hari ini)' : 'Kategori terlaris (30 hari)';
  const topBrandLabel = staffToday ? 'Merek terlaris (hari ini)' : 'Merek terlaris (30 hari)';
  const chartTitle = staffToday ? 'Penjualan per jam (hari ini)' : 'Grafik penjualan (14 hari)';

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle={subtitle} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">{trxLabel}</p>
            <TrendingUp className="h-5 w-5 text-emerald-500" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900">{s?.count ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">{revLabel}</p>
            <Wallet className="h-5 w-5 text-brand-600" />
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{formatCurrency(s?.revenue)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">Total sepatu di toko</p>
            <Footprints className="h-5 w-5 text-indigo-500" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900">{Number(inv?.total_pairs) || 0}</p>
          <p className="mt-1 text-xs text-slate-500">pasang (jumlah stok semua varian aktif)</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">Total aset (modal stok)</p>
            <Boxes className="h-5 w-5 text-amber-600" />
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{formatCurrency(inv?.total_asset)}</p>
          <p className="mt-1 text-xs text-slate-500">Σ qty × HPP varian aktif</p>
        </div>
      </div>

      <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50/80 to-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Omset & pembayaran hari ini</h3>
        <p className="mt-1 text-xs text-slate-600">
          {tom?.trx_count ?? 0} transaksi · Laba bersih estimasi {formatCurrency(tom?.net_profit)}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-slate-100 bg-white px-3 py-3">
            <p className="text-xs font-medium text-slate-500">Total omset</p>
            <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">{formatCurrency(tom?.total_omset)}</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-3">
            <p className="text-xs font-medium text-emerald-800">Tunai</p>
            <p className="mt-1 text-sm font-bold tabular-nums text-emerald-900">{formatCurrency(tom?.omset_cash)}</p>
            <p className="text-[11px] text-emerald-700">{tom?.trx_cash ?? 0} trx</p>
          </div>
          <div className="rounded-xl border border-sky-100 bg-sky-50/50 px-3 py-3">
            <p className="text-xs font-medium text-sky-800">Non tunai</p>
            <p className="mt-1 text-sm font-bold tabular-nums text-sky-900">{formatCurrency(tom?.omset_non_cash)}</p>
            <p className="text-[11px] text-sky-700">{tom?.trx_non_cash ?? 0} trx</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <TopList title={topProdLabel} icon={Package} items={data?.top_products} />
        <TopList title={topCatLabel} icon={Tags} items={data?.top_categories} />
        <TopList title={topBrandLabel} icon={Award} items={data?.top_brands} valueKey="qty" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-slate-800">{chartTitle}</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart}>
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FF202E" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#FF202E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Area type="monotone" dataKey="total" stroke="#E61E2A" fill="url(#g)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-amber-900">Stok hampir habis</h3>
          <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
            {(data?.low_stock || []).map((r) => (
              <li key={`${r.sku}-${r.name}`} className="rounded-xl bg-white/80 px-3 py-2 text-slate-800 shadow-sm">
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-slate-500">
                  {r.sku} — stok {r.quantity} (min {r.min_stock})
                </div>
              </li>
            ))}
            {!data?.low_stock?.length && <li className="text-amber-800/80">Tidak ada peringatan</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
