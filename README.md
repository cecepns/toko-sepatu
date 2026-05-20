# POS Toko Sepatu

Aplikasi Point of Sale untuk **toko sepatu single outlet**: React (Vite) PWA + Express + MySQL.

## Fitur utama

- **POS** — jual per varian (warna, ukuran, tipe futsal / sepak bola)
- **Produk** — model sepatu + banyak varian per model
- **Stok** — satu gudang/toko, koreksi stok & mutasi
- **Laporan** — penjualan, omset harian, laba rugi, stok, produk terlaris
- **Promo** — harga promo per varian
- **Peran** — Admin (master data + laporan), Kasir (POS + riwayat sendiri)

Tanpa: multi cabang, transfer stok, wallet/pulsa, absensi.

## Struktur

```
├── backend/server.js
├── frontend/src/
├── database.sql
└── README.md
```

## Setup database

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS pos_toko_sepatu CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p pos_toko_sepatu < database.sql
```

Password default: **`Admin123!`**

| Email | Role |
| --- | --- |
| admin@tokosepatu.local | Admin |
| kasir@tokosepatu.local | Kasir |

## Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

## Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Buka `http://localhost:5173`.

## Varian produk

Satu **model** (mis. Nike Mercurial) punya banyak **varian**:

- Warna (Merah, Hitam, …)
- Ukuran (39, 40, 41, …)
- Tipe: **Futsal**, **Sepak Bola**, atau **Umum**

Setiap varian punya SKU unik, barcode opsional, HPP, harga jual, dan stok sendiri.

## Produksi

- Ganti `JWT_SECRET` dan kredensial DB
- Set `CORS_ORIGIN` ke domain frontend
- `npm run build` di folder frontend
