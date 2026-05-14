import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useAuth } from '@/contexts/AuthContext';
import { useServerTable } from '@/hooks/useServerTable';
import { userService } from '@/services/userService';
import { branchService } from '@/services/branchService';
import { workShiftService } from '@/services/workShiftService';
import { iconActionDelete, iconActionEdit } from '@/utils/iconActionButton';

export default function UsersPage() {
  const { user: authUser } = useAuth();
  const fetcher = useCallback((p) => userService.list(p), []);
  const t = useServerTable(fetcher);
  const [modal, setModal] = useState({ open: false, row: null });
  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [shiftOptions, setShiftOptions] = useState([]);
  const [modalBranchId, setModalBranchId] = useState('');
  const [modalRoleId, setModalRoleId] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [r, b] = await Promise.all([userService.roles(), branchService.list({ limit: 100 })]);
        if (r.success) setRoles(r.data || []);
        if (b.success) setBranches(b.data || []);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    if (!modal.open) return;
    if (modal.row) {
      setModalBranchId(modal.row.branch_id != null ? String(modal.row.branch_id) : '');
      setModalRoleId(String(modal.row.role_id));
    } else {
      setModalBranchId('');
      setModalRoleId(roles[0] ? String(roles[0].id) : '');
    }
  }, [modal.open, modal.row?.id, roles]);

  useEffect(() => {
    if (!modal.open || !modalBranchId) {
      setShiftOptions([]);
      return;
    }
    (async () => {
      try {
        const res = await workShiftService.list({ branch_id: modalBranchId });
        if (res.success) setShiftOptions((res.data || []).filter((s) => s.is_active));
        else setShiftOptions([]);
      } catch {
        setShiftOptions([]);
      }
    })();
  }, [modal.open, modalBranchId]);

  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      email: fd.get('email'),
      full_name: fd.get('full_name'),
      phone: fd.get('phone') || null,
      role_id: Number(fd.get('role_id')),
      branch_id: fd.get('branch_id') ? Number(fd.get('branch_id')) : null,
      is_active: fd.get('is_active') === '1',
    };
    const pwd = fd.get('password');
    if (pwd) body.password = pwd;
    const roleSlug = roles.find((x) => x.id === body.role_id)?.slug;
    const branchIdVal = body.branch_id;
    body.work_shift_id = fd.get('work_shift_id') ? Number(fd.get('work_shift_id')) : null;
    if ((roleSlug === 'kasir' || roleSlug === 'karyawan') && branchIdVal) {
      if (!body.work_shift_id) return toast.error('Pilih shift kerja untuk kasir / karyawan');
    }
    try {
      if (modal.row?.id) {
        await userService.update(modal.row.id, body);
        toast.success('User diperbarui');
      } else {
        if (!pwd) return toast.error('Password wajib untuk user baru');
        body.password = pwd;
        await userService.create(body);
        toast.success('User dibuat');
      }
      setModal({ open: false, row: null });
      t.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const removeUser = async (row) => {
    if (row.id === authUser?.id) return toast.error('Tidak dapat menghapus akun sendiri');
    if (!window.confirm(`Hapus pengguna "${row.full_name}" (${row.email})? Tindakan ini tidak bisa dibatalkan.`)) return;
    try {
      await userService.remove(row.id);
      toast.success('Pengguna dihapus');
      t.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const roleSlugForModal = roles.find((x) => String(x.id) === modalRoleId)?.slug;
  const needsShift = (roleSlugForModal === 'kasir' || roleSlugForModal === 'karyawan') && !!modalBranchId;

  return (
    <div>
      <PageHeader
        title="Pengguna"
        subtitle="Role, cabang, dan shift kerja (kasir / karyawan) untuk absensi."
        action={
          <button
            type="button"
            onClick={() => setModal({ open: true, row: null })}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> Tambah
          </button>
        }
      />
      <DataTable
        columns={[
          { key: 'full_name', label: 'Nama', sortable: true },
          { key: 'email', label: 'Email', sortable: true },
          { key: 'role_name', label: 'Role' },
          { key: 'branch_name', label: 'Cabang' },
          { key: 'work_shift_name', label: 'Shift', render: (r) => r.work_shift_name || '—' },
          {
            key: 'actions',
            label: '',
            render: (row) => (
              <div className="flex gap-1.5">
                <button type="button" title="Ubah" className={iconActionEdit} onClick={() => setModal({ open: true, row })}>
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Hapus pengguna"
                  disabled={row.id === authUser?.id}
                  className={iconActionDelete}
                  onClick={() => removeUser(row)}
                >
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
        sortKey={t.sort}
        sortOrder={t.order}
        onSort={t.setSort}
        limit={t.limit}
        onLimitChange={t.setLimit}
        pagination={{ page: t.page, totalPages: t.totalPages, total: t.total, onPage: t.setPage }}
      />

      <Modal open={modal.open} title={modal.row ? 'Edit User' : 'Tambah User'} onClose={() => setModal({ open: false, row: null })} size="lg">
        <form key={modal.row?.id ?? 'new-user'} onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-600">Email</label>
            <input name="email" required defaultValue={modal.row?.email} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Nama</label>
            <input name="full_name" required defaultValue={modal.row?.full_name} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Telepon</label>
            <input name="phone" defaultValue={modal.row?.phone} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Password {modal.row ? '(opsional)' : ''}</label>
            <input name="password" type="password" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Role</label>
            <select
              name="role_id"
              required
              value={modalRoleId}
              onChange={(e) => setModalRoleId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Cabang</label>
            <select
              name="branch_id"
              value={modalBranchId}
              onChange={(e) => setModalBranchId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">— Pusat / Super —</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          {needsShift ? (
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-slate-600">Shift kerja</label>
              <select
                name="work_shift_id"
                key={`ws-${modalBranchId}-${shiftOptions.length}-${modal.row?.id ?? 'n'}`}
                defaultValue={modal.row?.work_shift_id ? String(modal.row.work_shift_id) : ''}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">— Pilih shift —</option>
                {shiftOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (masuk {String(s.time_in || '').slice(0, 5)} · keluar {String(s.time_out || '').slice(0, 5)})
                  </option>
                ))}
              </select>
              {!shiftOptions.length ? <p className="mt-1 text-[11px] text-amber-700">Belum ada shift aktif di cabang ini — buat di menu Shift kerja.</p> : null}
            </div>
          ) : null}
          <div>
            <label className="text-xs font-medium text-slate-600">Aktif</label>
            <select name="is_active" defaultValue={modal.row?.is_active === 0 ? '0' : '1'} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="1">Ya</option>
              <option value="0">Tidak</option>
            </select>
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModal({ open: false, row: null })} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">
              Batal
            </button>
            <button type="submit" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
              Simpan
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
