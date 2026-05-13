import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Eye, Trash2 } from 'lucide-react';
import { iconActionDelete, iconActionNeutral } from '@/utils/iconActionButton';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { useServerTable } from '@/hooks/useServerTable';
import { useAuth } from '@/contexts/AuthContext';
import { saleService } from '@/services/saleService';
import { formatCurrency, formatDate } from '@/utils/format';

export default function SalesPage() {
  const { user } = useAuth();
  const canDeleteSale = user?.role_slug === 'super_admin' || user?.role_slug === 'admin_cabang';
  const fetcher = useCallback((p) => saleService.list(p), []);
  const t = useServerTable(fetcher);

  const handleDelete = async (row) => {
    if (
      !window.confirm(
        `Hapus transaksi ${row.sale_number}? Untuk penjualan stok cabang, jumlah barang dikembalikan ke stok.`
      )
    ) {
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
      <PageHeader title="Riwayat Transaksi" subtitle="Detail & reprint struk; hapus transaksi (admin) mengembalikan stok jika ada." />
      <DataTable
        columns={[
          { key: 'sale_number', label: 'No Invoice', sortable: true },
          { key: 'grand_total', label: 'Total', sortable: true, render: (r) => formatCurrency(r.grand_total) },
          { key: 'cashier_name', label: 'Kasir' },
          { key: 'created_at', label: 'Tanggal', sortable: true, render: (r) => formatDate(r.created_at) },
          {
            key: 'a',
            label: 'Aksi',
            render: (row) => (
              <div className="flex flex-wrap items-center gap-1.5">
                <Link to={`/sales/${row.id}`} title="Detail transaksi" className={iconActionNeutral}>
                  <Eye className="h-4 w-4" />
                </Link>
                {canDeleteSale ? (
                  <button type="button" title="Hapus transaksi" onClick={() => handleDelete(row)} className={iconActionDelete}>
                    <Trash2 className="h-4 w-4" />
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
