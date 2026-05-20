-- ============================================================
-- POS Toko Sepatu — MySQL Schema (single store, product variants)
-- Charset: utf8mb4 | Engine: InnoDB
-- Default password semua user dummy: Admin123!
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS activity_logs;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS sale_items;
DROP TABLE IF EXISTS sales;
DROP TABLE IF EXISTS stock_mutations;
DROP TABLE IF EXISTS product_promos;
DROP TABLE IF EXISTS product_variants;
DROP TABLE IF EXISTS product_models;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS roles;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE roles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  slug VARCHAR(32) NOT NULL UNIQUE COMMENT 'admin, kasir',
  description VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role_id INT UNSIGNED NOT NULL,
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
  INDEX idx_users_role (role_id),
  INDEX idx_users_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  description VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_categories_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Model sepatu (nama/model dasar, satu gambar utama)
CREATE TABLE product_models (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id INT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  brand VARCHAR(128) NULL,
  description TEXT NULL,
  image_url VARCHAR(512) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pm_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  INDEX idx_pm_name (name),
  INDEX idx_pm_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Varian jual: warna, ukuran, tipe (futsal / sepak bola / umum)
CREATE TABLE product_variants (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  model_id INT UNSIGNED NOT NULL,
  sku VARCHAR(32) NOT NULL UNIQUE,
  barcode VARCHAR(64) NULL UNIQUE,
  color VARCHAR(64) NOT NULL,
  size VARCHAR(16) NOT NULL COMMENT 'Contoh: 39, 40, 41',
  sport_type ENUM('futsal','sepak_bola','umum') NOT NULL DEFAULT 'umum',
  hpp DECIMAL(14,2) NOT NULL DEFAULT 0,
  retail_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  quantity INT NOT NULL DEFAULT 0,
  min_stock INT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pv_model FOREIGN KEY (model_id) REFERENCES product_models(id) ON DELETE CASCADE,
  UNIQUE KEY uk_pv_model_attrs (model_id, color, size, sport_type),
  INDEX idx_pv_model (model_id),
  INDEX idx_pv_barcode (barcode),
  INDEX idx_pv_sku (sku),
  INDEX idx_pv_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_promos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  variant_id INT UNSIGNED NOT NULL,
  promo_price DECIMAL(14,2) NOT NULL,
  valid_from DATE NOT NULL,
  valid_until DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pp_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
  INDEX idx_pp_variant_dates (variant_id, valid_from, valid_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stock_mutations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  variant_id INT UNSIGNED NOT NULL,
  mutation_type ENUM('sale','adjustment','restock','pos_sale') NOT NULL,
  quantity_delta INT NOT NULL,
  ref_type VARCHAR(32) NULL,
  ref_id BIGINT UNSIGNED NULL,
  notes VARCHAR(255) NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sm_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
  CONSTRAINT fk_sm_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_sm_variant (variant_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  phone VARCHAR(32) NULL,
  address TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_customers_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sales (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sale_number VARCHAR(32) NOT NULL UNIQUE,
  cashier_user_id INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NULL,
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  grand_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  printed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sale_cashier FOREIGN KEY (cashier_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sale_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  INDEX idx_sales_date (created_at),
  INDEX idx_sales_number (sale_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sale_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sale_id BIGINT UNSIGNED NOT NULL,
  variant_id INT UNSIGNED NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(14,2) NOT NULL,
  line_subtotal DECIMAL(14,2) NOT NULL,
  CONSTRAINT fk_si_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  CONSTRAINT fk_si_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT,
  INDEX idx_si_sale (sale_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sale_id BIGINT UNSIGNED NOT NULL,
  method ENUM('cash','transfer','card','qris','other') NOT NULL DEFAULT 'cash',
  amount DECIMAL(14,2) NOT NULL,
  paid_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pay_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  INDEX idx_payments_sale (sale_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  INDEX idx_logs_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SEED DATA — Password: Admin123!
-- ============================================================

INSERT INTO roles (id, name, slug, description) VALUES
(1, 'Admin', 'admin', 'Master data, stok, laporan'),
(2, 'Kasir', 'kasir', 'POS & riwayat transaksi sendiri');

SET @pwd = '$2b$10$X6q96sQPeqTgYP2g80fPv.u036EYGZNWguMiQhCNSIw5g5.iqSsKS';

INSERT INTO users (id, role_id, email, password_hash, full_name, phone, is_active) VALUES
(1, 1, 'admin@tokosepatu.local', @pwd, 'Administrator', '08100000001', 1),
(2, 2, 'kasir@tokosepatu.local', @pwd, 'Kasir Utama', '08100000002', 1);

INSERT INTO categories (name, description, is_active) VALUES
('Sepatu Futsal', 'Sepatu untuk futsal indoor', 1),
('Sepatu Sepak Bola', 'Sepatu lapangan rumput / sintetis', 1),
('Aksesoris', 'Tas, kaos kaki, dll', 1);

INSERT INTO product_models (id, category_id, name, brand, description, is_active) VALUES
(1, 1, 'Nike Mercurial Vapor', 'Nike', 'Model ringan untuk futsal', 1),
(2, 2, 'Adidas Predator Edge', 'Adidas', 'Model kontrol untuk sepak bola', 1);

INSERT INTO product_variants (model_id, sku, barcode, color, size, sport_type, hpp, retail_price, quantity, min_stock, is_active) VALUES
(1, 'SKU-00001', '8991001000001', 'Merah', '40', 'futsal', 350000, 499000, 12, 3, 1),
(1, 'SKU-00002', '8991001000002', 'Merah', '41', 'futsal', 350000, 499000, 8, 3, 1),
(1, 'SKU-00003', '8991001000003', 'Hitam', '40', 'futsal', 350000, 499000, 5, 3, 1),
(2, 'SKU-00004', '8991001000004', 'Putih', '42', 'sepak_bola', 420000, 599000, 10, 2, 1),
(2, 'SKU-00005', '8991001000005', 'Putih', '43', 'sepak_bola', 420000, 599000, 6, 2, 1),
(2, 'SKU-00006', '8991001000006', 'Hitam', '42', 'sepak_bola', 420000, 599000, 4, 2, 1);

INSERT INTO customers (code, name, phone, is_active) VALUES
('CUST-001', 'Andi Wijaya', '081234567890', 1);

INSERT INTO sales (sale_number, cashier_user_id, customer_id, subtotal, discount_amount, tax_amount, tax_percent, grand_total, notes) VALUES
('INV-20250501-0001', 2, 1, 499000, 0, 0, 0, 499000, 'Contoh transaksi');

INSERT INTO sale_items (sale_id, variant_id, quantity, unit_price, line_subtotal) VALUES
(1, 1, 1, 499000, 499000);

INSERT INTO payments (sale_id, method, amount) VALUES
(1, 'cash', 499000);

INSERT INTO stock_mutations (variant_id, mutation_type, quantity_delta, ref_type, ref_id, notes, created_by) VALUES
(1, 'pos_sale', -1, 'sale', 1, 'Penjualan POS', 2);

UPDATE product_variants SET quantity = quantity - 1 WHERE id = 1;

SET FOREIGN_KEY_CHECKS = 1;
