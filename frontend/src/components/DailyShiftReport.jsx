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

function lineRowKey(r, i) {
  if (r.manual_line_id != null) return `m-${r.manual_line_id}`;
  return `p-${r.sale_number ?? 'x'}-${i}`;
}

function LineTable({ rows, showPhone, onDeleteManual }) {
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
            {onDeleteManual && <th className="w-14 px-1 py-2 text-center font-medium"> </th>}
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
              {onDeleteManual && (
                <td className="px-1 py-2 text-center">
                  {r.manual_line_id != null ? (
                    <button
                      type="button"
                      onClick={() => onDeleteManual(r.manual_line_id)}
                      className="rounded px-1.5 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Hapus
                    </button>
                  ) : null}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const emptyManual = () => ({
  simpel: { phone: '', desc: '', cost: '', sale: '' },
  digipos: { phone: '', desc: '', cost: '', sale: '' },
  bonafit: { phone: '', desc: '', cost: '', sale: '' },
});

const emptyTopup = () => ({
  simpel: { amount: '', notes: '' },
  digipos: { amount: '', notes: '' },
  bonafit: { amount: '', notes: '' },
});

export function DailyShiftReport() {
  const { user } = useAuth();
  const canEditSnap = user?.role_slug === 'super_admin' || user?.role_slug === 'admin_cabang';
  const canEditManual = user?.role_slug === 'super_admin' || user?.role_slug === 'admin_cabang' || user?.role_slug === 'kasir';
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
  const [manualForm, setManualForm] = useState(emptyManual);
  const [topupForm, setTopupForm] = useState(emptyTopup);

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

  const addManualLine = async (slug) => {
    if (!canEditManual || !effectiveBranch) return;
    const f = manualForm[slug];
    const desc = (f.desc || '').trim();
    if (!desc) {
      toast.error('Isi keterangan produk');
      return;
    }
    const cost = f.cost === '' ? 0 : Number(f.cost);
    const sale = f.sale === '' ? 0 : Number(f.sale);
    if (Number.isNaN(cost) || cost < 0 || Number.isNaN(sale) || sale < 0) {
      toast.error('Modal dan harga jual harus angka valid');
      return;
    }
    try {
      const res = await reportService.addWalletManualLine({
        branch_id: effectiveBranch,
        line_date: date,
        channel: slug,
        customer_phone: (f.phone || '').trim() || null,
        description: desc,
        cost_amount: cost,
        sale_amount: sale,
      });
      if (!res.success) throw new Error(res.message);
      toast.success(res.message || 'Baris ditambahkan');
      setManualForm((s) => ({ ...s, [slug]: { phone: '', desc: '', cost: '', sale: '' } }));
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const deleteManualLine = async (id) => {
    if (!canEditManual) return;
    try {
      const res = await reportService.deleteWalletManualLine(id);
      if (!res.success) throw new Error(res.message);
      toast.success(res.message || 'Dihapus');
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const addTopupLine = async (slug) => {
    if (!canEditManual || !effectiveBranch) return;
    const f = topupForm[slug];
    const amt = f.amount === '' ? NaN : Number(f.amount);
    if (Number.isNaN(amt) || amt <= 0) {
      toast.error('Isi nominal saldo masuk (lebih dari 0)');
      return;
    }
    try {
      const res = await reportService.addWalletTopup({
        branch_id: effectiveBranch,
        topup_date: date,
        channel: slug,
        amount: amt,
        notes: (f.notes || '').trim() || null,
      });
      if (!res.success) throw new Error(res.message);
      toast.success(res.message || 'Saldo masuk tercatat');
      setTopupForm((s) => ({ ...s, [slug]: { amount: '', notes: '' } }));
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const deleteTopupLine = async (id) => {
    if (!canEditManual) return;
    try {
      const res = await reportService.deleteWalletTopup(id);
      if (!res.success) throw new Error(res.message);
      toast.success(res.message || 'Dihapus');
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
          <li>
            Untuk produk yang <strong>tidak ada di master</strong> (pulsa/PLN/kode beda tiap hari), gunakan form <strong>Input manual</strong> per kanal: keterangan bebas, <strong>modal</strong> (estimasi potong saldo), dan <strong>harga jual</strong>. Form yang sama juga tersedia di <strong>POS</strong> setelah memilih Saldo aplikasi (Simpel/Digipos/Bonafit).
          </li>
          <li>
            <strong>Saldo masuk</strong> (top-up/transfer ke aplikasi) dicatat per kanal di bawah — menambah saldo tanpa lewat master produk; tampil di ringkasan & POS.
          </li>
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
              const ch = data.channels?.[slug] || {
                lines: [],
                total_jual: 0,
                total_modal: 0,
                topups: [],
                total_topup: 0,
              };
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
                  {canEditManual && (
                    <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-3">
                      <p className="text-xs font-semibold text-slate-700">Input manual</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">Nama produk bebas (contoh: PLN 20, pls 100). Modal = potong saldo aplikasi.</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <input
                          type="text"
                          inputMode="tel"
                          placeholder="No. HP (opsional)"
                          value={manualForm[slug]?.phone ?? ''}
                          onChange={(e) => setManualForm((s) => ({ ...s, [slug]: { ...s[slug], phone: e.target.value } }))}
                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                        />
                        <input
                          type="text"
                          placeholder="Keterangan / nama produk"
                          value={manualForm[slug]?.desc ?? ''}
                          onChange={(e) => setManualForm((s) => ({ ...s, [slug]: { ...s[slug], desc: e.target.value } }))}
                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                        />
                        <input
                          type="number"
                          min={0}
                          step="1"
                          placeholder="Modal"
                          value={manualForm[slug]?.cost ?? ''}
                          onChange={(e) => setManualForm((s) => ({ ...s, [slug]: { ...s[slug], cost: e.target.value } }))}
                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                        />
                        <input
                          type="number"
                          min={0}
                          step="1"
                          placeholder="Harga jual"
                          value={manualForm[slug]?.sale ?? ''}
                          onChange={(e) => setManualForm((s) => ({ ...s, [slug]: { ...s[slug], sale: e.target.value } }))}
                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => addManualLine(slug)}
                        className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                      >
                        Tambah baris
                      </button>
                    </div>
                  )}
                  {canEditManual && (
                    <div className="mt-4 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 p-3">
                      <p className="text-xs font-semibold text-emerald-900">Saldo masuk (top-up)</p>
                      <p className="mt-0.5 text-[11px] text-emerald-800/90">Nominal yang masuk ke saldo aplikasi (TF/isisi). Bukan penjualan & tidak mengurangi stok.</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <input
                          type="number"
                          min={1}
                          step="1"
                          placeholder="Nominal"
                          value={topupForm[slug]?.amount ?? ''}
                          onChange={(e) => setTopupForm((s) => ({ ...s, [slug]: { ...s[slug], amount: e.target.value } }))}
                          className="rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-sm"
                        />
                        <input
                          type="text"
                          placeholder="Keterangan (opsional)"
                          value={topupForm[slug]?.notes ?? ''}
                          onChange={(e) => setTopupForm((s) => ({ ...s, [slug]: { ...s[slug], notes: e.target.value } }))}
                          className="rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => addTopupLine(slug)}
                        className="mt-2 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-50"
                      >
                        Catat saldo masuk
                      </button>
                      {(ch.topups || []).length > 0 ? (
                        <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto text-[11px]">
                          {(ch.topups || []).map((t) => (
                            <li key={t.id} className="flex items-center justify-between gap-2 rounded border border-emerald-100 bg-white px-2 py-1">
                              <span className="min-w-0 truncate text-slate-700">{t.notes || '—'}</span>
                              <span className="shrink-0 font-medium tabular-nums">{formatCurrency(Number(t.amount))}</span>
                              <button type="button" onClick={() => deleteTopupLine(t.id)} className="shrink-0 text-red-600 hover:underline">
                                Hapus
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  )}
                  {!canEditManual && (ch.topups || []).length > 0 ? (
                    <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 text-xs">
                      <p className="font-semibold text-emerald-900">Saldo masuk hari ini</p>
                      <ul className="mt-2 space-y-1">
                        {(ch.topups || []).map((t) => (
                          <li key={t.id} className="flex justify-between gap-2 text-slate-700">
                            <span className="min-w-0 truncate">{t.notes || '—'}</span>
                            <span className="shrink-0 font-medium">{formatCurrency(Number(t.amount))}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="mt-4 min-h-0 flex-1">
                    <LineTable rows={ch.lines} showPhone onDeleteManual={canEditManual ? deleteManualLine : undefined} />
                    <div className="mt-2 flex flex-col items-end gap-0.5 text-xs">
                      <div>
                        <span className="text-slate-500">Total saldo masuk</span>
                        <span className="ml-2 font-semibold text-emerald-800">{formatCurrency(ch.total_topup ?? 0)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Total modal (estimasi)</span>
                        <span className="ml-2 font-semibold text-slate-800">{formatCurrency(ch.total_modal ?? 0)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Total jual (kanal)</span>
                        <span className="ml-2 font-semibold text-slate-900">{formatCurrency(ch.total_jual)}</span>
                      </div>
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
