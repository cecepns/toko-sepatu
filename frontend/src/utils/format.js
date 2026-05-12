export function formatCurrency(n) {
  const v = Number(n) || 0;
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v);
}

export function formatDate(d) {
  if (!d) return '-';
  const x = new Date(d);
  return x.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Untuk tabel laporan & export (Excel/PDF) — hindari string ISO mentah */
export function formatExportDate(d) {
  if (d == null || d === '') return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return String(d);
  return x.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Tanggal laporan YYYY-MM-DD → DD/MM/YYYY (seperti lembar harian) */
export function formatReportDay(value) {
  if (value == null || value === '') return '-';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, day] = s.split('-');
    return `${day}/${m}/${y}`;
  }
  const x = new Date(s);
  if (!Number.isNaN(x.getTime())) {
    return x.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  return s;
}

/** Periode agregat penjualan (tanggal / bulan / tahun) untuk laporan */
export function formatReportPeriod(value, periodType) {
  if (value == null || value === '') return '-';
  if (periodType === 'yearly') return String(value);
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, day] = s.split('-');
    return `${day}/${m}/${y}`;
  }
  if (/^\d{4}-\d{2}$/.test(s)) {
    const [y, m] = s.split('-');
    return `${m}/${y}`;
  }
  const x = new Date(s);
  if (!Number.isNaN(x.getTime())) {
    return x.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return s;
}

/** Tanggal/jam untuk export Excel & PDF (bukan ISO mentah) */
export function formatExportDateTime(value) {
  if (value == null || value === '') return '';
  const x = new Date(value);
  if (Number.isNaN(x.getTime())) return String(value);
  return x.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}
