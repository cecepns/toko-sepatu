import { useCallback } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { useServerTable } from '@/hooks/useServerTable';
import { stockService } from '@/services/stockService';

export default function StockCentralPage() {
  const fetcher = useCallback((p) => stockService.central(p), []);
  const t = useServerTable(fetcher);

  return (
    <div>
      <PageHeader title="Stok Gudang Pusat" subtitle="Tracking stok terpusat" />
      <DataTable
        columns={[
          { key: 'sku', label: 'SKU', sortable: true },
          { key: 'name', label: 'Produk' },
          { key: 'quantity', label: 'Qty', sortable: true },
          { key: 'min_stock', label: 'Min' },
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
