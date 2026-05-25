export const ROLES = {
  ADMIN: 'admin',
  KASIR: 'kasir',
};

export const ROLE_LABELS = {
  admin: 'Admin',
  kasir: 'Kasir',
};

export const SPORT_TYPES = [
  { value: 'futsal', label: 'Futsal' },
  { value: 'sepak_bola', label: 'Sepak Bola' },
  { value: 'umum', label: 'Umum' },
];

export function sportTypeLabel(value) {
  return SPORT_TYPES.find((s) => s.value === value)?.label || value || '—';
}

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Tunai' },
  { value: 'non_cash', label: 'Non tunai' },
];

export function paymentMethodLabel(method) {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label || (method === 'cash' ? 'Tunai' : 'Non tunai');
}

export function variantDisplayName(row) {
  const model = row.model_name || row.name || 'Produk';
  const color = row.color ? ` · ${row.color}` : '';
  const size = row.size ? ` · ${row.size}` : '';
  const sport = row.sport_type ? ` (${sportTypeLabel(row.sport_type)})` : '';
  return `${model}${color}${size}${sport}`;
}
