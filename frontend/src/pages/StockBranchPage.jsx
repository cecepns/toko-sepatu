import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { useServerTable } from '@/hooks/useServerTable';
import { stockService } from '@/services/stockService';
import { branchService } from '@/services/branchService';
import { useAuth } from '@/contexts/AuthContext';

export default function StockBranchPage() {
  const { user } = useAuth();
  const [branchId, setBranchId] = useState(user?.branch_id || 1);
  const [branches, setBranches] = useState([]);

  useEffect(() => {
    if (user?.branch_id) {
      setBranchId(user.branch_id);
      return;
    }
    (async () => {
      try {
        const res = await branchService.list({ limit: 50 });
        if (res.success && res.data?.length) {
          setBranches(res.data);
          setBranchId(res.data[0].id);
        }
      } catch {
        /* */
      }
    })();
  }, [user?.branch_id]);

  const fetcher = useCallback((p) => stockService.branch(branchId, p), [branchId]);
  const t = useServerTable(fetcher, [branchId]);

  return (
    <div>
      <PageHeader title="Stok Cabang" subtitle="Stok realtime per cabang" />
      {!user?.branch_id && (
        <div className="mb-4 max-w-xs">
          <label className="text-xs font-medium text-slate-600">Pilih cabang</label>
          <select value={branchId} onChange={(e) => setBranchId(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <DataTable
        columns={[
          { key: 'sku', label: 'SKU' },
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
