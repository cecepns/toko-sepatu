-- Promo harga produk (ecer & grosir) per rentang tanggal; harga di POS = otomatis promo jika hari ini dalam periode

CREATE TABLE IF NOT EXISTS product_promos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id INT UNSIGNED NOT NULL,
  promo_retail_price DECIMAL(14,2) NOT NULL,
  promo_wholesale_price DECIMAL(14,2) NULL COMMENT 'NULL = pakai harga promo ecer untuk tier grosir',
  valid_from DATE NOT NULL,
  valid_until DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_product_promos_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_promo_product (product_id),
  INDEX idx_promo_dates (valid_from, valid_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
