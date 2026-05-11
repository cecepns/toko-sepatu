-- Baris transaksi manual per kanal (Simpel / Digipos / Bonafit): keterangan + modal + harga jual
-- Jalankan: cd backend && npm run migrate

CREATE TABLE IF NOT EXISTS wallet_manual_lines (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id INT UNSIGNED NOT NULL,
  line_date DATE NOT NULL,
  channel VARCHAR(24) NOT NULL COMMENT 'simpel|digipos|bonafit',
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
