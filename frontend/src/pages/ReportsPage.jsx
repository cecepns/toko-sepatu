import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { reportService } from '@/services/reportService';
import { formatCurrency, formatExportDate } from '@/utils/format';
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

function rowsForSheet(tab, rows) {
  if (tab === 'sales') {
    return rows.map((r) => ({
      Periode: r.period,
      Transaksi: r.trx,
      Pendapatan: Number(r.revenue) || 0,
      'Pendapatan (teks)': formatCurrency(r.revenue),
    }));
  }
  if (tab === 'pl') {
    return rows.map((r) => ({
      'No Invoice': r.sale_number,
      Tanggal: formatExportDate(r.created_at),
      Subtotal: Number(r.subtotal) || 0,
      COGS: Number(r.cogs) || 0,
      Total: Number(r.grand_total) || 0,
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
      'Cabang ID': r.branch_id,
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
    'Jarak (m)': r.distance_in_meters ?? '',
  }));
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
      setRows(res.data || []);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, period]);

  const exportExcel = () => {
    const data = rowsForSheet(tab, rows);
    const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ Info: 'Tidak ada data' }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tab.slice(0, 28));
    XLSX.writeFile(wb, `laporan-${tab}.xlsx`);
    toast.success('Excel diunduh');
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.text(`Laporan — ${tab}`, 14, 12);
    let head;
    let body;
    if (tab === 'sales') {
      head = [['Periode', 'Trx', 'Pendapatan']];
      body = rows.map((r) => [String(r.period ?? ''), String(r.trx ?? ''), formatCurrency(r.revenue)]);
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
      head = [['Cabang', 'SKU', 'Produk', 'Qty', 'Min']];
      body = rows.slice(0, 40).map((r) => [r.branch_name, r.sku, r.name, r.quantity, r.min_stock]);
    } else if (tab === 'bestsellers') {
      head = [['Cabang', 'SKU', 'Produk', 'Qty', 'Pendapatan']];
      body = rows.slice(0, 40).map((r) => [String(r.branch_id), r.sku, r.name, r.qty_sold, formatCurrency(r.revenue)]);
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

  const tableContent = useMemo(() => {
    if (!rows.length) {
      return (
        <tbody>
          <tr>
            <td className="px-4 py-10 text-center text-slate-500">Tidak ada data</td>
          </tr>
        </tbody>
      );
    }
    if (tab === 'sales') {
      return (
        <>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Periode</th>
              <th className="px-4 py-3 text-right font-medium">Transaksi</th>
              <th className="px-4 py-3 text-right font-medium">Pendapatan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.slice(0, 100).map((r, i) => (
              <tr key={i} className="hover:bg-slate-50/80">
                <td className="px-4 py-2.5">{r.period}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.trx}</td>
                <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(r.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </>
      );
    }
    if (tab === 'pl') {
      return (
        <>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left font-medium">No</th>
              <th className="px-4 py-3 text-left font-medium">Tanggal</th>
              <th className="px-4 py-3 text-right font-medium">Subtotal</th>
              <th className="px-4 py-3 text-right font-medium">COGS</th>
              <th className="px-4 py-3 text-right font-medium">Grand</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.slice(0, 100).map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/80">
                <td className="px-4 py-2.5 font-mono text-xs">{r.sale_number}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">{formatExportDate(r.created_at)}</td>
                <td className="px-4 py-2.5 text-right">{formatCurrency(r.subtotal)}</td>
                <td className="px-4 py-2.5 text-right">{formatCurrency(r.cogs)}</td>
                <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(r.grand_total)}</td>
              </tr>
            ))}
          </tbody>
        </>
      );
    }
    if (tab === 'stock') {
      return (
        <>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Cabang</th>
              <th className="px-4 py-3 text-left font-medium">SKU</th>
              <th className="px-4 py-3 text-left font-medium">Produk</th>
              <th className="px-4 py-3 text-right font-medium">Qty</th>
              <th className="px-4 py-3 text-right font-medium">Min</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.slice(0, 100).map((r, i) => (
              <tr key={`${r.branch_id}-${r.product_id}-${i}`} className="hover:bg-slate-50/80">
                <td className="px-4 py-2.5">{r.branch_name}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{r.sku}</td>
                <td className="px-4 py-2.5">{r.name}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.quantity}</td>
                <td className="px-4 py-2.5 text-right">{r.min_stock}</td>
              </tr>
            ))}
          </tbody>
        </>
      );
    }
    if (tab === 'bestsellers') {
      return (
        <>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Cabang</th>
              <th className="px-4 py-3 text-left font-medium">SKU</th>
              <th className="px-4 py-3 text-left font-medium">Produk</th>
              <th className="px-4 py-3 text-right font-medium">Terjual</th>
              <th className="px-4 py-3 text-right font-medium">Pendapatan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.slice(0, 100).map((r, i) => (
              <tr key={`${r.branch_id}-${r.id}-${i}`} className="hover:bg-slate-50/80">
                <td className="px-4 py-2.5">{r.branch_id}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{r.sku}</td>
                <td className="px-4 py-2.5">{r.name}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.qty_sold}</td>
                <td className="px-4 py-2.5 text-right">{formatCurrency(r.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </>
      );
    }
    return (
      <>
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Nama</th>
            <th className="px-4 py-3 text-left font-medium">Kode</th>
            <th className="px-4 py-3 text-left font-medium">Cabang</th>
            <th className="px-4 py-3 text-left font-medium">Masuk</th>
            <th className="px-4 py-3 text-left font-medium">Keluar</th>
            <th className="px-4 py-3 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.slice(0, 100).map((r) => (
            <tr key={r.id} className="hover:bg-slate-50/80">
              <td className="px-4 py-2.5">{r.full_name}</td>
              <td className="px-4 py-2.5 font-mono text-xs">{r.employee_code}</td>
              <td className="px-4 py-2.5">{r.branch_name}</td>
              <td className="px-4 py-2.5 whitespace-nowrap">{formatExportDate(r.clock_in_at)}</td>
              <td className="px-4 py-2.5 whitespace-nowrap">{r.clock_out_at ? formatExportDate(r.clock_out_at) : '-'}</td>
              <td className="px-4 py-2.5">{r.status}</td>
            </tr>
          ))}
        </tbody>
      </>
    );
  }, [tab, rows]);

  return (
    <div>
      <PageHeader title="Laporan" subtitle="Export PDF & Excel" />
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
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-slate-500">Memuat…</div>
        ) : (
          <table className="min-w-full text-left text-sm">{tableContent}</table>
        )}
      </div>
    </div>
  );
}
