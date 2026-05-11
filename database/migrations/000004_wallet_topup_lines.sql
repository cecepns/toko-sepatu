-- Pencatatan saldo masuk (top-up) per kanal aplikasi per hari & cabang
-- Jalankan: cd backend && npm run migrate

CREATE TABLE IF NOT EXISTS wallet_topup_lines (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id INT UNSIGNED NOT NULL,
  topup_date DATE NOT NULL,
  channel VARCHAR(24) NOT NULL COMMENT 'simpel|digipos|bonafit',
  amount DECIMAL(14,2) NOT NULL COMMENT 'Nominal saldo masuk',
  notes VARCHAR(255) NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wtl_branch_date_ch (branch_id, topup_date, channel),
  CONSTRAINT fk_wtl_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_wtl_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
