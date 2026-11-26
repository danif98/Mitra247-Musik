-- Music Player: users who signed in with Google (open registration, one row per email).
-- Run once on the Virtualmin MySQL/MariaDB, in the database you created for the app:
--   mysql -u <user> -p <database> < schema.sql
--
-- Block someone:    UPDATE app_users SET status = 'blocked' WHERE email = 'name@example.com';
-- Unblock someone:  UPDATE app_users SET status = 'active'  WHERE email = 'name@example.com';
-- Delete a user:    DELETE FROM app_users WHERE email = 'name@example.com';

CREATE TABLE IF NOT EXISTS app_users (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- Lower case. The unicode_ci collation also makes the unique key case-insensitive.
  email       VARCHAR(254) NOT NULL,
  name        VARCHAR(200) NOT NULL DEFAULT '',
  -- 'blocked' locks the app for this email at its next check (at most a day later when online).
  status      ENUM('active', 'blocked') NOT NULL DEFAULT 'active',
  -- Edition of the last sign in: 'personal' or 'play'.
  edition     VARCHAR(20) NOT NULL DEFAULT '',
  first_seen  DATETIME NOT NULL,
  last_seen   DATETIME NOT NULL,
  login_count INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_users_email (email)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
