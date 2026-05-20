import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useAuth } from '@/contexts/AuthContext';
import { useServerTable } from '@/hooks/useServerTable';
import { userService } from '@/services/userService';
import { iconActionDelete, iconActionEdit } from '@/utils/iconActionButton';
import { ROLE_LABELS } from '@/utils/constants';
import { Pencil } from 'lucide-react';

export default function UsersPage() {
  const { user: authUser } = useAuth();
  const fetcher = useCallback((p) => userService.list(p), []);
  const t = useServerTable(fetcher);
  const [modal, setModal] = useState({ open: false, row: null });
  const [roles, setRoles] = useState([]);

  useEffect(() => {
    userService.roles().then((r) => {
      if (r.success) setRoles(r.data || []);
    });
  }, []);

  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      email: fd.get('email'),
      full_name: fd.get('full_name'),
      phone: fd.get('phone') || null,
      role_id: Number(fd.get('role_id')),
      is_active: fd.get('is_active') === '1',
    };
    const pwd = fd.get('password');
    if (pwd) body.password = pwd;
    try {
      if (modal.row?.id) await userService.update(modal.row.id, body);
      else {
        if (!pwd) return toast.error('Password wajib untuk user baru');
        await userService.create(body);
      }
      toast.success('User disimpan');
      setModal({ open: false, row: null });
      t.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (id) => {
    if (id === authUser?.id) return toast.error('Tidak bisa hapus akun sendiri');
    if (!window.confirm('Hapus user?')) return;
    try {
      await userService.remove(id);
      toast.success('Dihapus');
      t.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Pengguna"
        subtitle="Admin & kasir"
        action={
          <button type="button" onClick={() => setModal({ open: true, row: null })} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white">
            <Plus className="h-4 w-4" /> Tambah
          </button>
        }
      />
      <DataTable
        columns={[
          { key: 'full_name', label: 'Nama', sortable: true },
          { key: 'email', label: 'Email', sortable: true },
          { key: 'role_slug', label: 'Peran', render: (r) => ROLE_LABELS[r.role_slug] || r.role_name },
          { key: 'is_active', label: 'Status', render: (r) => (r.is_active ? 'Aktif' : 'Nonaktif') },
          {
            key: 'actions',
            label: '',
            render: (r) => (
              <div className="flex justify-end gap-1">
                <button type="button" onClick={() => setModal({ open: true, row: r })} className={iconActionEdit}>
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => remove(r.id)} className={iconActionDelete}>
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

      <Modal open={modal.open} title={modal.row ? 'Edit user' : 'User baru'} onClose={() => setModal({ open: false, row: null })}>
        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600">Nama</label>
            <input name="full_name" required defaultValue={modal.row?.full_name} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Email</label>
            <input name="email" type="email" required defaultValue={modal.row?.email} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Password {modal.row ? '(kosongkan jika tidak diubah)' : '*'}</label>
            <input name="password" type="password" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Peran</label>
            <select name="role_id" required defaultValue={modal.row?.role_id} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {ROLE_LABELS[r.slug] || r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Status</label>
            <select name="is_active" defaultValue={modal.row?.is_active === 0 ? '0' : '1'} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="1">Aktif</option>
              <option value="0">Nonaktif</option>
            </select>
          </div>
          <button type="submit" className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white">
            Simpan
          </button>
        </form>
      </Modal>
    </div>
  );
}
