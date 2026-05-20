import { useCallback, useEffect, useRef, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { TrendingUp, Wallet, Package, Building2 } from 'lucide-react';
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

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [omsetRefreshing, setOmsetRefreshing] = useState(false);
  const [omsetBranchId, setOmsetBranchId] = useState('');
  const [omsetCashierId, setOmsetCashierId] = useState('');
  const firstLoad = useRef(true);

  const loadSummary = useCallback(async () => {
    try {
      if (!firstLoad.current) setOmsetRefreshing(true);
      const params = {};
      const res = await dashboardService.summary(params);
      if (res.success) setData(res.data);
      else toast.error(res.message);
    } catch (e) {
      toast.error(e.message);
    } finally {
      if (firstLoad.current) {
        setLoading(false);
        firstLoad.current = false;
      }
      setOmsetRefreshing(false);
    }
  }, [user?.role_slug, omsetBranchId, omsetCashierId]);

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
  const omsetFilters = data?.today_omset_filters;
  const chart = (data?.chart_sales || []).map((r) => ({
    name: chartLabel(r, staffToday),
    total: Number(r.total) || 0,
  }));

  const subtitle = staffToday ? 'Transaksi & omset hari ini (akun Anda)' : 'Ringkasan penjualan & stok toko';
  const trxLabel = staffToday ? 'Transaksi hari ini (akun Anda)' : 'Transaksi (30 hari)';
  const revLabel = staffToday ? 'Pendapatan hari ini (akun Anda)' : 'Pendapatan (30 hari)';
  const topProdLabel = staffToday ? 'Produk terlaris (akun Anda, hari ini)' : 'Produk terlaris';
  const todayLabel = 'Omset hari ini';
  const chartTitle = staffToday ? 'Penjualan akun Anda (hari ini, per jam)' : 'Grafik penjualan (14 hari)';

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={subtitle} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">{trxLabel}</p>
            <TrendingUp className="h-5 w-5 text-emerald-500" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900">{s?.cnt ?? 0}</p>
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
            <p className="text-sm font-medium text-slate-500">{topProdLabel}</p>
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
            <p className="text-sm font-medium text-slate-500">{todayLabel}</p>
            <Building2 className="h-5 w-5 text-indigo-500" />
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{formatCurrency(tom?.total_omset)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {tom?.trx_count ?? 0} transaksi · Laba est. {formatCurrency(tom?.net_profit)}
          </p>
        </div>
      </div>

      {false && tom && (
        <div className="relative mt-6 rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5 shadow-sm">
          {omsetRefreshing ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/60 text-sm font-medium text-slate-600">
              Memuat omset…
            </div>
          ) : null}
          <h3 className="text-sm font-semibold text-slate-900">Omset hari ini (per kanal)</h3>
          <p className="mt-1 text-xs text-slate-600">
            Total omset = jumlah yang perlu di-setor (semua kanal). Laba bersih estimasi dari HPP produk.
            {omsetFilters ? ' Filter di bawah hanya memengaruhi blok omset ini.' : ''}
            {!omsetFilters && staffToday ? ' Hanya menghitung penjualan yang Anda input hari ini.' : ''}
          </p>
          {omsetFilters ? (
            <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-brand-200/80 bg-white/70 p-3">
              {user?.role_slug === 'super_admin' ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Cabang</label>
                  <select
                    value={omsetBranchId}
                    onChange={(e) => {
                      setOmsetBranchId(e.target.value);
                      setOmsetCashierId('');
                    }}
                    className="min-w-[12rem] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Semua cabang</option>
                    {(omsetFilters.branches || []).map((b) => (
                      <option key={b.id} value={String(b.id)}>
                        {b.code} — {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Kasir / karyawan</label>
                <select
                  value={omsetCashierId}
                  onChange={(e) => setOmsetCashierId(e.target.value)}
                  className="min-w-[12rem] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Semua</option>
                  {(omsetFilters.cashiers || []).map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {user?.role_slug === 'super_admin' && c.branch_id != null ? `${c.full_name} (#${c.branch_id})` : c.full_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {[
              { label: 'Penjualan', v: tom.penjualan },
              { label: 'Grosiran', v: tom.grosiran },
              { label: 'Simpel', v: tom.simpel },
              { label: 'Digipos', v: tom.digipos },
              { label: 'Bonafit', v: tom.bonafit },
              { label: 'Sidiva', v: tom.sidiva },
              ...(Number(tom.wallet_lain) > 0 ? [{ label: 'Kanal lain', v: tom.wallet_lain }] : []),
              { label: 'Total omset', v: tom.total_omset, bold: true },
              { label: 'Laba bersih (est.)', v: tom.net_profit, accent: true },
            ].map((x) => (
              <div
                key={x.label}
                className={`rounded-xl border px-3 py-3 ${x.bold ? 'border-brand-300 bg-white' : 'border-slate-100 bg-white/90'} ${x.accent ? 'border-emerald-200 bg-emerald-50/60' : ''}`}
              >
                <p className="text-xs font-medium text-slate-500">{x.label}</p>
                <p className={`mt-1 text-sm font-semibold tabular-nums ${x.bold ? 'text-brand-900' : 'text-slate-900'} ${x.accent ? 'text-emerald-900' : ''}`}>
                  {formatCurrency(x.v)}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {staffToday ? 'Transaksi hari ini (akun Anda)' : 'Transaksi hari ini (sesuai filter)'}: {tom.trx_count ?? 0}
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
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
