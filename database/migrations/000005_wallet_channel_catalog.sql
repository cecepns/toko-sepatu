-- Master kanal aplikasi (dinamis) + produk kanal (tanpa stok) + baris penjualan opsional
-- Jalankan: cd backend && npm run migrate

CREATE TABLE IF NOT EXISTS wallet_channels (
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
  ('bonafit', 'Bonafit', 3, 1)
ON DUPLICATE KEY UPDATE label = VALUES(label), sort_order = VALUES(sort_order);

CREATE TABLE IF NOT EXISTS wallet_channel_products (
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

ALTER TABLE sale_items
  MODIFY COLUMN product_id INT UNSIGNED NULL COMMENT 'NULL jika baris produk kanal aplikasi',
  ADD COLUMN wallet_channel_product_id BIGINT UNSIGNED NULL DEFAULT NULL AFTER product_id,
  ADD CONSTRAINT fk_si_wallet_channel_product FOREIGN KEY (wallet_channel_product_id) REFERENCES wallet_channel_products(id) ON DELETE RESTRICT,
  ADD INDEX idx_si_wallet_product (wallet_channel_product_id);

ALTER TABLE payments MODIFY COLUMN wallet_channel VARCHAR(48) NULL DEFAULT NULL;
ALTER TABLE wallet_daily_snapshots MODIFY COLUMN channel VARCHAR(48) NOT NULL;
ALTER TABLE wallet_manual_lines MODIFY COLUMN channel VARCHAR(48) NOT NULL;
ALTER TABLE wallet_topup_lines MODIFY COLUMN channel VARCHAR(48) NOT NULL;
