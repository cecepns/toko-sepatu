import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { reportService } from '@/services/reportService';
import { branchService } from '@/services/branchService';
import { formatCurrency } from '@/utils/format';

const CHANNELS = [
  { slug: 'simpel', label: 'SIMPEL' },
  { slug: 'digipos', label: 'DIGIPOS' },
  { slug: 'bonafit', label: 'BONAFIT' },
];

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function LineTable({ rows, showPhone }) {
  if (!rows?.length) {
    return <p className="py-3 text-center text-sm text-slate-500">Belum ada baris</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
            {showPhone && <th className="px-2 py-2 font-medium">No. HP</th>}
            <th className="px-2 py-2 font-medium">Keterangan</th>
            <th className="px-2 py-2 text-right font-medium">Modal (HPP)</th>
            <th className="px-2 py-2 text-right font-medium">Harga jual</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={`${r.sale_number}-${i}`} className="hover:bg-slate-50/80">
              {showPhone && <td className="px-2 py-2 font-mono text-xs text-slate-700">{r.customer_phone || '—'}</td>}
              <td className="px-2 py-2">
                <div className="font-medium text-slate-900">{r.product_name}</div>
                <div className="text-xs text-slate-500">{r.sku}</div>
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(Number(r.hpp || 0) * Number(r.quantity || 0))}</td>
              <td className="px-2 py-2 text-right font-medium tabular-nums">{formatCurrency(r.line_subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DailyShiftReport() {
  const { user } = useAuth();
  const canEditSnap = user?.role_slug === 'super_admin' || user?.role_slug === 'admin_cabang';
  const [date, setDate] = useState(todayISO());
  const [branchId, setBranchId] = useState(user?.branch_id ? String(user.branch_id) : '');
  const [branches, setBranches] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [snapForm, setSnapForm] = useState({
    simpel: { opening: '', closing: '', notes: '' },
    digipos: { opening: '', closing: '', notes: '' },
    bonafit: { opening: '', closing: '', notes: '' },
  });

  useEffect(() => {
    if (user?.role_slug !== 'super_admin' || user?.branch_id) return;
    (async () => {
      try {
        const res = await branchService.list({ limit: 100 });
        if (res.success && res.data?.length) {
          setBranches(res.data);
          if (!branchId) setBranchId(String(res.data[0].id));
        }
      } catch {
        /* */
      }
    })();
  }, [user?.role_slug, user?.branch_id]);

  const effectiveBranch = user?.branch_id || Number(branchId);

  const load = useCallback(async () => {
    if (!effectiveBranch) return;
    setLoading(true);
    try {
      const res = await reportService.dailyShift({ date, branch_id: effectiveBranch });
      if (!res.success) throw new Error(res.message);
      setData(res.data);
      const next = { ...snapForm };
      for (const { slug } of CHANNELS) {
        const s = res.data?.snapshots?.[slug];
        next[slug] = {
          opening: s?.opening_balance != null ? String(s.opening_balance) : '',
          closing: s?.closing_balance != null ? String(s.closing_balance) : '',
          notes: s?.notes || '',
        };
      }
      setSnapForm(next);
    } catch (e) {
      toast.error(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [date, effectiveBranch]);

  useEffect(() => {
    load();
  }, [load]);

  const saveSnap = async (slug) => {
    if (!canEditSnap || !effectiveBranch) return;
    const f = snapForm[slug];
    try {
      const res = await reportService.saveWalletSnapshot({
        branch_id: effectiveBranch,
        snapshot_date: date,
        channel: slug,
        opening_balance: f.opening === '' ? 0 : Number(f.opening),
        closing_balance: f.closing === '' ? null : Number(f.closing),
        notes: f.notes || null,
      });
      if (!res.success) throw new Error(res.message);
      toast.success(res.message || 'Disimpan');
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const grosir = data?.grosir || [];
  const grosirTotal = data?.grosir_total ?? 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-sky-50/80 p-4 text-sm text-slate-800">
        <p className="font-semibold text-sky-950">Cara pakai kanal Simpel / Digipos / Bonafit</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sky-900/90">
          <li>Di <strong>POS</strong>, pilih <strong>Saldo aplikasi</strong> saat bayar bila transaksi memotong saldo aplikasi tersebut (bukan tunai murni).</li>
          <li>Isi <strong>saldo awal / saldo akhir</strong> harian per kanal di bawah (rekonsiliasi dengan aplikasi asli — sistem tidak mengambil saldo langsung dari Digipos/Bonafit kecuali nanti ada integrasi API).</li>
          <li>Laporan <strong>GROSIR</strong> mengambil baris penjualan dengan konteks reseller (sesuai lembar grosir Anda).</li>
        </ul>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-medium text-slate-600">Tanggal</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </div>
        {user?.role_slug === 'super_admin' && !user?.branch_id && (
          <div>
            <label className="text-xs font-medium text-slate-600">Cabang</label>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="mt-1 block min-w-[12rem] rounded-xl border border-slate-200 px-3 py-2 text-sm">
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <button type="button" onClick={load} disabled={loading || !effectiveBranch} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
          {loading ? 'Memuat…' : 'Muat ulang'}
        </button>
      </div>

      {!effectiveBranch && <p className="text-sm text-amber-700">Pilih cabang untuk memuat laporan.</p>}

      {data && (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="border-b border-slate-100 pb-2 text-sm font-bold uppercase tracking-wide text-slate-900">Grosir</h3>
            <LineTable rows={grosir} showPhone />
            <div className="mt-3 flex justify-end border-t border-slate-100 pt-2 text-sm">
              <span className="text-slate-600">Total grosir</span>
              <span className="ml-4 font-bold text-slate-900">{formatCurrency(grosirTotal)}</span>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            {CHANNELS.map(({ slug, label }) => {
              const ch = data.channels?.[slug] || { lines: [], total_jual: 0 };
              const f = snapForm[slug] || { opening: '', closing: '', notes: '' };
              return (
                <section key={slug} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="border-b border-slate-100 pb-2 text-sm font-bold uppercase tracking-wide text-slate-900">{label}</h3>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="font-medium text-slate-600">Saldo awal</label>
                      <input
                        type="number"
                        readOnly={!canEditSnap}
                        value={f.opening}
                        onChange={(e) => setSnapForm((s) => ({ ...s, [slug]: { ...s[slug], opening: e.target.value } }))}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="font-medium text-slate-600">Saldo akhir</label>
                      <input
                        type="number"
                        readOnly={!canEditSnap}
                        value={f.closing}
                        onChange={(e) => setSnapForm((s) => ({ ...s, [slug]: { ...s[slug], closing: e.target.value } }))}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm disabled:bg-slate-50"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="font-medium text-slate-600">Catatan</label>
                      <input
                        readOnly={!canEditSnap}
                        value={f.notes}
                        onChange={(e) => setSnapForm((s) => ({ ...s, [slug]: { ...s[slug], notes: e.target.value } }))}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm disabled:bg-slate-50"
                        placeholder="Opsional"
                      />
                    </div>
                  </div>
                  {canEditSnap && (
                    <button type="button" onClick={() => saveSnap(slug)} className="mt-3 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
                      Simpan saldo {label}
                    </button>
                  )}
                  <div className="mt-4 min-h-0 flex-1">
                    <LineTable rows={ch.lines} showPhone />
                    <div className="mt-2 flex justify-end text-xs">
                      <span className="text-slate-500">Total jual (kanal)</span>
                      <span className="ml-2 font-semibold text-slate-900">{formatCurrency(ch.total_jual)}</span>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <h4 className="font-semibold text-slate-900">Ringkasan</h4>
            <ul className="mt-2 space-y-1 text-slate-700">
              <li>Total penjualan grosir: {formatCurrency(grosirTotal)}</li>
              {CHANNELS.map(({ slug, label }) => (
                <li key={slug}>
                  Total {label}: {formatCurrency(data.channels?.[slug]?.total_jual ?? 0)}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
