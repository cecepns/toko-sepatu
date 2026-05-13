import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Power } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useServerTable } from '@/hooks/useServerTable';
import { walletChannelService } from '@/services/walletChannelService';
import { iconActionDelete, iconActionEdit, iconActionToggleOff, iconActionToggleOn } from '@/utils/iconActionButton';

export default function WalletChannelsPage() {
  const fetcher = useCallback(async (p) => {
    const res = await walletChannelService.list({});
    if (!res.success) throw new Error(res.message);
    const rows = res.data || [];
    const search = (p.search || '').toLowerCase();
    const filtered = search ? rows.filter((r) => r.label.toLowerCase().includes(search) || r.slug.includes(search)) : rows;
    return { success: true, data: filtered, pagination: { page: 1, limit: filtered.length, total: filtered.length, totalPages: 1 } };
  }, []);
  const t = useServerTable(fetcher);
  const [modal, setModal] = useState({ open: false, row: null });
  const [slug, setSlug] = useState('');
  const [label, setLabel] = useState('');
  const [sortOrder, setSortOrder] = useState(0);

  useEffect(() => {
    if (modal.open && !modal.row) {
      setSlug('');
      setLabel('');
      setSortOrder(0);
    } else if (modal.row) {
      setSlug(modal.row.slug);
      setLabel(modal.row.label);
      setSortOrder(modal.row.sort_order ?? 0);
    }
  }, [modal]);

  const saveNew = async (e) => {
    e.preventDefault();
    try {
      const res = await walletChannelService.create({ slug, label, sort_order: Number(sortOrder) || 0 });
      if (!res.success) throw new Error(res.message);
      toast.success(res.message || 'Kanal dibuat');
      setModal({ open: false, row: null });
      t.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    try {
      const res = await walletChannelService.update(modal.row.id, {
        label,
        sort_order: Number(sortOrder) || 0,
        is_active: modal.row.is_active,
      });
      if (!res.success) throw new Error(res.message);
      toast.success(res.message || 'Disimpan');
      setModal({ open: false, row: null });
      t.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggleActive = async (row) => {
    try {
      const res = await walletChannelService.update(row.id, {
        label: row.label,
        sort_order: row.sort_order,
        is_active: !row.is_active,
      });
      if (!res.success) throw new Error(res.message);
      toast.success(row.is_active ? 'Kanal dinonaktifkan' : 'Kanal diaktifkan');
      t.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const removeChannel = async (row) => {
    if (
      !window.confirm(
        `Hapus kanal "${row.label}" (${row.slug})? Produk kanal di bawahnya ikut terhapus jika belum pernah dipakai transaksi.`
      )
    ) {
      return;
    }
    try {
      const res = await walletChannelService.delete(row.id);
      if (!res.success) throw new Error(res.message);
      toast.success(res.message || 'Kanal dihapus');
      t.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Kanal aplikasi"
        subtitle="Slug dipakai di POS, laporan harian, & saldo (contoh: simpel, digipos)."
        action={
          <button
            type="button"
            onClick={() => setModal({ open: true, row: null })}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" /> Tambah kanal
          </button>
        }
      />
      <DataTable
        columns={[
          { key: 'slug', label: 'Slug', render: (r) => <span className="font-mono text-xs">{r.slug}</span> },
          { key: 'label', label: 'Nama tampil' },
          { key: 'sort_order', label: 'Urutan', render: (r) => <span className="tabular-nums">{r.sort_order}</span> },
          {
            key: 'is_active',
            label: 'Status',
            render: (r) => (r.is_active ? <span className="text-emerald-700">Aktif</span> : <span className="text-slate-500">Nonaktif</span>),
          },
          {
            key: 'a',
            label: '',
            render: (row) => (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  title="Ubah"
                  onClick={() => setModal({ open: true, row })}
                  className={iconActionEdit}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title={row.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                  onClick={() => toggleActive(row)}
                  className={row.is_active ? iconActionToggleOff : iconActionToggleOn}
                >
                  <Power className="h-4 w-4" />
                </button>
                <button type="button" title="Hapus kanal" onClick={() => removeChannel(row)} className={iconActionDelete}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ),
          },
        ]}
        rows={t.rows}
        loading={t.loading}
        search={t.search}
        onSearchChange={t.setSearch}
        sortKey=""
        sortOrder="asc"
        onSort={() => {}}
        limit={t.limit}
        onLimitChange={t.setLimit}
        pagination={{ page: 1, totalPages: 1, total: t.rows.length, onPage: () => {} }}
      />

      <Modal open={modal.open} onClose={() => setModal({ open: false, row: null })} title={modal.row ? 'Edit kanal' : 'Kanal baru'}>
        {modal.row ? (
          <form onSubmit={saveEdit} className="space-y-3 text-sm">
            <p className="text-xs text-slate-500">
              Slug <span className="font-mono">{modal.row.slug}</span> tidak diubah (sudah dipakai transaksi).
            </p>
            <div>
              <label className="text-xs font-medium text-slate-600">Nama tampil</label>
              <input required value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Urutan</label>
              <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
            </div>
            <button type="submit" className="w-full rounded-xl bg-brand-600 py-2.5 font-semibold text-white">
              Simpan
            </button>
          </form>
        ) : (
          <form onSubmit={saveNew} className="space-y-3 text-sm">
            <div>
              <label className="text-xs font-medium text-slate-600">Slug (huruf kecil, angka, _)</label>
              <input
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="contoh: dana"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Nama tampil</label>
              <input required value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Urutan</label>
              <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
            </div>
            <button type="submit" className="w-full rounded-xl bg-brand-600 py-2.5 font-semibold text-white">
              Buat kanal
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
}
