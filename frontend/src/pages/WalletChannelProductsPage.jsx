import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/Modal';
import { walletChannelService } from '@/services/walletChannelService';
import { formatCurrency } from '@/utils/format';

export default function WalletChannelProductsPage() {
  const [channels, setChannels] = useState([]);
  const [channelId, setChannelId] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({ open: false, row: null });
  const [form, setForm] = useState({ name: '', default_cost: '', default_sale_price: '' });

  useEffect(() => {
    (async () => {
      try {
        const res = await walletChannelService.list({});
        if (res.success) {
          const list = res.data || [];
          setChannels(list);
          if (!channelId && list[0]) setChannelId(String(list[0].id));
        }
      } catch {
        /* */
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!channelId) return;
    setLoading(true);
    try {
      const res = await walletChannelService.listProducts({ channel_id: channelId });
      if (!res.success) throw new Error(res.message);
      setRows(res.data || []);
    } catch (e) {
      toast.error(e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (modal.row) {
      setForm({
        name: modal.row.name,
        default_cost: String(modal.row.default_cost ?? ''),
        default_sale_price: String(modal.row.default_sale_price ?? ''),
      });
    } else {
      setForm({ name: '', default_cost: '', default_sale_price: '' });
    }
  }, [modal]);

  const save = async (e) => {
    e.preventDefault();
    const dc = form.default_cost === '' ? 0 : Number(form.default_cost);
    const dsp = form.default_sale_price === '' ? 0 : Number(form.default_sale_price);
    if (!form.name.trim()) return toast.error('Nama wajib');
    if (Number.isNaN(dc) || dc < 0 || Number.isNaN(dsp) || dsp < 0) return toast.error('Harga tidak valid');
    try {
      if (modal.row) {
        const res = await walletChannelService.updateProduct(modal.row.id, {
          name: form.name.trim(),
          default_cost: dc,
          default_sale_price: dsp,
          is_active: modal.row.is_active,
        });
        if (!res.success) throw new Error(res.message);
        toast.success(res.message || 'Disimpan');
      } else {
        const res = await walletChannelService.createProduct({
          channel_id: Number(channelId),
          name: form.name.trim(),
          default_cost: dc,
          default_sale_price: dsp,
        });
        if (!res.success) throw new Error(res.message);
        toast.success(res.message || 'Dibuat');
      }
      setModal({ open: false, row: null });
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggle = async (row) => {
    try {
      const res = await walletChannelService.updateProduct(row.id, {
        name: row.name,
        default_cost: row.default_cost,
        default_sale_price: row.default_sale_price,
        is_active: !row.is_active,
      });
      if (!res.success) throw new Error(res.message);
      toast.success(row.is_active ? 'Dinonaktifkan' : 'Diaktifkan');
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Hapus produk kanal "${row.name}"? Tidak bisa dihapus jika sudah pernah muncul di transaksi penjualan.`)) return;
    try {
      await walletChannelService.deleteProduct(row.id);
      toast.success('Produk dihapus');
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const chLabel = channels.find((c) => String(c.id) === channelId)?.label || '';

  return (
    <div>
      <PageHeader
        title="Produk kanal aplikasi"
        subtitle="Tanpa stok cabang — dipakai di POS saat kanal dipilih. Harga jual default bisa dioverride di kasir."
        action={
          <button
            type="button"
            disabled={!channelId}
            onClick={() => setModal({ open: true, row: null })}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Tambah produk
          </button>
        }
      />

      <div className="mb-4 max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-xs font-medium text-slate-600">Kanal</label>
        <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
          {channels.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.label} ({c.slug})
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="px-3 py-3">Nama</th>
              <th className="px-3 py-3">Modal default</th>
              <th className="px-3 py-3">Harga jual default</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                  Memuat…
                </td>
              </tr>
            ) : rows.length ? (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="px-3 py-2.5 font-medium text-slate-900">{r.name}</td>
                  <td className="px-3 py-2.5 tabular-nums">{formatCurrency(Number(r.default_cost))}</td>
                  <td className="px-3 py-2.5 tabular-nums">{formatCurrency(Number(r.default_sale_price))}</td>
                  <td className="px-3 py-2.5">{r.is_active ? <span className="text-emerald-700">Aktif</span> : <span className="text-slate-500">Off</span>}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button type="button" onClick={() => setModal({ open: true, row: r })} className="text-brand-600 hover:underline">
                        <Pencil className="mr-1 inline h-3.5 w-3.5" /> Edit
                      </button>
                      <button type="button" onClick={() => toggle(r)} className="text-slate-600 hover:underline">
                        {r.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                      <button type="button" onClick={() => remove(r)} className="text-red-600 hover:underline" title="Hapus permanen">
                        <Trash2 className="mr-1 inline h-3.5 w-3.5" /> Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                  Belum ada produk untuk {chLabel || 'kanal ini'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modal.open} onClose={() => setModal({ open: false, row: null })} title={modal.row ? 'Edit produk kanal' : 'Produk kanal baru'}>
        <form onSubmit={save} className="space-y-3 text-sm">
          <div>
            <label className="text-xs font-medium text-slate-600">Nama</label>
            <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Modal default (estimasi potong saldo)</label>
            <input type="number" min={0} step="1" value={form.default_cost} onChange={(e) => setForm((f) => ({ ...f, default_cost: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Harga jual default</label>
            <input type="number" min={0} step="1" value={form.default_sale_price} onChange={(e) => setForm((f) => ({ ...f, default_sale_price: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
          </div>
          <button type="submit" className="w-full rounded-xl bg-brand-600 py-2.5 font-semibold text-white">
            Simpan
          </button>
        </form>
      </Modal>
    </div>
  );
}
