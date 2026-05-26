import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export function useServerTable(fetcher, extraDeps = []) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [sort, setSort] = useState('id');
  const [order, setOrder] = useState('desc');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => {
      setAppliedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(searchRef.current);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetcher({ page, limit, search: appliedSearch, sort, order });
      if (!res.success) throw new Error(res.message || 'Gagal memuat data');
      setRows(res.data || []);
      setTotal(res.pagination?.total ?? 0);
      setTotalPages(res.pagination?.totalPages ?? 1);
    } catch (e) {
      setError(e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [fetcher, page, limit, appliedSearch, sort, order, ...extraDeps]);

  useEffect(() => {
    load();
  }, [load]);

  const setSortKey = (col) => {
    setSort(col);
    setOrder((o) => (sort === col && o === 'desc' ? 'asc' : 'desc'));
    setPage(1);
  };

  const setLimitAndReset = (l) => {
    setLimit(l);
    setPage(1);
  };

  return useMemo(
    () => ({
      rows,
      loading,
      error,
      page,
      limit,
      search,
      appliedSearch,
      sort,
      order,
      total,
      totalPages,
      setPage,
      setLimit: setLimitAndReset,
      setSearch,
      setSort: setSortKey,
      reload: load,
    }),
    [rows, loading, error, page, limit, search, appliedSearch, sort, order, total, totalPages, load]
  );
}
