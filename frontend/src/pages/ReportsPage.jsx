import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { reportService } from '@/services/reportService';
import { formatCurrency, formatExportDate, formatReportPeriod } from '@/utils/format';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const tabs = [
  { id: 'sales', label: 'Penjualan agregat' },
  { id: 'pl', label: 'Laba rugi (per trx)' },
  { id: 'stock', label: 'Stok' },
  { id: 'bestsellers', label: 'Produk terlaris' },
  { id: 'attendance', label: 'Absensi' },
];

function rowsForSheet(tab, period, rows) {
  if (tab === 'sales') {
    return rows.map((r) => ({
      Periode: formatReportPeriod(r.period, period),
      Transaksi: r.trx,
      Pendapatan: formatCurrency(r.revenue),
      'Est. laba kotor': formatCurrency(r.gross_profit_estimate),
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
  const [tab, setTab] = useState('sales');
  const [period, setPeriod] = useState('daily');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
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

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, period]);

  const columns = useMemo(() => reportColumns(tab, period), [tab, period]);

  const exportExcel = () => {
    const data = rowsForSheet(tab, period, rows);
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

  return (
    <div>
      <PageHeader title="Laporan" subtitle="Tabel ringkas — export PDF & Excel" />
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
      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" onClick={load} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">
          Refresh
        </button>
        <button type="button" onClick={exportExcel} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
          <FileSpreadsheet className="h-4 w-4" /> Excel
        </button>
        <button type="button" onClick={exportPdf} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white">
          <FileText className="h-4 w-4" /> PDF
        </button>
      </div>

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
    </div>
  );
}
