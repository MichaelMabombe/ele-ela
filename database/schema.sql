CREATE DATABASE IF NOT EXISTS ele_ela
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ele_ela;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  role ENUM('admin', 'client') NOT NULL,
  client_type ENUM('prepaid', 'postpaid') NOT NULL DEFAULT 'prepaid',
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  phone VARCHAR(30) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME NULL
);

CREATE TABLE IF NOT EXISTS services (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  duration INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS staff (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  specialty VARCHAR(120) NOT NULL
);

CREATE TABLE IF NOT EXISTS reservations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  client_id CHAR(36) NULL,
  staff_id CHAR(36) NULL,
  date DATE NULL,
  time VARCHAR(10) NULL,
  status ENUM('pending', 'confirmed', 'cancelled', 'completed') NOT NULL DEFAULT 'pending',
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_duration INT NOT NULL DEFAULT 0,
  payment_id CHAR(36) NULL,
  payment_status ENUM('paid', 'unpaid') NOT NULL DEFAULT 'unpaid',
  cart_items_json JSON NULL,
  created_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  rescheduled_at DATETIME NULL,
  INDEX idx_res_client (client_id),
  INDEX idx_res_staff (staff_id),
  INDEX idx_res_date (date)
);

CREATE TABLE IF NOT EXISTS payments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  reservation_id CHAR(36) NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  method VARCHAR(60) NOT NULL,
  status VARCHAR(30) NOT NULL,
  transaction_ref VARCHAR(120) NULL,
  paid_at DATETIME NULL,
  created_at DATETIME NULL,
  INDEX idx_pay_reservation (reservation_id),
  INDEX idx_pay_paid_at (paid_at)
);

CREATE TABLE IF NOT EXISTS debts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  reservation_id CHAR(36) NULL,
  client_id CHAR(36) NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  status ENUM('open', 'paid') NOT NULL DEFAULT 'open',
  payment_id CHAR(36) NULL,
  created_at DATETIME NULL,
  paid_at DATETIME NULL,
  INDEX idx_debt_reservation (reservation_id),
  INDEX idx_debt_client (client_id),
  INDEX idx_debt_payment (payment_id)
);

