-- ============================================================
-- POS Multi Cabang - MySQL Schema
-- Charset: utf8mb4 | Engine: InnoDB
-- Default password semua user dummy: Admin123!
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS activity_logs;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS sale_items;
DROP TABLE IF EXISTS wallet_channel_products;
DROP TABLE IF EXISTS wallet_channels;
DROP TABLE IF EXISTS sales;
DROP TABLE IF EXISTS stock_mutations;
DROP TABLE IF EXISTS stock_transfer_items;
DROP TABLE IF EXISTS stock_transfers;
DROP TABLE IF EXISTS stock_branch;
DROP TABLE IF EXISTS stock_central;
DROP TABLE IF EXISTS product_prices;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS units;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS memberships;
DROP TABLE IF EXISTS resellers;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS attendances;
DROP TABLE IF EXISTS employees;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS branches;
DROP TABLE IF EXISTS roles;

SET FOREIGN_KEY_CHECKS = 1;

-- ------------------------------------------------------------
-- roles
-- ------------------------------------------------------------
CREATE TABLE roles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  slug VARCHAR(32) NOT NULL UNIQUE COMMENT 'super_admin, admin_cabang, kasir, karyawan',
  description VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_roles_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- branches
-- ------------------------------------------------------------
CREATE TABLE branches (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(16) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  address TEXT NOT NULL,
  phone VARCHAR(32) NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  latitude DECIMAL(10,7) NOT NULL COMMENT 'Titik pusat validasi absensi',
  longitude DECIMAL(10,7) NOT NULL,
  attendance_radius_meters INT UNSIGNED NOT NULL DEFAULT 100 COMMENT 'Radius hadir dari titik cabang',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_branches_status (status),
  INDEX idx_branches_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- users (JWT subject)
-- ------------------------------------------------------------
CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NULL COMMENT 'NULL untuk super_admin',
  email VARCHAR(128) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(128) NOT NULL,
  phone VARCHAR(32) NULL,
  avatar_url VARCHAR(512) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT,
  CONSTRAINT fk_users_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  INDEX idx_users_branch (branch_id),
  INDEX idx_users_role (role_id),
  INDEX idx_users_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- employees (karyawan terikat user + cabang)
-- ------------------------------------------------------------
CREATE TABLE employees (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  employee_code VARCHAR(32) NOT NULL,
  position VARCHAR(64) NULL,
  hire_date DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_employees_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_employees_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  UNIQUE KEY uk_employees_code_branch (employee_code, branch_id),
  INDEX idx_employees_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- attendances
-- ------------------------------------------------------------
CREATE TABLE attendances (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id INT UNSIGNED NOT NULL,
  branch_id INT UNSIGNED NOT NULL,
  clock_in_at DATETIME NOT NULL,
  clock_out_at DATETIME NULL,
  latitude_in DECIMAL(10,7) NOT NULL,
  longitude_in DECIMAL(10,7) NOT NULL,
  latitude_out DECIMAL(10,7) NULL,
  longitude_out DECIMAL(10,7) NULL,
  distance_in_meters INT UNSIGNED NULL COMMENT 'Jarak dari titik cabang saat clock in',
  status ENUM('hadir','telat','tidak_hadir') NOT NULL DEFAULT 'hadir',
  late_minutes INT UNSIGNED NOT NULL DEFAULT 0,
  notes VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_att_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_att_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  INDEX idx_att_branch_date (branch_id, clock_in_at),
  INDEX idx_att_employee_date (employee_id, clock_in_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- categories
-- ------------------------------------------------------------
CREATE TABLE categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  description VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_categories_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- units
-- ------------------------------------------------------------
CREATE TABLE units (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  abbreviation VARCHAR(16) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_units_abbr (abbreviation)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- products
-- ------------------------------------------------------------
CREATE TABLE products (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id INT UNSIGNED NOT NULL,
  unit_id INT UNSIGNED NOT NULL,
  sku VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  barcode VARCHAR(64) NULL UNIQUE,
  image_url VARCHAR(512) NULL,
  hpp DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Harga pokok / modal',
  retail_price DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Harga eceran',
  wholesale_price DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Harga grosir reseller',
  min_wholesale_qty INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Minimal qty untuk harga grosir (hanya reseller)',
  min_stock INT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_prod_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  CONSTRAINT fk_prod_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT,
  INDEX idx_products_category (category_id),
  INDEX idx_products_barcode (barcode),
  INDEX idx_products_name (name),
  INDEX idx_products_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- product_prices (riwayat / tier tambahan)
-- ------------------------------------------------------------
CREATE TABLE product_prices (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id INT UNSIGNED NOT NULL,
  price_type ENUM('retail','wholesale','promo') NOT NULL,
  price DECIMAL(14,2) NOT NULL,
  min_qty INT UNSIGNED NOT NULL DEFAULT 1,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pp_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_pp_product (product_id, effective_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- stock_central (gudang pusat)
-- ------------------------------------------------------------
CREATE TABLE stock_central (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id INT UNSIGNED NOT NULL UNIQUE,
  quantity INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sc_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- stock_branch
-- ------------------------------------------------------------
CREATE TABLE stock_branch (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sb_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_sb_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  UNIQUE KEY uk_sb_branch_product (branch_id, product_id),
  INDEX idx_sb_branch (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- stock_transfers
-- ------------------------------------------------------------
CREATE TABLE stock_transfers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  transfer_number VARCHAR(32) NOT NULL UNIQUE,
  from_source ENUM('central','branch') NOT NULL DEFAULT 'central',
  from_branch_id INT UNSIGNED NULL COMMENT 'Jika from branch',
  to_branch_id INT UNSIGNED NOT NULL,
  transfer_date DATE NOT NULL COMMENT 'Tanggal efektif / referensi transfer',
  status ENUM('pending','approved','rejected','completed') NOT NULL DEFAULT 'pending',
  requested_by INT UNSIGNED NOT NULL,
  approved_by INT UNSIGNED NULL,
  approved_at DATETIME NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_st_to_branch FOREIGN KEY (to_branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_st_from_branch FOREIGN KEY (from_branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_st_req_user FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_st_app_user FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_st_status (status),
  INDEX idx_st_to (to_branch_id),
  INDEX idx_st_transfer_date (transfer_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stock_transfer_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  transfer_id BIGINT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  quantity INT NOT NULL,
  CONSTRAINT fk_sti_transfer FOREIGN KEY (transfer_id) REFERENCES stock_transfers(id) ON DELETE CASCADE,
  CONSTRAINT fk_sti_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  INDEX idx_sti_transfer (transfer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- stock_mutations (log aktivitas stok)
-- ------------------------------------------------------------
CREATE TABLE stock_mutations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id INT UNSIGNED NULL COMMENT 'NULL = pusat',
  product_id INT UNSIGNED NOT NULL,
  mutation_type ENUM('sale','transfer_in','transfer_out','adjustment','pos_sale','transfer_approve') NOT NULL,
  quantity_delta INT NOT NULL,
  ref_type VARCHAR(32) NULL,
  ref_id BIGINT UNSIGNED NULL,
  notes VARCHAR(255) NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sm_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_sm_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_sm_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_sm_product (product_id, created_at),
  INDEX idx_sm_branch (branch_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- customers
-- ------------------------------------------------------------
CREATE TABLE customers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id INT UNSIGNED NULL COMMENT 'Cabang pendaftaran utama',
  code VARCHAR(32) NOT NULL,
  name VARCHAR(128) NOT NULL,
  phone VARCHAR(32) NULL,
  address TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cust_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  UNIQUE KEY uk_customers_code (code),
  INDEX idx_customers_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- memberships
-- ------------------------------------------------------------
CREATE TABLE memberships (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL UNIQUE,
  tier ENUM('bronze','silver','gold') NOT NULL DEFAULT 'bronze',
  points INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_mem_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- resellers (pembeli dengan hak harga grosir)
-- ------------------------------------------------------------
CREATE TABLE resellers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL UNIQUE,
  company_name VARCHAR(128) NOT NULL,
  tax_id VARCHAR(64) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_res_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  INDEX idx_resellers_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- wallet_channels (kanal saldo aplikasi — dinamis)
-- ------------------------------------------------------------
CREATE TABLE wallet_channels (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(32) NOT NULL UNIQUE,
  label VARCHAR(64) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO wallet_channels (slug, label, sort_order, is_active) VALUES
  ('simpel', 'Simpel', 1, 1),
  ('digipos', 'Digipos', 2, 1),
  ('bonafit', 'Bonafit', 3, 1);

-- ------------------------------------------------------------
-- wallet_channel_products (master penjualan kanal, tanpa stok)
-- ------------------------------------------------------------
CREATE TABLE wallet_channel_products (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  channel_id INT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  default_cost DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Modal / estimasi potong saldo',
  default_sale_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wcp_channel_active (channel_id, is_active),
  CONSTRAINT fk_wcp_channel FOREIGN KEY (channel_id) REFERENCES wallet_channels(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- sales
-- ------------------------------------------------------------
CREATE TABLE sales (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sale_number VARCHAR(32) NOT NULL UNIQUE,
  branch_id INT UNSIGNED NOT NULL,
  cashier_user_id INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NULL,
  reseller_id INT UNSIGNED NULL COMMENT 'Jika transaksi atas nama reseller',
  is_wholesale_context TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 jika buyer reseller (line price wholesale eligible)',
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  grand_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  printed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sale_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sale_cashier FOREIGN KEY (cashier_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sale_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT fk_sale_reseller FOREIGN KEY (reseller_id) REFERENCES resellers(id) ON DELETE SET NULL,
  INDEX idx_sales_branch_date (branch_id, created_at),
  INDEX idx_sales_number (sale_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sale_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sale_id BIGINT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NULL COMMENT 'NULL jika baris produk kanal aplikasi',
  wallet_channel_product_id BIGINT UNSIGNED NULL DEFAULT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(14,2) NOT NULL,
  line_subtotal DECIMAL(14,2) NOT NULL,
  is_wholesale_line TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_si_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  CONSTRAINT fk_si_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  CONSTRAINT fk_si_wallet_channel_product FOREIGN KEY (wallet_channel_product_id) REFERENCES wallet_channel_products(id) ON DELETE RESTRICT,
  INDEX idx_si_sale (sale_id),
  INDEX idx_si_wallet_product (wallet_channel_product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sale_id BIGINT UNSIGNED NOT NULL,
  method ENUM('cash','transfer','card','qris','other') NOT NULL DEFAULT 'cash',
  wallet_channel VARCHAR(48) NULL DEFAULT NULL COMMENT 'slug kanal dari wallet_channels',
  amount DECIMAL(14,2) NOT NULL,
  paid_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pay_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  INDEX idx_payments_sale (sale_id),
  INDEX idx_payments_wallet (wallet_channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- wallet_daily_snapshots (saldo awal/akhir per kanal & cabang)
-- ------------------------------------------------------------
CREATE TABLE wallet_daily_snapshots (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id INT UNSIGNED NOT NULL,
  snapshot_date DATE NOT NULL,
  channel VARCHAR(48) NOT NULL,
  opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  closing_balance DECIMAL(14,2) NULL,
  notes VARCHAR(255) NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_wallet_day (branch_id, snapshot_date, channel),
  CONSTRAINT fk_wds_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_wds_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- wallet_manual_lines (transaksi saldo kanal tanpa master produk)
-- ------------------------------------------------------------
CREATE TABLE wallet_manual_lines (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id INT UNSIGNED NOT NULL,
  line_date DATE NOT NULL,
  channel VARCHAR(48) NOT NULL COMMENT 'slug wallet_channels',
  customer_phone VARCHAR(32) NULL,
  description VARCHAR(255) NOT NULL,
  cost_amount DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Modal — estimasi potong saldo aplikasi',
  sale_amount DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Harga jual ke pelanggan',
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wml_branch_date_ch (branch_id, line_date, channel),
  CONSTRAINT fk_wml_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_wml_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- wallet_topup_lines (saldo masuk / top-up kanal, tanpa produk)
-- ------------------------------------------------------------
CREATE TABLE wallet_topup_lines (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id INT UNSIGNED NOT NULL,
  topup_date DATE NOT NULL,
  channel VARCHAR(48) NOT NULL COMMENT 'slug wallet_channels',
  amount DECIMAL(14,2) NOT NULL COMMENT 'Nominal saldo masuk',
  notes VARCHAR(255) NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wtl_branch_date_ch (branch_id, topup_date, channel),
  CONSTRAINT fk_wtl_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_wtl_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- activity_logs
-- ------------------------------------------------------------
CREATE TABLE activity_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  action VARCHAR(64) NOT NULL,
  entity VARCHAR(64) NOT NULL,
  entity_id VARCHAR(64) NULL,
  meta JSON NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_logs_user (user_id, created_at),
  INDEX idx_logs_entity (entity, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SEED DATA
-- Password hash: Admin123! (bcrypt)
-- ============================================================

INSERT INTO roles (id, name, slug, description) VALUES
(1, 'Super Admin', 'super_admin', 'Akses penuh semua cabang'),
(2, 'Admin Cabang', 'admin_cabang', 'Master data & laporan cabang'),
(3, 'Kasir', 'kasir', 'Penjualan POS'),
(4, 'Karyawan', 'karyawan', 'Absensi & dashboard terbatas');

INSERT INTO branches (id, code, name, address, phone, status, latitude, longitude, attendance_radius_meters) VALUES
(1, 'PUS', 'Cabang Pusat / Gudang', 'Jl. Merdeka No. 1, Jakarta', '021-1111111', 'active', -6.2000000, 106.8166660, 150),
(2, 'BDG', 'Cabang Bandung', 'Jl. Asia Afrika No. 10, Bandung', '022-2222222', 'active', -6.9174639, 107.6191228, 120),
(3, 'SBY', 'Cabang Surabaya', 'Jl. Tunjungan No. 5, Surabaya', '031-3333333', 'active', -7.2574719, 112.7520883, 130);

-- Hash untuk Admin123!
SET @pwd = '$2b$10$X6q96sQPeqTgYP2g80fPv.u036EYGZNWguMiQhCNSIw5g5.iqSsKS';

INSERT INTO users (id, role_id, branch_id, email, password_hash, full_name, phone, is_active) VALUES
(1, 1, NULL, 'superadmin@pos.local', @pwd, 'Super Administrator', '08100000001', 1),
(2, 2, 1, 'adminpusat@pos.local', @pwd, 'Admin Cabang Pusat', '08100000002', 1),
(3, 2, 2, 'adminbdg@pos.local', @pwd, 'Admin Cabang Bandung', '08100000003', 1),
(4, 3, 2, 'kasirbdg@pos.local', @pwd, 'Kasir Bandung', '08100000004', 1),
(5, 4, 2, 'karyawanbdg@pos.local', @pwd, 'Karyawan Bandung', '08100000005', 1);

INSERT INTO employees (user_id, branch_id, employee_code, position, hire_date) VALUES
(5, 2, 'EMP-BDG-001', 'Staff Gudang', '2024-01-15');

INSERT INTO categories (name, description, is_active) VALUES
('Makanan', 'Kategori makanan', 1),
('Minuman', 'Kategori minuman', 1),
('Perlengkapan', 'Non-F&B', 1);

INSERT INTO units (name, abbreviation) VALUES
('Pieces', 'pcs'),
('Kilogram', 'kg'),
('Dus', 'dus');

INSERT INTO products (category_id, unit_id, sku, name, barcode, image_url, hpp, retail_price, wholesale_price, min_wholesale_qty, min_stock, is_active) VALUES
(1, 1, 'SKU-00001', 'Nasi Kotak Ayam', '8990011000001', NULL, 12000, 18000, 15000, 10, 20, 1),
(1, 1, 'SKU-00002', 'Nasi Kotak Ikan', '8990011000002', NULL, 11000, 17000, 14500, 10, 15, 1),
(2, 1, 'SKU-00003', 'Air Mineral 600ml', '8990011000003', NULL, 2000, 4000, 3200, 24, 50, 1),
(2, 1, 'SKU-00004', 'Teh Botol', '8990011000004', NULL, 3000, 6000, 4800, 12, 30, 1),
(3, 1, 'SKU-00005', 'Kantong Plastik', '8990011000005', NULL, 500, 1500, 1200, 50, 100, 1);

INSERT INTO product_prices (product_id, price_type, price, min_qty, effective_from) VALUES
(1, 'retail', 18000, 1, CURDATE()),
(1, 'wholesale', 15000, 10, CURDATE()),
(2, 'retail', 17000, 1, CURDATE()),
(3, 'retail', 4000, 1, CURDATE());

INSERT INTO stock_central (product_id, quantity) VALUES
(1, 500), (2, 400), (3, 2000), (4, 1500), (5, 800);

INSERT INTO stock_branch (branch_id, product_id, quantity) VALUES
(1, 1, 50), (1, 2, 40), (1, 3, 200), (2, 1, 30), (2, 3, 150), (2, 4, 100), (3, 1, 25), (3, 2, 35);

INSERT INTO customers (branch_id, code, name, phone, address, is_active) VALUES
(2, 'CUST-001', 'Budi Santoso', '081234567890', 'Jl. Mawar No. 2', 1),
(2, 'CUST-002', 'Siti Aminah', '081298765432', 'Jl. Melati', 1);

INSERT INTO memberships (customer_id, tier, points) VALUES
(1, 'silver', 120),
(2, 'bronze', 40);

INSERT INTO resellers (customer_id, company_name, tax_id, is_active) VALUES
(2, 'CV Melati Jaya', '01.234.567.8-901.000', 1);

INSERT INTO stock_transfers (transfer_number, from_source, from_branch_id, to_branch_id, transfer_date, status, requested_by, approved_by, approved_at, notes) VALUES
('TRF-20250101-0001', 'central', NULL, 2, '2025-01-01', 'completed', 2, 1, NOW(), 'Transfer awal stok');

INSERT INTO stock_transfer_items (transfer_id, product_id, quantity) VALUES
(1, 1, 20), (1, 3, 100);

INSERT INTO stock_mutations (branch_id, product_id, mutation_type, quantity_delta, ref_type, ref_id, notes, created_by) VALUES
(NULL, 1, 'transfer_out', -20, 'stock_transfer', 1, 'Transfer ke cabang', 1),
(2, 1, 'transfer_in', 20, 'stock_transfer', 1, 'Dari pusat', 1);

INSERT INTO sales (sale_number, branch_id, cashier_user_id, customer_id, reseller_id, is_wholesale_context, subtotal, discount_amount, tax_amount, tax_percent, grand_total, notes) VALUES
('INV-20250110-0001', 2, 4, 2, 1, 1, 150000, 0, 15000, 10, 165000, 'Grosir reseller');

INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, line_subtotal, is_wholesale_line) VALUES
(1, 1, 10, 15000, 150000, 1);

INSERT INTO payments (sale_id, method, amount) VALUES
(1, 'transfer', 165000);

INSERT INTO activity_logs (user_id, action, entity, entity_id, meta) VALUES
(1, 'login', 'user', '1', JSON_OBJECT('email','superadmin@pos.local')),
(4, 'create_sale', 'sale', '1', JSON_OBJECT('total',165000));

SET FOREIGN_KEY_CHECKS = 1;
