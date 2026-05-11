import { useEffect, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { TrendingUp, Wallet, Package, Building2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { dashboardService } from '@/services/dashboardService';
import { formatCurrency } from '@/utils/format';
import toast from 'react-hot-toast';

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await dashboardService.summary();
        if (res.success) setData(res.data);
        else toast.error(res.message);
      } catch (e) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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

  const s = data?.sales_30d;
  const chart = (data?.chart_sales || []).map((r) => ({
    name: r.d,
    total: Number(r.total) || 0,
  }));

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Ringkasan performa & stok" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">Transaksi (30 hari)</p>
            <TrendingUp className="h-5 w-5 text-emerald-500" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900">{s?.cnt ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">Pendapatan (30 hari)</p>
            <Wallet className="h-5 w-5 text-brand-600" />
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{formatCurrency(s?.revenue)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">Produk terlaris</p>
            <Package className="h-5 w-5 text-amber-500" />
          </div>
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            {(data?.top_products || []).slice(0, 3).map((p) => (
              <li key={p.name} className="flex justify-between gap-2">
                <span className="truncate">{p.name}</span>
                <span className="shrink-0 text-slate-500">{p.qty}</span>
              </li>
            ))}
            {!data?.top_products?.length && <li className="text-slate-400">Belum ada data</li>}
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">Cabang terbaik</p>
            <Building2 className="h-5 w-5 text-indigo-500" />
          </div>
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            {(data?.top_branches || []).slice(0, 3).map((b) => (
              <li key={b.name} className="flex justify-between gap-2">
                <span className="truncate">{b.name}</span>
                <span className="shrink-0 text-slate-500">{formatCurrency(b.revenue)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-slate-800">Grafik penjualan (14 hari)</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart}>
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Area type="monotone" dataKey="total" stroke="#0284c7" fill="url(#g)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-amber-900">Stok hampir habis</h3>
          <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
            {(data?.low_stock || []).map((r) => (
              <li key={`${r.branch_name}-${r.name}`} className="rounded-xl bg-white/80 px-3 py-2 text-slate-800 shadow-sm">
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-slate-500">
                  {r.branch_name} — stok {r.quantity} (min {r.min_stock})
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
