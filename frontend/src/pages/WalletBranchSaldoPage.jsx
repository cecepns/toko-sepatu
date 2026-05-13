import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { branchService } from '@/services/branchService';
import { walletChannelService } from '@/services/walletChannelService';
import { reportService } from '@/services/reportService';
import { formatCurrency } from '@/utils/format';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function WalletBranchSaldoPage() {
  const { user } = useAuth();
  const isSuper = user?.role_slug === 'super_admin';
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(isSuper ? '' : String(user?.branch_id || ''));
  const [channels, setChannels] = useState([]);
  const [channel, setChannel] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [summary, setSummary] = useState(null);
  const [sumLoading, setSumLoading] = useState(false);
  const [activity, setActivity] = useState([]);
  const [actLoading, setActLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [actMeta, setActMeta] = useState({ total: 0, totalPages: 1 });
  const limit = 15;
  const [topupForm, setTopupForm] = useState({ topup_date: todayISO(), amount: '', notes: '' });

  useEffect(() => {
    if (!isSuper) return;
    (async () => {
      try {
        const res = await branchService.list({ limit: 100 });
        if (res.success && res.data?.length) {
          setBranches(res.data);
          setBranchId((prev) => prev || String(res.data[0].id));
        }
      } catch {
        /* */
      }
    })();
  }, [isSuper]);

  useEffect(() => {
    (async () => {
      try {
        const res = await walletChannelService.list({ active_only: true });
        if (res.success) {
          const list = res.data || [];
          setChannels(list);
          setChannel((prev) => prev || list[0]?.slug || '');
        }
      } catch {
        /* */
      }
    })();
  }, []);

  const effectiveBranch = isSuper ? Number(branchId) : Number(user?.branch_id) || 0;

  const loadSummary = useCallback(async () => {
    if (!effectiveBranch || !channel) return;
    setSumLoading(true);
    try {
      const params = { branch_id: effectiveBranch, channel };
      if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to) {
        params.from = from;
        params.to = to;
      }
      const res = await reportService.walletBranchSummary(params);
      if (!res.success) throw new Error(res.message);
      setSummary(res.data || null);
    } catch (e) {
      toast.error(e.message);
      setSummary(null);
    } finally {
      setSumLoading(false);
    }
  }, [effectiveBranch, channel, from, to]);

  const loadActivity = useCallback(async () => {
    if (!effectiveBranch || !channel) return;
    setActLoading(true);
    try {
      const params = { branch_id: effectiveBranch, channel, page, limit };
      if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to) {
        params.from = from;
        params.to = to;
      }
      const res = await reportService.walletBranchActivity(params);
      if (!res.success) throw new Error(res.message);
      setActivity(Array.isArray(res.data) ? res.data : []);
      const p = res.pagination || {};
      setActMeta({ total: p.total ?? 0, totalPages: p.totalPages ?? 1 });
    } catch (e) {
      toast.error(e.message);
      setActivity([]);
    } finally {
      setActLoading(false);
    }
  }, [effectiveBranch, channel, page, limit, from, to]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  const channelLabel = useMemo(() => channels.find((c) => c.slug === channel)?.label || channel, [channels, channel]);

  const submitTopup = async (e) => {
    e.preventDefault();
    if (!effectiveBranch || !channel) return toast.error('Pilih cabang dan kanal');
    const amt = topupForm.amount === '' ? NaN : Number(topupForm.amount);
    if (Number.isNaN(amt) || amt <= 0) return toast.error('Nominal harus lebih dari 0');
    try {
      const res = await reportService.addWalletTopup({
        branch_id: effectiveBranch,
        topup_date: topupForm.topup_date,
        channel,
        amount: amt,
        notes: (topupForm.notes || '').trim() || null,
      });
      if (!res.success) throw new Error(res.message);
      toast.success(res.message || 'Transfer saldo tercatat');
      setTopupForm({ topup_date: todayISO(), amount: '', notes: '' });
      loadSummary();
      loadActivity();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Saldo kanal per cabang"
        subtitle="Admin mencatat transfer saldo masuk ke aplikasi (per cabang & kanal). Sisa saldo = estimasi dari top-up − modal manual − estimasi potong saldo penjualan produk kanal."
      />

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {isSuper && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Cabang</label>
            <select value={branchId} onChange={(e) => { setBranchId(e.target.value); setPage(1); }} className="min-w-[14rem] rounded-xl border border-slate-200 px-3 py-2 text-sm">
              {branches.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Kanal aplikasi</label>
          <select value={channel} onChange={(e) => { setChannel(e.target.value); setPage(1); }} className="min-w-[12rem] rounded-xl border border-slate-200 px-3 py-2 text-sm">
            {channels.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Dari (opsional)</label>
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Sampai (opsional)</label>
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <button
          type="button"
          onClick={() => {
            setFrom('');
            setTo('');
            setPage(1);
          }}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Semua tanggal
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
          <p className="text-xs font-medium text-emerald-900">Saldo masuk (top-up / TF)</p>
          <p className="mt-1 text-lg font-bold text-emerald-950">
            {sumLoading ? '…' : formatCurrency(Number(summary?.total_topup ?? 0))}
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
          <p className="text-xs font-medium text-amber-900">Keluar — input manual (modal)</p>
          <p className="mt-1 text-lg font-bold text-amber-950">
            {sumLoading ? '…' : formatCurrency(Number(summary?.total_manual_modal ?? 0))}
          </p>
        </div>
        <div className="rounded-2xl border border-orange-200 bg-orange-50/80 p-4">
          <p className="text-xs font-medium text-orange-900">Keluar — penjualan produk kanal (est.)</p>
          <p className="mt-1 text-lg font-bold text-orange-950">
            {sumLoading ? '…' : formatCurrency(Number(summary?.total_sale_modal ?? 0))}
          </p>
        </div>
        <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4">
          <p className="text-xs font-medium text-sky-900">Sisa saldo (estimasi)</p>
          <p className="mt-1 text-lg font-bold text-sky-950">
            {sumLoading ? '…' : formatCurrency(Number(summary?.balance_estimate ?? 0))}
          </p>
        </div>
      </div>
      {summary?.branch_name ? (
        <p className="text-sm text-slate-600">
          Cabang: <strong>{summary.branch_name}</strong> · Kanal: <strong>{channelLabel}</strong>
          {summary.date_from ? (
            <>
              {' '}
              · Periode filter: {summary.date_from} s/d {summary.date_to}
            </>
          ) : (
            <> · Akumulasi semua tanggal</>
          )}
        </p>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Catat transfer saldo ke aplikasi</h3>
        <p className="mt-1 text-xs text-slate-500">Sama dengan data top-up di POS / laporan harian — tercatat per cabang yang dipilih.</p>
        <form onSubmit={submitTopup} className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-600">Tanggal efektif</label>
            <input
              type="date"
              required
              value={topupForm.topup_date}
              onChange={(e) => setTopupForm((f) => ({ ...f, topup_date: e.target.value }))}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">Nominal (Rp)</label>
            <input
              type="number"
              min={1}
              step="1"
              required
              value={topupForm.amount}
              onChange={(e) => setTopupForm((f) => ({ ...f, amount: e.target.value }))}
              className="w-36 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="min-w-[12rem] flex-1">
            <label className="mb-1 block text-xs text-slate-600">Keterangan (opsional)</label>
            <input
              type="text"
              value={topupForm.notes}
              onChange={(e) => setTopupForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Ref transfer / nota"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <button type="submit" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Simpan top-up
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Riwayat aktivitas</h3>
          <button type="button" onClick={() => { loadSummary(); loadActivity(); }} className="text-sm text-brand-600 hover:underline">
            Muat ulang
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-3 py-2">Waktu</th>
                <th className="px-3 py-2">Jenis</th>
                <th className="px-3 py-2">Keterangan</th>
                <th className="px-3 py-2 text-right">Masuk</th>
                <th className="px-3 py-2 text-right">Keluar (est.)</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {actLoading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    Memuat…
                  </td>
                </tr>
              ) : activity.length ? (
                activity.map((r) => (
                  <tr key={`${r.kind}-${r.ref_id}`} className="border-b border-slate-100">
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">{r.sort_ts ? new Date(r.sort_ts).toLocaleString('id-ID') : '—'}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-800">{r.kind}</span>
                    </td>
                    <td className="max-w-xs px-3 py-2 text-slate-800">{r.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-800">
                      {Number(r.amount_in) > 0 ? formatCurrency(Number(r.amount_in)) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-900">
                      {Number(r.amount_out) > 0 ? formatCurrency(Number(r.amount_out)) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.kind === 'sale' && r.sale_id ? (
                        <Link to={`/sales/${r.sale_id}`} className="text-brand-600 hover:underline">
                          Detail
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    Belum ada data
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {actMeta.totalPages > 1 ? (
          <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
            <span>
              Hal {page} / {actMeta.totalPages} ({actMeta.total} baris)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40"
              >
                Sebelumnya
              </button>
              <button
                type="button"
                disabled={page >= actMeta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40"
              >
                Berikutnya
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
