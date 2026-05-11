/**
 * Gabungkan origin API (VITE_API_URL) dengan path relatif dari backend, mis. /uploads/xxx.jpg
 */
export function mediaUrl(relativePath) {
  if (!relativePath) return '';
  const p = String(relativePath).trim();
  if (/^https?:\/\//i.test(p)) return p;
  const base = (import.meta.env.VITE_API_URL || 'https://api-inventory.isavralabel.com/pos-multicabang').replace(/\/$/, '');
  const path = p.startsWith('/') ? p : `/${p}`;
  return `${base}${path}`;
}
