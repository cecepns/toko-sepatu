-- Jalankan sekali pada database yang sudah ada (sebelum kolom transfer_date).
ALTER TABLE stock_transfers
  ADD COLUMN transfer_date DATE NULL AFTER to_branch_id;

UPDATE stock_transfers SET transfer_date = DATE(created_at) WHERE transfer_date IS NULL;

ALTER TABLE stock_transfers
  MODIFY transfer_date DATE NOT NULL,
  ADD INDEX idx_st_transfer_date (transfer_date);
