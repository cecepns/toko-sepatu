# Migrasi basis data (SQL)

Skema lengkap untuk instal baru ada di **`database.sql`** (root repo).  
Folder ini dipakai untuk **perubahan bertahap** pada database yang sudah jalan di production/staging.

## Cara pakai

1. Pastikan variabel lingkungan DB sama seperti backend (lihat `backend/.env` atau `database.sql`).
2. Dari folder **`backend`**:

   ```bash
   npm run migrate
   ```

   Skrip akan membuat tabel `schema_migrations` (jika belum ada), lalu menjalankan setiap file `.sql` yang belum pernah dijalankan, **diurutkan nama file**.

## Menambah migrasi baru

1. Buat file baru dengan nama:

   ```
   NNNNNN_deskripsi_singkat.sql
   ```

   Contoh: `000002_add_products_legacy_code.sql`  
   Enam digit awal wajib naik urut supaya urutan eksekusi jelas.

2. Isi file dengan SQL yang idempoten jika memungkinkan, misalnya:

   ```sql
   ALTER TABLE products
     ADD COLUMN legacy_code VARCHAR(32) NULL COMMENT 'kode lama' AFTER sku;
   ```

   Untuk kolom yang mungkin sudah ada di lingkungan tertentu:

   ```sql
   -- MySQL 8+: cek information_schema jika perlu
   ```

3. Commit file migrasi bersama perubahan kode yang memakai kolom/tabel baru.
4. Jalankan `npm run migrate` di server setelah deploy.

## Catatan

- Satu file bisa berisi beberapa pernyataan (dipisah `;`). Hindari `DELIMITER` procedure panjang di sini; pecah atau jalankan manual jika perlu.
- DDL seperti `ALTER TABLE` di MySQL dapat melakukan commit implisit; jika migrasi gagal di tengah file, perbaiki DB atau migrasi lalu jalankan ulang (skrip tidak menjalankan ulang file yang sudah tercatat di `schema_migrations`).
- Setelah migrasi, pertimbangkan memperbarui **`database.sql`** agar instal baru tetap konsisten (atau dokumentasikan bahwa baseline + migrasi = skema terkini).
