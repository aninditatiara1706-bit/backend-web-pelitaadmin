-- CreateTable
CREATE TABLE `notifikasi` (
    `id` VARCHAR(191) NOT NULL,
    `judul` VARCHAR(191) NOT NULL,
    `pesan` TEXT NOT NULL,
    `tipe` VARCHAR(191) NOT NULL DEFAULT 'INFO',
    `sudah_dibaca` BOOLEAN NOT NULL DEFAULT false,
    `user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifikasi_user_id_sudah_dibaca_idx`(`user_id`, `sudah_dibaca`),
    INDEX `notifikasi_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `notifikasi` ADD CONSTRAINT `notifikasi_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
