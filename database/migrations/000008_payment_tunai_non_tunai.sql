-- Metode pembayaran: tunai (cash) vs non tunai (non_cash)
UPDATE payments SET method = 'non_cash' WHERE method NOT IN ('cash', 'non_cash');

ALTER TABLE payments
  MODIFY COLUMN method ENUM('cash','non_cash') NOT NULL DEFAULT 'cash';
