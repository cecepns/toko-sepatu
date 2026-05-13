-- Master shift kerja per cabang + penempatan karyawan + jejak absensi

CREATE TABLE work_shifts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id INT UNSIGNED NOT NULL,
  name VARCHAR(64) NOT NULL,
  time_in TIME NOT NULL COMMENT 'Jam mulai kerja (acuan telat)',
  time_out TIME NOT NULL COMMENT 'Jam selesai kerja (informasi / batas logika)',
  grace_in_minutes INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Menit toleransi setelah time_in sebelum dihitung telat',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_work_shift_branch_name (branch_id, name),
  CONSTRAINT fk_ws_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE employees
  ADD COLUMN work_shift_id INT UNSIGNED NULL AFTER position,
  ADD CONSTRAINT fk_employees_work_shift FOREIGN KEY (work_shift_id) REFERENCES work_shifts(id) ON DELETE SET NULL;

ALTER TABLE attendances
  ADD COLUMN work_shift_id INT UNSIGNED NULL AFTER branch_id,
  ADD CONSTRAINT fk_att_work_shift FOREIGN KEY (work_shift_id) REFERENCES work_shifts(id) ON DELETE SET NULL;
