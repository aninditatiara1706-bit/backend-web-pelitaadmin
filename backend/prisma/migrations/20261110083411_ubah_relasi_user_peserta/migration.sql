-- Buat index biasa terlebih dahulu
CREATE INDEX `peserta_user_id_idx`
ON `peserta`(`user_id`);

-- Hapus unique index agar satu akun dapat memiliki banyak peserta
DROP INDEX `peserta_user_id_key`
ON `peserta`;