import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { useServerTable } from '@/hooks/useServerTable';
import { saleService } from '@/services/saleService';
import { formatCurrency, formatDate } from '@/utils/format';

export default function SalesPage() {
  const fetcher = useCallback((p) => saleService.list(p), []);
  const t = useServerTable(fetcher);

  return (
    <div>
      <PageHeader title="Riwayat Transaksi" subtitle="Detail & reprint struk" />
      <DataTable
        columns={[
          { key: 'sale_number', label: 'No Invoice', sortable: true },
          { key: 'grand_total', label: 'Total', sortable: true, render: (r) => formatCurrency(r.grand_total) },
          { key: 'cashier_name', label: 'Kasir' },
          { key: 'created_at', label: 'Tanggal', sortable: true, render: (r) => formatDate(r.created_at) },
          {
            key: 'a',
            label: '',
            render: (row) => (
              <Link to={`/sales/${row.id}`} className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-800">
                <Eye className="h-4 w-4" /> Detail
              </Link>
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
