-- Tambah jenis olahraga: running, badminton
ALTER TABLE product_variants
  MODIFY COLUMN sport_type ENUM('sepak_bola', 'futsal', 'running', 'badminton', 'umum') NOT NULL DEFAULT 'umum';
