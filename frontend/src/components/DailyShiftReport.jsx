import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { reportService } from '@/services/reportService';
import { branchService } from '@/services/branchService';
import { formatCurrency } from '@/utils/format';

const FALLBACK_CHANNELS = [
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

function lineRowKey(r, i) {
  if (r.manual_line_id != null) return `m-${r.manual_line_id}`;
  if (r.id != null) return `si-${r.id}`;
  return `p-${r.sale_number ?? 'x'}-${i}`;
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
            <th className="px-2 py-2 text-right font-medium">Modal</th>
            <th className="px-2 py-2 text-right font-medium">Harga jual</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={lineRowKey(r, i)} className="hover:bg-slate-50/80">
              {showPhone && <td className="px-2 py-2 font-mono text-xs text-slate-700">{r.customer_phone || '—'}</td>}
              <td className="px-2 py-2">
                <div className="font-medium text-slate-900">{r.product_name}</div>
                {r.sku ? <div className="text-xs text-slate-500">{r.sku}</div> : null}
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
  const [date, setDate] = useState(todayISO());
  const [branchId, setBranchId] = useState(user?.branch_id ? String(user.branch_id) : '');
  const [branches, setBranches] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

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

  const grosir = data?.grosir || [];
  const grosirTotal = data?.grosir_total ?? 0;
  const channelList = data?.channel_defs?.length ? data.channel_defs : FALLBACK_CHANNELS;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-brand-50/80 p-4 text-sm text-slate-800">
        <p className="font-semibold text-brand-950">Laporan harian operator</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-brand-900/90">
          <li>
            Penjualan kanal (Simpel / Digipos / Bonafit, dll.) dari <strong>POS</strong>: pilih kanal lalu produk master kanal. Top-up saldo kanal dicatat di menu <strong>Saldo kanal cabang</strong>.
          </li>
          <li>
            Blok <strong>Grosir</strong> di bawah memuat baris penjualan dengan konteks reseller untuk tanggal & cabang yang dipilih.
          </li>
          <li>
            <strong>Ringkasan</strong> menampilkan total per kanal (jual, estimasi modal, saldo masuk) dari data yang sama dengan laporan saldo.
          </li>
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

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <h4 className="font-semibold text-slate-900">Ringkasan</h4>
            <ul className="mt-2 space-y-1 text-slate-700">
              <li>Total penjualan grosir: {formatCurrency(grosirTotal)}</li>
              {channelList.map(({ slug, label }) => (
                <li key={slug}>
                  Total {label}: {formatCurrency(data.channels?.[slug]?.total_jual ?? 0)}
                  <span className="text-slate-500"> — modal estimasi {formatCurrency(data.channels?.[slug]?.total_modal ?? 0)}</span>
                  <span className="text-emerald-800"> — saldo masuk {formatCurrency(data.channels?.[slug]?.total_topup ?? 0)}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
