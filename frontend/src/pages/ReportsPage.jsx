import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { DailyShiftReport } from '@/components/DailyShiftReport';
import { reportService } from '@/services/reportService';
import { formatCurrency, formatExportDate, formatReportDay, formatReportPeriod } from '@/utils/format';
import { useAuth } from '@/contexts/AuthContext';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const tabs = [
  { id: 'sales', label: 'Penjualan agregat' },
  { id: 'omset_daily', label: 'Omset harian' },
  { id: 'daily', label: 'Harian operator' },
  { id: 'pl', label: 'Laba rugi (per trx)' },
  { id: 'stock', label: 'Stok' },
  { id: 'bestsellers', label: 'Produk terlaris' },
  { id: 'attendance', label: 'Absensi' },
];

function defaultOmsetRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function rowsForSheet(tab, period, rows) {
  if (tab === 'sales') {
    return rows.map((r) => ({
      Periode: formatReportPeriod(r.period, period),
      Transaksi: r.trx,
      Pendapatan: formatCurrency(r.revenue),
      'Est. laba kotor': formatCurrency(r.gross_profit_estimate),
    }));
  }
  if (tab === 'omset_daily') {
    return rows.map((r) => ({
      Tanggal: formatReportDay(r.report_date),
      Penjualan: Number(r.omset_penjualan) || 0,
      Grosiran: Number(r.omset_grosiran) || 0,
      Simpel: Number(r.omset_simpel) || 0,
      Digipos: Number(r.omset_digipos) || 0,
      Bonafit: Number(r.omset_bonafit) || 0,
      'Jumlah transaksi': Number(r.trx_count) || 0,
      'Total omset': Number(r.total_omset) || 0,
      'Laba bersih (est.)': Number(r.net_profit) || 0,
    }));
  }
  if (tab === 'pl') {
    return rows.map((r) => ({
      'No Invoice': r.sale_number,
      Tanggal: formatExportDate(r.created_at),
      Subtotal: formatCurrency(r.subtotal),
      COGS: formatCurrency(r.cogs),
      Total: formatCurrency(r.grand_total),
    }));
  }
  if (tab === 'stock') {
    return rows.map((r) => ({
      Cabang: r.branch_name,
      SKU: r.sku,
      Produk: r.name,
      Qty: r.quantity,
      Min: r.min_stock,
      'Stok pusat': r.central_qty ?? '',
    }));
  }
  if (tab === 'bestsellers') {
    return rows.map((r) => ({
      Cabang: r.branch_name ?? r.branch_id,
      SKU: r.sku,
      Produk: r.name,
      Terjual: r.qty_sold,
      Pendapatan: formatCurrency(r.revenue),
    }));
  }
  return rows.map((r) => ({
    Karyawan: r.full_name,
    Kode: r.employee_code,
    Cabang: r.branch_name,
    Masuk: formatExportDate(r.clock_in_at),
    Keluar: r.clock_out_at ? formatExportDate(r.clock_out_at) : '-',
    Status: r.status,
  }));
}

function reportColumns(tab, period) {
  if (tab === 'sales') {
    return [
      { key: 'period', label: 'Periode', render: (r) => formatReportPeriod(r.period, period) },
      { key: 'trx', label: 'Transaksi', render: (r) => <span className="tabular-nums">{r.trx}</span> },
      { key: 'revenue', label: 'Pendapatan', render: (r) => formatCurrency(r.revenue) },
      { key: 'gross_profit_estimate', label: 'Est. laba kotor', render: (r) => formatCurrency(r.gross_profit_estimate) },
    ];
  }
  if (tab === 'pl') {
    return [
      { key: 'sale_number', label: 'No. invoice', render: (r) => <span className="font-mono text-xs">{r.sale_number}</span> },
      { key: 'created_at', label: 'Tanggal', render: (r) => formatExportDate(r.created_at) },
      { key: 'subtotal', label: 'Subtotal', render: (r) => formatCurrency(r.subtotal) },
      { key: 'cogs', label: 'COGS', render: (r) => formatCurrency(r.cogs) },
      { key: 'grand_total', label: 'Grand total', render: (r) => <span className="font-medium">{formatCurrency(r.grand_total)}</span> },
    ];
  }
  if (tab === 'stock') {
    return [
      { key: 'branch_name', label: 'Cabang', render: (r) => r.branch_name },
      { key: 'sku', label: 'SKU', render: (r) => <span className="font-mono text-xs">{r.sku}</span> },
      { key: 'name', label: 'Produk', render: (r) => r.name },
      { key: 'quantity', label: 'Qty', render: (r) => <span className="tabular-nums">{r.quantity}</span> },
      { key: 'min_stock', label: 'Min', render: (r) => r.min_stock },
      { key: 'central_qty', label: 'Stok pusat', render: (r) => (r.central_qty != null ? r.central_qty : '—') },
    ];
  }
  if (tab === 'bestsellers') {
    return [
      { key: 'branch', label: 'Cabang', render: (r) => r.branch_name ?? `#${r.branch_id}` },
      { key: 'sku', label: 'SKU', render: (r) => <span className="font-mono text-xs">{r.sku}</span> },
      { key: 'name', label: 'Produk', render: (r) => r.name },
      { key: 'qty_sold', label: 'Terjual', render: (r) => <span className="tabular-nums">{r.qty_sold}</span> },
      { key: 'revenue', label: 'Pendapatan', render: (r) => formatCurrency(r.revenue) },
    ];
  }
  return [
    { key: 'full_name', label: 'Nama', render: (r) => r.full_name },
    { key: 'employee_code', label: 'Kode', render: (r) => <span className="font-mono text-xs">{r.employee_code}</span> },
    { key: 'branch_name', label: 'Cabang', render: (r) => r.branch_name },
    { key: 'clock_in_at', label: 'Masuk', render: (r) => formatExportDate(r.clock_in_at) },
    { key: 'clock_out_at', label: 'Keluar', render: (r) => (r.clock_out_at ? formatExportDate(r.clock_out_at) : '—') },
    { key: 'status', label: 'Status', render: (r) => r.status },
  ];
}

export default function ReportsPage() {
  const { user } = useAuth();
  const isSuper = user?.role_slug === 'super_admin';
  const [tab, setTab] = useState('sales');
  const [period, setPeriod] = useState('daily');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const rangeInit = useMemo(() => defaultOmsetRange(), []);
  const [omsetFrom, setOmsetFrom] = useState(rangeInit.from);
  const [omsetTo, setOmsetTo] = useState(rangeInit.to);
  const [omsetBranchId, setOmsetBranchId] = useState('');
  const [omsetCashierId, setOmsetCashierId] = useState('');
  const [omsetRows, setOmsetRows] = useState([]);
  const [omsetBranches, setOmsetBranches] = useState([]);
  const [omsetCashiers, setOmsetCashiers] = useState([]);
  const [omsetLoading, setOmsetLoading] = useState(false);

  useEffect(() => {
    if (user?.role_slug === 'admin_cabang' && user.branch_id) {
      setOmsetBranchId(String(user.branch_id));
    }
  }, [user?.role_slug, user?.branch_id]);

  const load = async () => {
    if (tab === 'daily' || tab === 'omset_daily') return;
    setLoading(true);
    try {
      let res;
      if (tab === 'sales') res = await reportService.sales({ period });
      else if (tab === 'pl') res = await reportService.pl({});
      else if (tab === 'stock') res = await reportService.stock({ limit: 200, page: 1 });
      else if (tab === 'bestsellers') res = await reportService.bestsellers({ limit: 50, page: 1 });
      else res = await reportService.attendance({ limit: 50, page: 1 });
      if (!res.success) throw new Error(res.message);
      const raw = res.data;
      setRows(Array.isArray(raw) ? raw : []);
    } catch (e) {
      toast.error(e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const loadOmset = useCallback(async () => {
    setOmsetLoading(true);
    try {
      const params = { from: omsetFrom, to: omsetTo };
      if (omsetBranchId) params.branch_id = Number(omsetBranchId);
      if (omsetCashierId) params.cashier_user_id = Number(omsetCashierId);
      const res = await reportService.dailyOmset(params);
      if (!res.success) throw new Error(res.message);
      const pack = res.data || {};
      setOmsetRows(Array.isArray(pack.rows) ? pack.rows : []);
      setOmsetBranches(Array.isArray(pack.branches) ? pack.branches : []);
      setOmsetCashiers(Array.isArray(pack.cashiers) ? pack.cashiers : []);
    } catch (e) {
      toast.error(e.message);
      setOmsetRows([]);
    } finally {
      setOmsetLoading(false);
    }
  }, [omsetFrom, omsetTo, omsetBranchId, omsetCashierId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, period]);

  useEffect(() => {
    if (tab !== 'omset_daily') return;
    loadOmset();
  }, [tab, loadOmset]);

  const columns = useMemo(() => reportColumns(tab, period), [tab, period]);

  const omsetTotals = useMemo(() => {
    const t = {
      penjualan: 0,
      grosiran: 0,
      simpel: 0,
      digipos: 0,
      bonafit: 0,
      trx: 0,
      total_omset: 0,
      net_profit: 0,
    };
    for (const r of omsetRows) {
      t.penjualan += Number(r.omset_penjualan) || 0;
      t.grosiran += Number(r.omset_grosiran) || 0;
      t.simpel += Number(r.omset_simpel) || 0;
      t.digipos += Number(r.omset_digipos) || 0;
      t.bonafit += Number(r.omset_bonafit) || 0;
      t.trx += Number(r.trx_count) || 0;
      t.total_omset += Number(r.total_omset) || 0;
      t.net_profit += Number(r.net_profit) || 0;
    }
    const n = omsetRows.length || 1;
    return { ...t, avgPenjualan: t.penjualan / n, avgGrosiran: t.grosiran / n, dayCount: omsetRows.length };
  }, [omsetRows]);

  const exportExcel = () => {
    const data = rowsForSheet(tab, period, tab === 'omset_daily' ? omsetRows : rows);
    const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ Info: 'Tidak ada data' }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tab.slice(0, 28));
    XLSX.writeFile(wb, `laporan-${tab}.xlsx`);
    toast.success('Excel diunduh');
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.text(`Laporan — ${tabs.find((t) => t.id === tab)?.label ?? tab}`, 14, 12);
    let head;
    let body;
    if (tab === 'sales') {
      head = [['Periode', 'Trx', 'Pendapatan', 'Est. laba kotor']];
      body = rows.map((r) => [
        formatReportPeriod(r.period, period),
        String(r.trx ?? ''),
        formatCurrency(r.revenue),
        formatCurrency(r.gross_profit_estimate),
      ]);
    } else if (tab === 'omset_daily') {
      head = [['Tanggal', 'Penjualan', 'Grosiran', 'Simpel', 'Digipos', 'Bonafit', 'Trx', 'Total omset', 'Laba bersih']];
      body = omsetRows.map((r) => [
        formatReportDay(r.report_date),
        formatCurrency(r.omset_penjualan),
        formatCurrency(r.omset_grosiran),
        formatCurrency(r.omset_simpel),
        formatCurrency(r.omset_digipos),
        formatCurrency(r.omset_bonafit),
        String(r.trx_count ?? ''),
        formatCurrency(r.total_omset),
        formatCurrency(r.net_profit),
      ]);
    } else if (tab === 'pl') {
      head = [['No Invoice', 'Tanggal', 'Subtotal', 'COGS', 'Grand']];
      body = rows.slice(0, 40).map((r) => [
        r.sale_number,
        formatExportDate(r.created_at),
        formatCurrency(r.subtotal),
        formatCurrency(r.cogs),
        formatCurrency(r.grand_total),
      ]);
    } else if (tab === 'stock') {
      head = [['Cabang', 'SKU', 'Produk', 'Qty', 'Min', 'Pusat']];
      body = rows.slice(0, 40).map((r) => [r.branch_name, r.sku, r.name, r.quantity, r.min_stock, r.central_qty ?? '—']);
    } else if (tab === 'bestsellers') {
      head = [['Cabang', 'SKU', 'Produk', 'Qty', 'Pendapatan']];
      body = rows.slice(0, 40).map((r) => [r.branch_name ?? String(r.branch_id), r.sku, r.name, r.qty_sold, formatCurrency(r.revenue)]);
    } else {
      head = [['Nama', 'Kode', 'Cabang', 'Masuk', 'Keluar', 'Status']];
      body = rows.slice(0, 40).map((r) => [
        r.full_name,
        r.employee_code,
        r.branch_name,
        formatExportDate(r.clock_in_at),
        r.clock_out_at ? formatExportDate(r.clock_out_at) : '-',
        r.status,
      ]);
    }
    autoTable(doc, { startY: 18, head, body: body.length ? body : [['(kosong)']] });
    doc.save(`laporan-${tab}.pdf`);
    toast.success('PDF diunduh');
  };

  const noop = () => {};

  const subtitle =
    tab === 'daily'
      ? 'Grosir + saldo Simpel / Digipos / Bonafit (isi saldo & pilih kanal di POS)'
      : tab === 'omset_daily'
        ? 'Kolom penjualan–Bonafit adalah omset; laba bersih = estimasi (total − COGS). Filter cabang, kasir, dan rentang tanggal.'
        : 'Tabel ringkas — export PDF & Excel';

  return (
    <div>
      <PageHeader title="Laporan" subtitle={subtitle} />
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setTab(x.id)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${tab === x.id ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      {tab === 'sales' && (
        <div className="mb-4 flex gap-2">
          {['daily', 'monthly', 'yearly'].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-lg px-3 py-1.5 text-xs capitalize ${period === p ? 'bg-slate-900 text-white' : 'border border-slate-200'}`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
      {tab === 'omset_daily' && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Dari</label>
            <input
              type="date"
              value={omsetFrom}
              onChange={(e) => setOmsetFrom(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Sampai</label>
            <input
              type="date"
              value={omsetTo}
              onChange={(e) => setOmsetTo(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          {isSuper && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Cabang</label>
              <select
                value={omsetBranchId}
                onChange={(e) => {
                  setOmsetBranchId(e.target.value);
                  setOmsetCashierId('');
                }}
                className="min-w-[200px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Semua cabang</option>
                {omsetBranches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Kasir / karyawan</label>
            <select
              value={omsetCashierId}
              onChange={(e) => setOmsetCashierId(e.target.value)}
              className="min-w-[200px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Semua</option>
              {omsetCashiers.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      {tab !== 'daily' && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => (tab === 'omset_daily' ? loadOmset() : load())}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={exportExcel}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </button>
          <button
            type="button"
            onClick={exportPdf}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white"
          >
            <FileText className="h-4 w-4" /> PDF
          </button>
        </div>
      )}

      {tab === 'daily' ? (
        <DailyShiftReport />
      ) : tab === 'omset_daily' ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="whitespace-nowrap px-3 py-3">Hari / tanggal</th>
                <th className="whitespace-nowrap px-3 py-3">Penjualan</th>
                <th className="whitespace-nowrap px-3 py-3">Grosiran</th>
                <th className="whitespace-nowrap px-3 py-3">Simpel</th>
                <th className="whitespace-nowrap px-3 py-3">Digipos</th>
                <th className="whitespace-nowrap px-3 py-3">Bonafit</th>
                <th className="whitespace-nowrap px-3 py-3">Jumlah trx</th>
                <th className="whitespace-nowrap px-3 py-3">Total omset</th>
                <th className="whitespace-nowrap px-3 py-3">Laba bersih</th>
              </tr>
            </thead>
            <tbody>
              {omsetLoading && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                    Memuat…
                  </td>
                </tr>
              )}
              {!omsetLoading &&
                omsetRows.map((r) => (
                  <tr key={String(r.report_date)} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-900">{formatReportDay(r.report_date)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-800">{formatCurrency(r.omset_penjualan)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-800">{formatCurrency(r.omset_grosiran)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-800">{formatCurrency(r.omset_simpel)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-800">{formatCurrency(r.omset_digipos)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-800">{formatCurrency(r.omset_bonafit)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-700">{r.trx_count ?? 0}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums font-medium text-slate-900">{formatCurrency(r.total_omset)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-emerald-800">{formatCurrency(r.net_profit)}</td>
                  </tr>
                ))}
              {!omsetLoading && !omsetRows.length && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                    Tidak ada data di rentang ini
                  </td>
                </tr>
              )}
            </tbody>
            {!omsetLoading && omsetRows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-100 font-semibold text-slate-900">
                  <td className="px-3 py-2.5">Total</td>
                  <td className="px-3 py-2.5 tabular-nums">{formatCurrency(omsetTotals.penjualan)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{formatCurrency(omsetTotals.grosiran)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{formatCurrency(omsetTotals.simpel)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{formatCurrency(omsetTotals.digipos)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{formatCurrency(omsetTotals.bonafit)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{omsetTotals.trx}</td>
                  <td className="px-3 py-2.5 tabular-nums">{formatCurrency(omsetTotals.total_omset)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-emerald-900">{formatCurrency(omsetTotals.net_profit)}</td>
                </tr>
                <tr className="bg-slate-50 text-xs text-slate-600">
                  <td className="px-3 py-2">Rata-rata / hari</td>
                  <td className="px-3 py-2 tabular-nums">{formatCurrency(omsetTotals.avgPenjualan)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatCurrency(omsetTotals.avgGrosiran)}</td>
                  <td colSpan={6} className="px-3 py-2 text-slate-500">
                    ({omsetTotals.dayCount} hari bertransaksi)
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ) : (
        <DataTable
          hideControls
          columns={columns}
          rows={rows.slice(0, 100)}
          loading={loading}
          emptyText="Tidak ada data"
          search=""
          onSearchChange={noop}
          sortKey=""
          sortOrder="desc"
          onSort={noop}
          limit={10}
          onLimitChange={noop}
        />
      )}
    </div>
  );
}
