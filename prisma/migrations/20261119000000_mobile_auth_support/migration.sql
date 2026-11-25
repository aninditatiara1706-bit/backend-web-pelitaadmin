ALTER TABLE `users`
MODIFY `role` ENUM('ADMIN', 'KADER', 'USER') NOT NULL DEFAULT 'USER';

SET @addTelepon = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'telepon'
    ),
    'SELECT 1',
    'ALTER TABLE `users` ADD COLUMN `telepon` VARCHAR(20) NULL'
  )
);
PREPARE addTeleponStatement FROM @addTelepon;
EXECUTE addTeleponStatement;
DEALLOCATE PREPARE addTeleponStatement;

SET @addAvatar = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'avatar'
    ),
    'SELECT 1',
    'ALTER TABLE `users` ADD COLUMN `avatar` VARCHAR(255) NULL'
  )
);
PREPARE addAvatarStatement FROM @addAvatar;
EXECUTE addAvatarStatement;
DEALLOCATE PREPARE addAvatarStatement;
