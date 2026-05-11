export function formatCurrency(n) {
  const v = Number(n) || 0;
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v);
}

export function formatDate(d) {
  if (!d) return '-';
  const x = new Date(d);
  return x.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}
