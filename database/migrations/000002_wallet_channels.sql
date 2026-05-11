-- Kanal saldo digital (Simpel / Digipos / Bonafit) + snapshot saldo harian per cabang
-- Jalankan: cd backend && npm run migrate

ALTER TABLE payments
  ADD COLUMN wallet_channel VARCHAR(24) NULL DEFAULT NULL COMMENT 'simpel|digipos|bonafit — isi dari POS saat top-up pakai aplikasi' AFTER method;

CREATE TABLE IF NOT EXISTS wallet_daily_snapshots (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id INT UNSIGNED NOT NULL,
  snapshot_date DATE NOT NULL,
  channel VARCHAR(24) NOT NULL,
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
