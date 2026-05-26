import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { reportService } from '@/services/reportService';
import { formatCurrency, formatExportDate, formatExportDateTime, formatReportDay, formatReportPeriod } from '@/utils/format';
import { paymentMethodLabel } from '@/utils/constants';
import { useAuth } from '@/contexts/AuthContext';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const tabs = [
  { id: 'sales', label: 'Penjualan agregat' },
  { id: 'omset_daily', label: 'Omset harian' },
  { id: 'transaction_lines', label: 'Riwayat transaksi' },
  { id: 'pl', label: 'Laba rugi (per trx)' },
  { id: 'stock', label: 'Stok' },
  { id: 'bestsellers', label: 'Produk terlaris' },
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
      'Jumlah transaksi': Number(r.trx_count) || 0,
      'Omset tunai': Number(r.omset_cash) || 0,
      'Omset non tunai': Number(r.omset_non_cash) || 0,
      'Trx tunai': Number(r.trx_cash) || 0,
      'Trx non tunai': Number(r.trx_non_cash) || 0,
      'Total omset': Number(r.total_omset) || 0,
      'Laba bersih (est.)': Number(r.net_profit) || 0,
    }));
  }
  if (tab === 'transaction_lines') {
    return rows.map((r) => ({
      Tanggal: formatExportDateTime(r.created_at),
      Kasir: r.cashier_name,
      Pembayaran: paymentMethodLabel(r.payment_method),
      Invoice: r.sale_number,
      Produk: r.product_name,
      SKU: r.sku || '—',
      Qty: Number(r.quantity) || 0,
      'Harga satuan': formatCurrency(r.unit_price),
      Subtotal: formatCurrency(r.line_subtotal),
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
      SKU: r.sku,
      Produk: r.name,
      Warna: r.color,
      Ukuran: r.size,
      'Jenis olahraga': r.sport_type,
      Qty: r.quantity,
      Min: r.min_stock,
    }));
  }
  if (tab === 'bestsellers') {
    return rows.map((r) => ({
      SKU: r.sku,
      Produk: r.name,
      Terjual: r.qty_sold,
      Pendapatan: formatCurrency(r.revenue),
    }));
  }
  return [];
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
      { key: 'sku', label: 'SKU', render: (r) => <span className="font-mono text-xs">{r.sku}</span> },
      { key: 'name', label: 'Produk', render: (r) => r.name },
      { key: 'color', label: 'Warna', render: (r) => r.color },
      { key: 'size', label: 'Ukuran', render: (r) => r.size },
      { key: 'quantity', label: 'Qty', render: (r) => <span className="tabular-nums">{r.quantity}</span> },
      { key: 'min_stock', label: 'Min', render: (r) => r.min_stock },
    ];
  }
  if (tab === 'bestsellers') {
    return [
      { key: 'sku', label: 'SKU', render: (r) => <span className="font-mono text-xs">{r.sku}</span> },
      { key: 'name', label: 'Produk', render: (r) => r.name },
      { key: 'qty_sold', label: 'Terjual', render: (r) => <span className="tabular-nums">{r.qty_sold}</span> },
      { key: 'revenue', label: 'Pendapatan', render: (r) => formatCurrency(r.revenue) },
    ];
  }
  return [];
}

export default function ReportsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role_slug === 'admin';
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

  const [histFrom, setHistFrom] = useState(rangeInit.from);
  const [histTo, setHistTo] = useState(rangeInit.to);
  const [histBranchId, setHistBranchId] = useState('');
  const [histCashierId, setHistCashierId] = useState('');
  const [histRows, setHistRows] = useState([]);
  const [histBranches, setHistBranches] = useState([]);
  const [histCashiers, setHistCashiers] = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histPage, setHistPage] = useState(1);
  const [histTotalPages, setHistTotalPages] = useState(1);
  const [histTotal, setHistTotal] = useState(0);
  const histLimit = 40;

  const load = async () => {
    if (tab === 'omset_daily' || tab === 'transaction_lines') return;
    setLoading(true);
    try {
      let res;
      if (tab === 'sales') res = await reportService.sales({ period, from: rangeInit.from, to: rangeInit.to });
      else if (tab === 'pl') res = await reportService.pl({ from: rangeInit.from, to: rangeInit.to });
      else if (tab === 'stock') res = await reportService.stock({ limit: 200, page: 1 });
      else if (tab === 'bestsellers') res = await reportService.bestsellers({ from: rangeInit.from, to: rangeInit.to, limit: 50, page: 1 });
      else return;
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
      const res = await reportService.dailyOmset(params);
      if (!res.success) throw new Error(res.message);
      const list = res.data || [];
      setOmsetRows(
        list.map((r) => ({
          ...r,
          total_omset: r.total_omset ?? r.grand_total,
        }))
      );
    } catch (e) {
      toast.error(e.message);
      setOmsetRows([]);
    } finally {
      setOmsetLoading(false);
    }
  }, [omsetFrom, omsetTo, omsetBranchId, omsetCashierId]);

  const loadHist = useCallback(async () => {
    setHistLoading(true);
    try {
      const params = { from: histFrom, to: histTo, page: histPage, limit: histLimit };
      if (histBranchId) params.branch_id = Number(histBranchId);
      if (histCashierId) params.cashier_user_id = Number(histCashierId);
      const res = await reportService.transactionLines(params);
      if (!res.success) throw new Error(res.message);
      setHistRows(Array.isArray(res.data) ? res.data : []);
      const pg = res.pagination || {};
      setHistTotal(Number(pg.total) || 0);
      setHistTotalPages(Number(pg.totalPages) || 1);
    } catch (e) {
      toast.error(e.message);
      setHistRows([]);
      setHistTotal(0);
      setHistTotalPages(1);
    } finally {
      setHistLoading(false);
    }
  }, [histFrom, histTo, histBranchId, histCashierId, histPage, histLimit]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, period]);

  useEffect(() => {
    if (tab !== 'omset_daily') return;
    loadOmset();
  }, [tab, loadOmset]);

  useEffect(() => {
    if (tab !== 'transaction_lines') return;
    loadHist();
  }, [tab, loadHist]);

  const columns = useMemo(() => reportColumns(tab, period), [tab, period]);

  const omsetTotals = useMemo(() => {
    const t = { trx: 0, total_omset: 0, omset_cash: 0, omset_non_cash: 0, trx_cash: 0, trx_non_cash: 0, net_profit: 0 };
    for (const r of omsetRows) {
      t.trx += Number(r.trx_count) || 0;
      t.total_omset += Number(r.total_omset) || 0;
      t.omset_cash += Number(r.omset_cash) || 0;
      t.omset_non_cash += Number(r.omset_non_cash) || 0;
      t.trx_cash += Number(r.trx_cash) || 0;
      t.trx_non_cash += Number(r.trx_non_cash) || 0;
      t.net_profit += Number(r.net_profit) || 0;
    }
    return { ...t, dayCount: omsetRows.length };
  }, [omsetRows]);

  const exportExcel = () => {
    const data = rowsForSheet(
      tab,
      period,
      tab === 'omset_daily' ? omsetRows : tab === 'transaction_lines' ? histRows : rows
    );
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
      head = [['Tanggal', 'Trx', 'Omset tunai', 'Omset non tunai', 'Trx tunai', 'Trx non tunai', 'Total omset', 'Laba bersih']];
      body = omsetRows.map((r) => [
        formatReportDay(r.report_date),
        String(r.trx_count ?? ''),
        formatCurrency(r.omset_cash),
        formatCurrency(r.omset_non_cash),
        String(r.trx_cash ?? ''),
        String(r.trx_non_cash ?? ''),
        formatCurrency(r.total_omset),
        formatCurrency(r.net_profit),
      ]);
    } else if (tab === 'transaction_lines') {
      head = [['Tanggal', 'Kasir', 'Bayar', 'Invoice', 'Produk', 'SKU', 'Qty', 'Harga sat.', 'Subtotal']];
      body = histRows.map((r) => [
        formatExportDateTime(r.created_at),
        r.cashier_name,
        paymentMethodLabel(r.payment_method),
        r.sale_number,
        r.product_name,
        r.sku || '—',
        String(r.quantity ?? ''),
        formatCurrency(r.unit_price),
        formatCurrency(r.line_subtotal),
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
      head = [['SKU', 'Produk', 'Warna', 'Ukuran', 'Qty', 'Min']];
      body = rows.slice(0, 40).map((r) => [r.sku, r.name, r.color, r.size, r.quantity, r.min_stock]);
    } else if (tab === 'bestsellers') {
      head = [['SKU', 'Produk', 'Qty', 'Pendapatan']];
      body = rows.slice(0, 40).map((r) => [r.sku, r.name, r.qty_sold, formatCurrency(r.revenue)]);
    } else {
      head = [['Nama', 'Kode', 'Cabang', 'Shift', 'Masuk', 'Keluar', 'Status']];
      body = rows.slice(0, 40).map((r) => [
        r.full_name,
        r.employee_code,
        r.branch_name,
        r.shift_name || '—',
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
    tab === 'omset_daily'
      ? 'Omset harian dipisah tunai vs non tunai. Laba bersih = estimasi (omset − COGS).'
      : tab === 'transaction_lines'
        ? 'Setiap baris = satu item penjualan beserta metode pembayaran transaksi.'
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
          {false && (
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
      <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (tab === 'omset_daily') loadOmset();
              else if (tab === 'transaction_lines') loadHist();
              else load();
            }}
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

      {tab === 'omset_daily' ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="whitespace-nowrap px-3 py-3">Tanggal</th>
                <th className="whitespace-nowrap px-3 py-3">Trx</th>
                <th className="whitespace-nowrap px-3 py-3">Omset tunai</th>
                <th className="whitespace-nowrap px-3 py-3">Omset non tunai</th>
                <th className="whitespace-nowrap px-3 py-3">Trx tunai</th>
                <th className="whitespace-nowrap px-3 py-3">Trx non tunai</th>
                <th className="whitespace-nowrap px-3 py-3">Total omset</th>
                <th className="whitespace-nowrap px-3 py-3">Laba bersih (est.)</th>
              </tr>
            </thead>
            <tbody>
              {omsetLoading && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                    Memuat…
                  </td>
                </tr>
              )}
              {!omsetLoading &&
                omsetRows.map((r) => (
                  <tr key={String(r.report_date)} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-900">{formatReportDay(r.report_date)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-700">{r.trx_count ?? 0}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-emerald-800">{formatCurrency(r.omset_cash)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-sky-800">{formatCurrency(r.omset_non_cash)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-600">{r.trx_cash ?? 0}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-600">{r.trx_non_cash ?? 0}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums font-medium text-slate-900">{formatCurrency(r.total_omset)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-emerald-800">{formatCurrency(r.net_profit)}</td>
                  </tr>
                ))}
              {!omsetLoading && !omsetRows.length && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                    Tidak ada data di rentang ini
                  </td>
                </tr>
              )}
            </tbody>
            {!omsetLoading && omsetRows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-100 font-semibold text-slate-900">
                  <td className="px-3 py-2.5">Total</td>
                  <td className="px-3 py-2.5 tabular-nums">{omsetTotals.trx}</td>
                  <td className="px-3 py-2.5 tabular-nums text-emerald-900">{formatCurrency(omsetTotals.omset_cash)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-sky-900">{formatCurrency(omsetTotals.omset_non_cash)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{omsetTotals.trx_cash}</td>
                  <td className="px-3 py-2.5 tabular-nums">{omsetTotals.trx_non_cash}</td>
                  <td className="px-3 py-2.5 tabular-nums">{formatCurrency(omsetTotals.total_omset)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-emerald-900">{formatCurrency(omsetTotals.net_profit)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ) : tab === 'transaction_lines' ? (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Dari</label>
              <input
                type="date"
                value={histFrom}
                onChange={(e) => {
                  setHistFrom(e.target.value);
                  setHistPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Sampai</label>
              <input
                type="date"
                value={histTo}
                onChange={(e) => {
                  setHistTo(e.target.value);
                  setHistPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>
            {false && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Cabang</label>
                <select
                  value={histBranchId}
                  onChange={(e) => {
                    setHistBranchId(e.target.value);
                    setHistCashierId('');
                    setHistPage(1);
                  }}
                  className="min-w-[200px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Semua cabang</option>
                  {histBranches.map((b) => (
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
                value={histCashierId}
                onChange={(e) => {
                  setHistCashierId(e.target.value);
                  setHistPage(1);
                }}
                className="min-w-[200px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Semua</option>
                {histCashiers.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[880px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <th className="whitespace-nowrap px-3 py-3">Tanggal & jam</th>
                  <th className="whitespace-nowrap px-3 py-3">Kasir</th>
                  <th className="whitespace-nowrap px-3 py-3">Bayar</th>
                  <th className="whitespace-nowrap px-3 py-3">Invoice</th>
                  <th className="min-w-[8rem] px-3 py-3">Produk</th>
                  <th className="whitespace-nowrap px-3 py-3">SKU</th>
                  <th className="whitespace-nowrap px-3 py-3">Qty</th>
                  <th className="whitespace-nowrap px-3 py-3">Harga sat.</th>
                  <th className="whitespace-nowrap px-3 py-3">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {histLoading && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                      Memuat…
                    </td>
                  </tr>
                )}
                {!histLoading &&
                  histRows.map((r, idx) => (
                    <tr key={`${r.sale_number}-${r.sku}-${idx}`} className="border-b border-slate-100 hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-800">{formatExportDateTime(r.created_at)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-800">{r.cashier_name}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs font-medium text-slate-700">
                        {paymentMethodLabel(r.payment_method)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-900">{r.sale_number}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-900">{r.product_name}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-600">{r.sku || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-800">{r.quantity}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-800">{formatCurrency(r.unit_price)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums font-medium text-slate-900">{formatCurrency(r.line_subtotal)}</td>
                    </tr>
                  ))}
                {!histLoading && !histRows.length && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                      Tidak ada baris di rentang dan filter ini
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            <p>
              Menampilkan {histRows.length} baris
              {histTotal ? ` dari ${histTotal} baris` : ''}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={histPage <= 1 || histLoading}
                onClick={() => setHistPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-40"
              >
                Sebelumnya
              </button>
              <span className="tabular-nums text-slate-800">
                Halaman {histPage} / {histTotalPages || 1}
              </span>
              <button
                type="button"
                disabled={histPage >= (histTotalPages || 1) || histLoading}
                onClick={() => setHistPage((p) => p + 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-40"
              >
                Berikutnya
              </button>
            </div>
          </div>
        </>
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
