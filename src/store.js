const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");

const dataDir = path.join(__dirname, "..", "data");
const dbFile = path.join(dataDir, "db.json");

const defaultServices = [
  { name: "Corte Feminino", price: 900, duration: 60 },
  { name: "Corte Masculino", price: 600, duration: 45 },
  { name: "Manicure + Pedicure", price: 1200, duration: 75 },
  { name: "Limpeza de Pele", price: 1800, duration: 90 },
  { name: "Escova Simples", price: 700, duration: 40 },
  { name: "Escova Modelada", price: 950, duration: 55 },
  { name: "Hidratacao Capilar", price: 1300, duration: 70 },
  { name: "Cauterizacao", price: 1600, duration: 85 },
  { name: "Coloracao Completa", price: 2500, duration: 120 },
  { name: "Retoque de Raiz", price: 1700, duration: 90 },
  { name: "Progressiva", price: 3200, duration: 180 },
  { name: "Botox Capilar", price: 2800, duration: 150 },
  { name: "Trancas Basicas", price: 2000, duration: 120 },
  { name: "Trancas Nagô", price: 2600, duration: 160 },
  { name: "Dread Retwist", price: 2200, duration: 130 },
  { name: "Barba Completa", price: 500, duration: 30 },
  { name: "Sobrancelha", price: 300, duration: 20 },
  { name: "Design de Sobrancelha + Henna", price: 650, duration: 35 },
  { name: "Pedicure Simples", price: 650, duration: 45 },
  { name: "Manicure Simples", price: 550, duration: 35 },
  { name: "Spa dos Pes", price: 1400, duration: 80 },
  { name: "Depilacao Facial", price: 800, duration: 40 },
  { name: "Depilacao Completa", price: 2300, duration: 110 },
  { name: "Maquiagem Social", price: 1900, duration: 95 },
];

const ensureDb = () => {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbFile)) {
    const initial = {
      users: [],
      services: [],
      staff: [],
      reservations: [],
      payments: [],
      debts: [],
    };
    fs.writeFileSync(dbFile, JSON.stringify(initial, null, 2), "utf-8");
  }
};

const readDb = () => {
  ensureDb();
  const raw = fs.readFileSync(dbFile, "utf-8");
  return JSON.parse(raw);
};

const writeDb = (db) => {
  ensureDb();
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), "utf-8");
};

const seedDb = () => {
  const db = readDb();
  let changed = false;

  if (!Array.isArray(db.debts)) {
    db.debts = [];
    changed = true;
  }

  const hasAdmin = db.users.some((u) => u.role === "admin");
  if (!hasAdmin) {
    db.users.push({
      id: uuidv4(),
      role: "admin",
      name: "Administrador",
      email: "admin@eleela.com",
      phone: "840000000",
      passwordHash: bcrypt.hashSync("admin123", 10),
      createdAt: new Date().toISOString(),
    });
    changed = true;
  }

  const existingNames = new Set(db.services.map((s) => String(s.name).toLowerCase()));
  for (const service of defaultServices) {
    if (existingNames.has(service.name.toLowerCase())) continue;
    db.services.push({
      id: uuidv4(),
      name: service.name,
      price: service.price,
      duration: service.duration,
    });
    changed = true;
  }

  if (db.staff.length === 0) {
    db.staff.push(
      { id: uuidv4(), name: "Carla M.", specialty: "Cabelos" },
      { id: uuidv4(), name: "Bruno P.", specialty: "Barbearia" },
      { id: uuidv4(), name: "Lina S.", specialty: "Estetica" }
    );
    changed = true;
  }

  for (const user of db.users) {
    if (user.role === "client" && !["prepaid", "postpaid"].includes(user.clientType)) {
      user.clientType = "prepaid";
      changed = true;
    }
  }

  if (changed) writeDb(db);
};

const getReservationTotals = (db) => {
  return db.reservations.reduce(
    (acc, cur) => {
      acc.total += 1;
      acc[cur.status] = (acc[cur.status] || 0) + 1;
      return acc;
    },
    { total: 0, pending: 0, confirmed: 0, cancelled: 0, completed: 0 }
  );
};

const getRevenueTotals = (db) => {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  let total = 0;
  let monthly = 0;
  for (const payment of db.payments) {
    if (payment.status !== "paid") continue;
    total += Number(payment.amount);
    const paidAt = new Date(payment.paidAt);
    if (paidAt.getMonth() === month && paidAt.getFullYear() === year) {
      monthly += Number(payment.amount);
    }
  }
  return { total, monthly };
};

module.exports = {
  readDb,
  writeDb,
  seedDb,
  getReservationTotals,
  getRevenueTotals,
};
