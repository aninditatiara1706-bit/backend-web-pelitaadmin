/*
  Warnings:

  - A unique constraint covering the columns `[user_id]` on the table `peserta` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE `antrean` DROP FOREIGN KEY `antrean_jadwal_id_fkey`;

-- DropForeignKey
ALTER TABLE `antrean` DROP FOREIGN KEY `antrean_peserta_id_fkey`;

-- DropForeignKey
ALTER TABLE `pemeriksaan` DROP FOREIGN KEY `pemeriksaan_jadwal_id_fkey`;

-- DropForeignKey
ALTER TABLE `pemeriksaan` DROP FOREIGN KEY `pemeriksaan_peserta_id_fkey`;

-- AlterTable
ALTER TABLE `peserta` ADD COLUMN `nama_wali` VARCHAR(100) NULL,
    ADD COLUMN `no_telepon_wali` VARCHAR(20) NULL,
    ADD COLUMN `user_id` VARCHAR(191) NULL,
    ADD COLUMN `usia_kehamilan` VARCHAR(50) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `peserta_user_id_key` ON `peserta`(`user_id`);

-- AddForeignKey
ALTER TABLE `peserta` ADD CONSTRAINT `peserta_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `antrean` ADD CONSTRAINT `antrean_jadwal_id_fkey` FOREIGN KEY (`jadwal_id`) REFERENCES `jadwal_posyandu`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `antrean` ADD CONSTRAINT `antrean_peserta_id_fkey` FOREIGN KEY (`peserta_id`) REFERENCES `peserta`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pemeriksaan` ADD CONSTRAINT `pemeriksaan_jadwal_id_fkey` FOREIGN KEY (`jadwal_id`) REFERENCES `jadwal_posyandu`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pemeriksaan` ADD CONSTRAINT `pemeriksaan_peserta_id_fkey` FOREIGN KEY (`peserta_id`) REFERENCES `peserta`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
