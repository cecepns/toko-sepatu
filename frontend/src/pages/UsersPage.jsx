import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { useServerTable } from '@/hooks/useServerTable';
import { userService } from '@/services/userService';
import { branchService } from '@/services/branchService';

export default function UsersPage() {
  const fetcher = useCallback((p) => userService.list(p), []);
  const t = useServerTable(fetcher);
  const [modal, setModal] = useState({ open: false, row: null });
  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);

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

  return (
    <div>
      <PageHeader
        title="Pengguna"
        subtitle="Role & cabang"
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
          {
            key: 'actions',
            label: '',
            render: (row) => (
              <button type="button" className="text-brand-600" onClick={() => setModal({ open: true, row })}>
                <Pencil className="h-4 w-4" />
              </button>
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
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
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
            <select name="role_id" required defaultValue={modal.row?.role_id} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Cabang</label>
            <select name="branch_id" defaultValue={modal.row?.branch_id || ''} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="">— Pusat / Super —</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
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
