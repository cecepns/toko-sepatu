import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { reportService } from '@/services/reportService';
import { formatCurrency } from '@/utils/format';
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
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tab);
    XLSX.writeFile(wb, `laporan-${tab}.xlsx`);
    toast.success('Excel diunduh');
  };

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.text(`Laporan — ${tab}`, 14, 16);
    const head =
      tab === 'sales'
        ? [['Periode', 'Trx', 'Revenue']]
        : tab === 'pl'
          ? [['No', 'Tanggal', 'Subtotal', 'COGS', 'Grand']]
          : [['Kolom', '...']];
    const body =
      tab === 'sales'
        ? rows.map((r) => [r.period, r.trx, formatCurrency(r.revenue)])
        : tab === 'pl'
          ? rows.slice(0, 40).map((r) => [r.sale_number, r.created_at, formatCurrency(r.subtotal), formatCurrency(r.cogs), formatCurrency(r.grand_total)])
          : rows.slice(0, 30).map((r) => Object.values(r).map((v) => String(v ?? '')));
    autoTable(doc, { startY: 22, head, body: body.length ? body : [['(kosong)']] });
    doc.save(`laporan-${tab}.pdf`);
    toast.success('PDF diunduh');
  };

  return (
    <div>
      <PageHeader title="Laporan" subtitle="Export PDF & Excel" />
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setTab(x.id)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${tab === x.id ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}
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
      <div className="mb-4 flex gap-2">
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
          <table className="min-w-full text-left text-sm">
            <tbody>
              {rows.slice(0, 50).map((r, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{JSON.stringify(r)}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500">Kosong</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
