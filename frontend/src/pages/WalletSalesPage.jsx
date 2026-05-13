import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Eye, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { useServerTable } from '@/hooks/useServerTable';
import { useAuth } from '@/contexts/AuthContext';
import { saleService } from '@/services/saleService';
import { formatCurrency, formatDate } from '@/utils/format';

export default function WalletSalesPage() {
  const { user } = useAuth();
  const canDeleteSale = user?.role_slug === 'super_admin' || user?.role_slug === 'admin_cabang';
  const fetcher = useCallback((p) => saleService.list({ ...p, wallet_sale: 1 }), []);
  const t = useServerTable(fetcher);

  const handleDelete = async (row) => {
    if (!window.confirm(`Hapus transaksi kanal ${row.sale_number}? Entri penjualan akan dihapus dari sistem.`)) {
      return;
    }
    try {
      await saleService.remove(row.id);
      toast.success('Transaksi dihapus');
      t.reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <PageHeader title="Penjualan kanal aplikasi" subtitle="Transaksi pembayaran saldo kanal; admin dapat menghapus bila salah input." />
      <DataTable
        columns={[
          { key: 'sale_number', label: 'No Invoice', sortable: true },
          {
            key: 'wallet_channel',
            label: 'Kanal',
            render: (r) => <span className="font-mono text-xs uppercase text-slate-700">{r.wallet_channel || '—'}</span>,
          },
          { key: 'grand_total', label: 'Total', sortable: true, render: (r) => formatCurrency(r.grand_total) },
          { key: 'cashier_name', label: 'Kasir' },
          { key: 'created_at', label: 'Tanggal', sortable: true, render: (r) => formatDate(r.created_at) },
          {
            key: 'a',
            label: 'Aksi',
            render: (row) => (
              <div className="flex flex-wrap items-center gap-3">
                <Link to={`/sales/${row.id}`} className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-800">
                  <Eye className="h-4 w-4" /> Detail
                </Link>
                {canDeleteSale ? (
                  <button
                    type="button"
                    onClick={() => handleDelete(row)}
                    className="inline-flex items-center gap-1 text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="h-4 w-4" /> Hapus
                  </button>
                ) : null}
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
    </div>
  );
}
