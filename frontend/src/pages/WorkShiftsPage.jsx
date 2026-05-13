import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/Modal';
import { useAuth } from '@/contexts/AuthContext';
import { branchService } from '@/services/branchService';
import { workShiftService } from '@/services/workShiftService';

function toTimeInput(v) {
  if (!v) return '';
  const s = String(v);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

export default function WorkShiftsPage() {
  const { user } = useAuth();
  const isSuper = user?.role_slug === 'super_admin';
  const fixedBranchId = user?.branch_id ? String(user.branch_id) : '';
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(isSuper ? '' : fixedBranchId);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({ open: false, row: null });
  const [form, setForm] = useState({ name: '', time_in: '08:00', time_out: '17:00', grace_in_minutes: '15', is_active: true });

  useEffect(() => {
    if (!isSuper) return;
    (async () => {
      try {
        const res = await branchService.list({ limit: 100 });
        if (res.success && res.data?.length) {
          setBranches(res.data);
          setBranchId((prev) => prev || String(res.data[0].id));
        }
      } catch {
        /* */
      }
    })();
  }, [isSuper]);

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const res = await workShiftService.list({ branch_id: branchId });
      if (!res.success) throw new Error(res.message);
      setRows(res.data || []);
    } catch (e) {
      toast.error(e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (modal.row) {
      setForm({
        name: modal.row.name,
        time_in: toTimeInput(modal.row.time_in),
        time_out: toTimeInput(modal.row.time_out),
        grace_in_minutes: String(modal.row.grace_in_minutes ?? 0),
        is_active: !!modal.row.is_active,
      });
    } else {
      setForm({ name: '', time_in: '08:00', time_out: '17:00', grace_in_minutes: '15', is_active: true });
    }
  }, [modal]);

  const save = async (e) => {
    e.preventDefault();
    if (!branchId) return toast.error('Pilih cabang');
    const grace = Number(form.grace_in_minutes);
    if (Number.isNaN(grace) || grace < 0 || grace > 240) return toast.error('Toleransi telat 0–240 menit');
    const body = {
      name: form.name.trim(),
      time_in: `${form.time_in}:00`,
      time_out: `${form.time_out}:00`,
      grace_in_minutes: grace,
      is_active: form.is_active,
    };
    if (!body.name) return toast.error('Nama shift wajib');
    try {
      if (modal.row) {
        const res = await workShiftService.update(modal.row.id, body);
        if (!res.success) throw new Error(res.message);
        toast.success(res.message || 'Diperbarui');
      } else {
        const res = await workShiftService.create({ ...body, branch_id: Number(branchId) });
        if (!res.success) throw new Error(res.message);
        toast.success(res.message || 'Dibuat');
      }
      setModal({ open: false, row: null });
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Hapus shift "${row.name}"?`)) return;
    try {
      await workShiftService.remove(row.id);
      toast.success('Shift dihapus');
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Master shift kerja"
        subtitle="Atur jam masuk & toleransi telat per cabang. Kasir/karyawan wajib punya shift di menu Pengguna."
        action={
          <button
            type="button"
            disabled={!branchId}
            onClick={() => setModal({ open: true, row: null })}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Tambah shift
          </button>
        }
      />

      {isSuper && (
        <div className="mb-4 max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="text-xs font-medium text-slate-600">Cabang</label>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
            {branches.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="px-3 py-3">Nama</th>
              <th className="px-3 py-3">Jam masuk</th>
              <th className="px-3 py-3">Jam keluar</th>
              <th className="px-3 py-3">Toleransi telat (mnt)</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                  Memuat…
                </td>
              </tr>
            ) : rows.length ? (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="px-3 py-2.5 font-medium text-slate-900">{r.name}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{toTimeInput(r.time_in)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{toTimeInput(r.time_out)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{r.grace_in_minutes ?? 0}</td>
                  <td className="px-3 py-2.5">{r.is_active ? <span className="text-emerald-700">Aktif</span> : <span className="text-slate-500">Off</span>}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button type="button" onClick={() => setModal({ open: true, row: r })} className="text-brand-600 hover:underline">
                      <Pencil className="mr-1 inline h-3.5 w-3.5" /> Edit
                    </button>
                    <button type="button" onClick={() => remove(r)} className="ml-3 text-red-600 hover:underline">
                      <Trash2 className="mr-1 inline h-3.5 w-3.5" /> Hapus
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                  Belum ada shift — tambahkan untuk absensi.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modal.open} onClose={() => setModal({ open: false, row: null })} title={modal.row ? 'Edit shift' : 'Shift baru'}>
        <form onSubmit={save} className="space-y-3 text-sm">
          <div>
            <label className="text-xs font-medium text-slate-600">Nama shift</label>
            <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Pagi, Siang, …" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Jam masuk</label>
              <input type="time" required value={form.time_in} onChange={(e) => setForm((f) => ({ ...f, time_in: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Jam keluar</label>
              <input type="time" required value={form.time_out} onChange={(e) => setForm((f) => ({ ...f, time_out: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Toleransi telat (menit setelah jam masuk)</label>
            <input type="number" min={0} max={240} value={form.grace_in_minutes} onChange={(e) => setForm((f) => ({ ...f, grace_in_minutes: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
          </div>
          {modal.row ? (
            <div>
              <label className="text-xs font-medium text-slate-600">Aktif</label>
              <select value={form.is_active ? '1' : '0'} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === '1' }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2">
                <option value="1">Ya</option>
                <option value="0">Tidak</option>
              </select>
            </div>
          ) : null}
          <button type="submit" className="w-full rounded-xl bg-brand-600 py-2.5 font-semibold text-white">
            Simpan
          </button>
        </form>
      </Modal>
    </div>
  );
}
