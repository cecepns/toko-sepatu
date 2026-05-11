# API Documentation — POS Multi Cabang

**Base URL:** `https://api-inventory.isavralabel.com/pos-multicabang`  
**Auth:** header `Authorization: Bearer <JWT>` (kecuali login & health).

## Format respons

Sukses:

```json
{
  "success": true,
  "message": "",
  "data": {},
  "pagination": { "page": 1, "limit": 10, "total": 0, "totalPages": 1 }
}
```

Gagal: HTTP 4xx/5xx dengan `success: false`, `message`, `data: null`, `pagination: {}`.

## Query umum (GET terpaginasi)

| Parameter | Deskripsi |
| --- | --- |
| `page` | Halaman (default 1) |
| `limit` | Ukuran halaman (max 100, default 10) |
| `search` | Pencarian teks (tergantung endpoint) |
| `sort` | Nama kolom yang diizinkan per endpoint |
| `order` | `asc` atau `desc` |

---

## Auth

| Method | Path | Role | Keterangan |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | publik | Body: `{ email, password }` → `{ token, user }` |
| GET | `/api/auth/me` | login | Profil + cabang |

---

## Cabang

| Method | Path | Role |
| --- | --- | --- |
| GET | `/api/branches` | login (admin: hanya cabang sendiri) |
| POST | `/api/branches` | super_admin |
| PUT | `/api/branches/:id` | super_admin |

Body cabang: `code`, `name`, `address`, `phone`, `status`, `latitude`, `longitude`, `attendance_radius_meters`.

---

## Pengguna & role

| Method | Path | Role |
| --- | --- | --- |
| GET | `/api/roles` | super_admin, admin_cabang |
| GET | `/api/users` | super_admin, admin_cabang |
| POST | `/api/users` | super_admin, admin_cabang |
| PUT | `/api/users/:id` | super_admin, admin_cabang |

---

## Master produk

| Method | Path | Role |
| --- | --- | --- |
| GET | `/api/categories` | login |
| POST/PUT/DELETE | `/api/categories` … | super_admin, admin_cabang |
| GET | `/api/units` | login |
| POST/PUT/DELETE | `/api/units` … | super_admin, admin_cabang |
| GET | `/api/products` | login |
| GET | `/api/products/:id` | login |
| POST | `/api/products` | super_admin, admin_cabang | `multipart/form-data` + field gambar opsional |
| PUT | `/api/products/:id` | super_admin, admin_cabang | idem |
| DELETE | `/api/products/:id` | super_admin, admin_cabang |

---

## Stok

| Method | Path | Role |
| --- | --- | --- |
| GET | `/api/stock/central` | super_admin, admin_cabang |
| GET | `/api/stock/branch/:branchId` | login (non–super_admin: hanya cabang sendiri) |
| GET | `/api/stock-mutations` | super_admin, admin_cabang |

---

## Transfer stok

| Method | Path | Role |
| --- | --- | --- |
| GET | `/api/stock-transfers` | login |
| GET | `/api/stock-transfers/:id` | login |
| POST | `/api/stock-transfers` | super_admin, admin_cabang | Body: `{ to_branch_id, items: [{ product_id, quantity }], notes }` |
| PATCH | `/api/stock-transfers/:id/approve` | super_admin |
| PATCH | `/api/stock-transfers/:id/reject` | super_admin |

---

## Penjualan (POS)

| Method | Path | Role |
| --- | --- | --- |
| POST | `/api/sales` | super_admin, admin_cabang, kasir |
| GET | `/api/sales` | super_admin, admin_cabang, kasir |
| GET | `/api/sales/:id` | super_admin, admin_cabang, kasir |
| PATCH | `/api/sales/:id/printed` | super_admin, admin_cabang, kasir |

Body `POST /api/sales`: `branch_id`, `customer_id`, `reseller_id`, `items: [{ product_id, quantity }]`, `discount_amount`, `tax_percent`, `notes`, `payment_method`.

Logika harga per baris: jika `reseller_id` valid & aktif dan `qty >= min_wholesale_qty` → **wholesale_price**, else **retail_price**.

---

## Customer & reseller

| Method | Path | Role |
| --- | --- | --- |
| GET/POST/PUT/DELETE | `/api/customers` … | GET: login; mutasi: super_admin, admin_cabang |
| GET/POST/PUT/DELETE | `/api/resellers` … | GET: login; mutasi: super_admin, admin_cabang |

---

## Absensi

| Method | Path | Role |
| --- | --- | --- |
| GET | `/api/attendances` | login |
| POST | `/api/attendances/clock-in` | karyawan, admin_cabang, super_admin | Body: `{ latitude, longitude }` |
| POST | `/api/attendances/clock-out` | idem |

---

## Dashboard & laporan

| Method | Path | Role |
| --- | --- | --- |
| GET | `/api/dashboard/summary` | login |
| GET | `/api/reports/sales?period=daily\|monthly\|yearly` | super_admin, admin_cabang |
| GET | `/api/reports/pl` | super_admin, admin_cabang |
| GET | `/api/reports/stock` | super_admin, admin_cabang |
| GET | `/api/reports/bestsellers` | super_admin, admin_cabang |
| GET | `/api/reports/attendance` | super_admin, admin_cabang |

---

## Health

`GET /api/health` — tanpa auth.
