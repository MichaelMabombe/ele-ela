const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const DB_HOST = process.env.MYSQL_HOST || "127.0.0.1";
const DB_PORT = Number(process.env.MYSQL_PORT || 3306);
const DB_USER = process.env.MYSQL_USER || "root";
const DB_PASSWORD = process.env.MYSQL_PASSWORD || "";
const DB_NAME = process.env.MYSQL_DATABASE || "ele_ela";

const toDateTime = (value) => {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 19).replace("T", " ");
};

const toDateOnly = (value) => {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
};

const toNum = (v) => Number(v || 0);

async function ensureSchema(connection) {
  const schemaPath = path.join(process.cwd(), "database", "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf-8");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await connection.query(statement);
  }
}

async function run() {
  const dbPath = path.join(process.cwd(), "data", "db.json");
  if (!fs.existsSync(dbPath)) {
    throw new Error("Arquivo data/db.json nao encontrado.");
  }
  const data = JSON.parse(fs.readFileSync(dbPath, "utf-8"));

  const bootstrapConn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    multipleStatements: true,
  });
  await ensureSchema(bootstrapConn);
  await bootstrapConn.end();

  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
  });

  try {
    await conn.beginTransaction();

    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    await conn.query("TRUNCATE TABLE debts");
    await conn.query("TRUNCATE TABLE payments");
    await conn.query("TRUNCATE TABLE reservations");
    await conn.query("TRUNCATE TABLE staff");
    await conn.query("TRUNCATE TABLE services");
    await conn.query("TRUNCATE TABLE users");
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");

    for (const u of data.users || []) {
      await conn.execute(
        `INSERT INTO users (id, role, client_type, name, email, phone, password_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(u.id || ""),
          u.role === "admin" ? "admin" : "client",
          u.clientType === "postpaid" ? "postpaid" : "prepaid",
          String(u.name || ""),
          String(u.email || ""),
          String(u.phone || ""),
          String(u.passwordHash || ""),
          toDateTime(u.createdAt),
        ]
      );
    }

    for (const s of data.services || []) {
      await conn.execute(
        `INSERT INTO services (id, name, price, duration)
         VALUES (?, ?, ?, ?)`,
        [String(s.id || ""), String(s.name || ""), toNum(s.price), Number(s.duration || 0)]
      );
    }

    for (const st of data.staff || []) {
      await conn.execute(
        `INSERT INTO staff (id, name, specialty)
         VALUES (?, ?, ?)`,
        [String(st.id || ""), String(st.name || ""), String(st.specialty || "")]
      );
    }

    for (const r of data.reservations || []) {
      await conn.execute(
        `INSERT INTO reservations
          (id, client_id, staff_id, date, time, status, total_amount, total_duration, payment_id, payment_status, cart_items_json, created_at, cancelled_at, rescheduled_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(r.id || ""),
          r.clientId ? String(r.clientId) : null,
          r.staffId ? String(r.staffId) : null,
          toDateOnly(r.date),
          r.time ? String(r.time) : null,
          ["pending", "confirmed", "cancelled", "completed"].includes(r.status) ? r.status : "pending",
          toNum(r.totalAmount),
          Number(r.totalDuration || 0),
          r.paymentId ? String(r.paymentId) : null,
          r.paymentStatus === "paid" ? "paid" : "unpaid",
          Array.isArray(r.cartItems) ? JSON.stringify(r.cartItems) : null,
          toDateTime(r.createdAt),
          toDateTime(r.cancelledAt),
          toDateTime(r.rescheduledAt),
        ]
      );
    }

    for (const p of data.payments || []) {
      await conn.execute(
        `INSERT INTO payments
          (id, reservation_id, amount, method, status, transaction_ref, paid_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(p.id || ""),
          p.reservationId ? String(p.reservationId) : null,
          toNum(p.amount),
          String(p.method || ""),
          String(p.status || ""),
          p.transactionRef ? String(p.transactionRef) : null,
          toDateTime(p.paidAt),
          toDateTime(p.createdAt || p.paidAt),
        ]
      );
    }

    for (const d of data.debts || []) {
      await conn.execute(
        `INSERT INTO debts
          (id, reservation_id, client_id, amount, status, payment_id, created_at, paid_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(d.id || ""),
          d.reservationId ? String(d.reservationId) : null,
          d.clientId ? String(d.clientId) : null,
          toNum(d.amount),
          d.status === "paid" ? "paid" : "open",
          d.paymentId ? String(d.paymentId) : null,
          toDateTime(d.createdAt),
          toDateTime(d.paidAt),
        ]
      );
    }

    await conn.commit();
    console.log("Migracao concluida com sucesso.");
    console.log(
      JSON.stringify(
        {
          users: (data.users || []).length,
          services: (data.services || []).length,
          staff: (data.staff || []).length,
          reservations: (data.reservations || []).length,
          payments: (data.payments || []).length,
          debts: (data.debts || []).length,
          mysqlDatabase: DB_NAME,
        },
        null,
        2
      )
    );
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error("Falha na migracao para MySQL.");
  console.error(err.message || err);
  process.exit(1);
});

