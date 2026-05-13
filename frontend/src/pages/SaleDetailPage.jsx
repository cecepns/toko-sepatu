import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Printer, ArrowLeft } from 'lucide-react';
import { saleService } from '@/services/saleService';
import { formatCurrency, formatDate } from '@/utils/format';

export default function SaleDetailPage() {
  const { id } = useParams();
  const [row, setRow] = useState(null);
  const printRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await saleService.get(id);
        if (!res.success) throw new Error(res.message);
        setRow(res.data);
      } catch (e) {
        toast.error(e.message);
      }
    })();
  }, [id]);

  const print = async () => {
    try {
      await saleService.printed(id);
    } catch {
      /* */
    }
    const w = window.open('', 'PRINT', 'height=600,width=400');
    if (!w) return toast.error('Popup diblokir');
    w.document.write(`<html><head><title>Struk</title><style>
      @page { size: 80mm auto; margin: 4mm; }
      body { font-family: ui-monospace, monospace; font-size: 12px; width: 72mm; }
      h1 { font-size: 14px; margin: 0 0 8px; }
      table { width:100%; border-collapse: collapse; }
      td { padding: 2px 0; }
      .right { text-align:right; }
      hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
    </style></head><body>`);
    w.document.write(printRef.current?.innerHTML || '');
    w.document.write('</body></html>');
    w.document.close();
    w.focus();
    w.print();
    w.close();
    toast.success('Perintah cetak dikirim');
  };

  if (!row) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <Link to="/sales" className="mb-4 inline-flex items-center gap-2 text-sm text-brand-600 hover:text-brand-800">
        <ArrowLeft className="h-4 w-4" /> Kembali
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{row.sale_number}</h1>
          <p className="text-sm text-slate-600">{formatDate(row.created_at)} · {row.branch_name}</p>
        {row.payments?.[0]?.wallet_channel ? (
          <p className="mt-1 text-xs font-medium text-brand-800">Kanal aplikasi: {row.payments[0].wallet_channel}</p>
        ) : null}
        </div>
        <button type="button" onClick={print} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">
          <Printer className="h-4 w-4" /> Print struk thermal
        </button>
      </div>

      <div ref={printRef} className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-center text-lg font-bold">POS MULTI CABANG</h2>
        <p className="text-center text-xs text-slate-500">{row.branch_name}</p>
        <hr className="my-3 border-dashed" />
        <p className="text-xs">No: {row.sale_number}</p>
        <p className="text-xs">Kasir: {row.cashier_name}</p>
        <table className="mt-3 w-full text-xs">
          <tbody>
            {(row.items || []).map((i) => (
              <tr key={i.id}>
                <td>
                  {i.product_name}
                  <div className="text-slate-500">
                    {i.quantity} × {formatCurrency(i.unit_price)} {i.is_wholesale_line ? '(Grosir)' : ''}
                  </div>
                </td>
                <td className="align-top text-right">{formatCurrency(i.line_subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr className="my-3 border-dashed" />
        <div className="flex justify-between text-sm">
          <span>Subtotal</span>
          <span>{formatCurrency(row.subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Diskon</span>
          <span>{formatCurrency(row.discount_amount)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Pajak</span>
          <span>{formatCurrency(row.tax_amount)}</span>
        </div>
        <div className="mt-2 flex justify-between text-base font-bold">
          <span>TOTAL</span>
          <span>{formatCurrency(row.grand_total)}</span>
        </div>
        {row.notes && <p className="mt-3 text-xs text-slate-600">Catatan: {row.notes}</p>}
        <p className="mt-4 text-center text-[10px] text-slate-400">Terima kasih</p>
      </div>
    </div>
  );
}
