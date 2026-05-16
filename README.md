# POS Multi Cabang

Aplikasi Point of Sale multi cabang: **React (Vite) + Express + MySQL**, JWT, peran pengguna, stok pusat/cabang, transfer dengan approval, POS dengan harga eceran vs grosir (khusus reseller), absensi GPS, laporan & ekspor PDF/Excel.

## Struktur folder

```
pos-multicabang/
├── backend/
│   ├── server.js          # satu entry Express (modular per blok)
│   ├── scripts/seed.js    # opsional: reset password semua user
│   ├── uploads/           # hasil upload gambar produk
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── public/            # manifest, sw.js, icons, favicon
│   ├── src/
│   │   ├── components/    # DataTable, Modal, Skeleton, dll.
│   │   ├── contexts/      # AuthContext
│   │   ├── hooks/         # useServerTable
│   │   ├── layouts/       # DashboardLayout + sidebar responsive
│   │   ├── pages/
│   │   ├── services/      # Axios per domain
│   │   ├── store/         # Zustand keranjang POS
│   │   └── utils/
│   ├── package.json
│   └── .env.example
├── database.sql           # skema + indeks + FK + data dummy
├── API_DOCUMENTATION.md
└── README.md
```

## Prasyarat

- **Node.js** 20.11+ atau 22+ (backend memakai `import.meta.dirname`)
- **MySQL** 8.x

## Setup database

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS pos_multicabang CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p pos_multicabang < database.sql
```

Password default semua user dummy: **`Admin123!`**

Akun contoh:

| Email | Role |
| --- | --- |
| superadmin@pos.local | Super Admin |
| adminpusat@pos.local | Admin Cabang (cabang 1) |
| adminbdg@pos.local | Admin Cabang (cabang 2) |
| kasirbdg@pos.local | Kasir |
| karyawanbdg@pos.local | Karyawan |

## Backend

```bash
cd backend
cp .env.example .env
# isi DB_* dan JWT_SECRET
npm install
npm run dev
```

API default: `https://api.kingcreativestudio.my.id/pos-multicabang`  
Folder `uploads/` dibuat otomatis jika belum ada.

## Frontend

```bash
cd frontend
cp .env.example .env
# VITE_API_URL kosong = pakai proxy Vite ke localhost:5000
npm install
npm run dev
```

Buka `http://localhost:5173`.

**PWA:** `public/manifest.webmanifest` + `public/sw.js` (cache dasar). Service worker hanya terdaftar di build produksi (`npm run build` + `npm run preview` atau deploy static).

## Build produksi

```bash
cd frontend && npm run build
# hasil di frontend/dist — layani sebagai static site + reverse proxy /api ke backend
```

## Aturan bisnis penting

1. **Harga grosir** hanya jika transaksi memilih **reseller** aktif dan qty baris ≥ `min_wholesale_qty`. Pembeli biasa selalu **eceran** meskipun qty besar.
2. **Kasir** tidak punya route untuk mengubah master (kategori, satuan, produk, cabang, user, transfer approval, dll.).
3. **Transfer stok** dari pusat: cabang mengajukan → **Super Admin** menyetujui/menolak; stok pusat & cabang serta `stock_mutations` diperbarui saat approve.
4. **Absensi:** clock in/out wajib kirim `latitude` & `longitude`; jarak ke titik cabang harus dalam `attendance_radius_meters`. User **kasir** tanpa baris `employees` akan dibuat otomatis saat pertama kali absen/list absensi.
5. **Koreksi stok:** dari UI **Stok Pusat** / **Stok Cabang** (admin) memanggil `POST /api/stock/adjust` — selisih qty positif/negatif, tercatat di mutasi. Selain itu stok naik lewat **transfer** dari pusat ke cabang.

## Seeder ulang password (opsional)

```bash
cd backend
DB_PASSWORD=... SEED_PASSWORD=Admin123! npm run seed
```

## Lisensi & produksi

- Ganti `JWT_SECRET` dan kredensial DB di produksi.
- Set `CORS_ORIGIN` agar sesuai domain deployment. URL gambar produk disimpan sebagai path relatif (`/uploads/...`); di frontend set `VITE_API_URL` ke origin API agar gabungan URL benar.
- Pertimbangkan HTTPS, rate limit, dan backup DB untuk produksi.

Lihat **`API_DOCUMENTATION.md`** untuk daftar endpoint REST.
# pos-multicabang
