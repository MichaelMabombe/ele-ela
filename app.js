const express = require("express");
const fs = require("fs");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const PDFDocument = require("pdfkit");
const { v4: uuidv4 } = require("uuid");
const {
  readDb,
  writeDb,
  seedDb,
  getReservationTotals,
  getRevenueTotals,
} = require("./src/store");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: "ele-ela-super-secret",
    resave: false,
    saveUninitialized: false,
  })
);

seedDb();

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.currentPath = req.path;
  res.locals.flash = req.session.flash || null;
  const cart = Array.isArray(req.session.cart) ? req.session.cart : [];
  res.locals.cartCount = cart.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  delete req.session.flash;
  next();
});

const requireAuth = (req, res, next) => {
  if (!req.session.user) return res.redirect("/login");
  next();
};

const requireRole = (role) => (req, res, next) => {
  if (!req.session.user) return res.redirect("/login");
  if (req.session.user.role !== role) {
    req.session.flash = { type: "error", message: "Acesso negado." };
    return res.redirect("/");
  }
  next();
};

const setFlash = (req, type, message) => {
  req.session.flash = { type, message };
};

const redirectBack = (req, res, fallback) => {
  const target = req.get("referer");
  if (target) return res.redirect(target);
  return res.redirect(fallback);
};

const getSessionCart = (req) => {
  if (!Array.isArray(req.session.cart)) req.session.cart = [];
  req.session.cart = req.session.cart
    .filter((item) => item && item.serviceId && Number(item.qty) > 0)
    .map((item) => ({ serviceId: String(item.serviceId), qty: Number(item.qty) }));
  return req.session.cart;
};

const getServiceImage = (serviceName, index) => {
  const name = (serviceName || "").toLowerCase();
  if (name.includes("limpeza") || name.includes("pele") || name.includes("estetic")) {
    return "/images/services/limpezafacial.jpg";
  }
  if (name.includes("hidrat") || name.includes("spa") || name.includes("massagem")) {
    return "/images/services/massagem.jpg";
  }
  if (name.includes("femin")) return "/images/services/corte-feminino.jpg";
  if (name.includes("mascul") || name.includes("barba")) return "/images/services/corte-masculino.jpg";
  if (name.includes("manicure") || name.includes("pedicure")) return "/images/services/manicure.jpg";
  const defaults = [
    "/images/services/banner-servico.jpg",
    "/images/services/massagem.jpg",
    "/images/services/default-1.jpg",
    "/images/services/default-2.jpg",
  ];
  return defaults[index % defaults.length];
};

const getHomeHighlightImages = () => {
  const highlightsDir = path.join(__dirname, "public", "images", "destaques");
  try {
    return fs
      .readdirSync(highlightsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(jpg|jpeg|png|webp)$/i.test(entry.name))
      .map((entry) => `/images/destaques/${encodeURIComponent(entry.name)}`);
  } catch {
    return [];
  }
};

const getServiceDescription = (serviceName) => {
  const name = String(serviceName || "").toLowerCase();
  if (name.includes("corte femin")) {
    return "Corte personalizado com finalizacao para realcar o formato do rosto e o estilo desejado.";
  }
  if (name.includes("corte mascul") || name.includes("barba")) {
    return "Corte e acabamento com tecnica profissional para um visual limpo, moderno e de facil manutencao.";
  }
  if (name.includes("manicure") || name.includes("pedicure") || name.includes("sobrancelha")) {
    return "Cuidado estetico completo com higienizacao, modelagem e acabamento detalhado.";
  }
  if (name.includes("limpeza") || name.includes("pele") || name.includes("facial")) {
    return "Tratamento facial com foco em renovacao da pele, limpeza profunda e hidratacao equilibrada.";
  }
  if (name.includes("escova") || name.includes("hidrat") || name.includes("botox") || name.includes("progressiva")) {
    return "Tratamento capilar com produtos de qualidade para brilho, alinhamento e recuperacao dos fios.";
  }
  if (name.includes("tranca") || name.includes("dread")) {
    return "Servico especializado em trancas e finalizacoes, com acabamento tecnico e visual duradouro.";
  }
  if (name.includes("color")) {
    return "Coloracao profissional com avaliacao previa para preservar a saude do cabelo e o tom ideal.";
  }
  return "Servico realizado por profissionais do Ela&Ele com atendimento atencioso e foco na sua experiencia.";
};

const getServiceGallery = (serviceName, index, primaryImage, highlightImages) => {
  const name = String(serviceName || "").toLowerCase();
  const themed = [];
  if (name.includes("limpeza") || name.includes("pele") || name.includes("facial")) {
    themed.push("/images/services/limpezafacial.jpg", "/images/services/pele.jpg");
  }
  if (name.includes("manicure") || name.includes("pedicure") || name.includes("sobrancelha")) {
    themed.push("/images/services/manicure.jpg");
  }
  if (name.includes("femin") || name.includes("escova") || name.includes("hidrat") || name.includes("botox")) {
    themed.push("/images/services/corte-feminino.jpg");
  }
  if (name.includes("mascul") || name.includes("barba")) {
    themed.push("/images/services/corte-masculino.jpg");
  }
  themed.push("/images/services/banner-servico.jpg", "/images/services/default-1.jpg", "/images/services/default-2.jpg");

  const highlights = [];
  if (Array.isArray(highlightImages) && highlightImages.length > 0) {
    for (let i = 0; i < 3; i += 1) {
      highlights.push(highlightImages[(index + i) % highlightImages.length]);
    }
  }

  return [primaryImage, ...themed, ...highlights].filter((img, idx, arr) => img && arr.indexOf(img) === idx).slice(0, 6);
};

const buildCartSummary = (db, cart) => {
  const lines = [];
  for (const item of cart) {
    const service = db.services.find((s) => s.id === item.serviceId);
    if (!service) continue;
    lines.push({
      serviceId: service.id,
      name: service.name,
      qty: item.qty,
      unitPrice: service.price,
      unitDuration: service.duration,
      subtotal: Number(service.price) * item.qty,
      durationTotal: Number(service.duration) * item.qty,
      image: getServiceImage(service.name, lines.length),
    });
  }
  const totalAmount = lines.reduce((sum, line) => sum + line.subtotal, 0);
  const totalDuration = lines.reduce((sum, line) => sum + line.durationTotal, 0);
  const totalItems = lines.reduce((sum, line) => sum + line.qty, 0);
  return { lines, totalAmount, totalDuration, totalItems };
};

const getReservationDuration = (reservation, db) => {
  if (reservation.totalDuration) return Number(reservation.totalDuration);
  if (Array.isArray(reservation.cartItems) && reservation.cartItems.length > 0) {
    return reservation.cartItems.reduce((sum, item) => {
      const service = db.services.find((s) => s.id === item.serviceId);
      return sum + (service ? Number(service.duration) * Number(item.qty || 1) : 0);
    }, 0);
  }
  const legacyService = db.services.find((s) => s.id === reservation.serviceId);
  return legacyService ? Number(legacyService.duration) : 60;
};

const toMinutes = (time) => {
  const [h, m] = String(time).split(":").map((v) => Number(v));
  return h * 60 + m;
};

const getClientType = (user) => (user && user.clientType === "postpaid" ? "postpaid" : "prepaid");

const filterClients = (users, searchQuery) => {
  const normalizedQuery = String(searchQuery || "").trim().toLowerCase();
  const clients = users.filter((u) => u.role === "client");
  if (!normalizedQuery) return clients;

  return clients.filter((client) =>
    [client.name, client.email, client.phone]
      .map((value) => String(value || "").toLowerCase())
      .some((value) => value.includes(normalizedQuery))
  );
};

app.get("/", (req, res) => {
  const db = readDb();
  const highlightImages = getHomeHighlightImages();
  const services = db.services.slice(0, 6).map((service, index) => ({
    ...service,
    image:
      highlightImages.length > 0
        ? highlightImages[index % highlightImages.length]
        : getServiceImage(service.name, index),
  }));
  res.render("index", { services });
});

app.get("/register", (req, res) => {
  if (req.session.user) return res.redirect("/redirect");
  res.render("auth/register");
});

app.post("/register", async (req, res) => {
  const { name, email, password, phone } = req.body;
  const db = readDb();
  const exists = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (exists) {
    setFlash(req, "error", "Email ja registrado.");
    return res.redirect("/register");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  db.users.push({
    id: uuidv4(),
    role: "client",
    clientType: "prepaid",
    name,
    email,
    phone,
    passwordHash,
    createdAt: new Date().toISOString(),
  });
  writeDb(db);
  setFlash(req, "success", "Conta criada com sucesso. Entre no sistema.");
  res.redirect("/login?mode=signin");
});

app.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/redirect");
  const mode = req.query.mode === "signin" ? "signin" : "choice";
  res.render("auth/login", { mode });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const db = readDb();
  const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    setFlash(req, "error", "Credenciais invalidas.");
    return res.redirect("/login?mode=signin");
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    setFlash(req, "error", "Credenciais invalidas.");
    return res.redirect("/login?mode=signin");
  }

  req.session.user = {
    id: user.id,
    role: user.role,
    clientType: getClientType(user),
    name: user.name,
    email: user.email,
  };
  res.redirect("/redirect");
});

app.get("/redirect", requireAuth, (req, res) => {
  if (req.session.user.role === "admin") return res.redirect("/admin/dashboard");
  return res.redirect("/cliente/dashboard");
});

app.post("/logout", requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

app.get("/cliente/dashboard", requireRole("client"), (req, res) => {
  const db = readDb();
  const cart = getSessionCart(req);
  const cartSummary = buildCartSummary(db, cart);
  const highlightImages = getHomeHighlightImages();
  const servicesCatalog = db.services.map((service, index) => ({
    ...service,
    image: getServiceImage(service.name, index),
    description: getServiceDescription(service.name),
    gallery: getServiceGallery(service.name, index, getServiceImage(service.name, index), highlightImages),
  }));
  const reservations = db.reservations
    .filter((r) => r.clientId === req.session.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.render("client/dashboard", {
    servicesCatalog,
    cartSummary,
    reservationsCount: reservations.length,
  });
});

app.get("/cliente/reservas", requireRole("client"), (req, res) => {
  const db = readDb();
  const reservations = db.reservations
    .filter((r) => r.clientId === req.session.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.render("client/reservations", {
    reservations,
    servicesById: Object.fromEntries(db.services.map((s) => [s.id, s])),
    prosById: Object.fromEntries(db.staff.map((p) => [p.id, p])),
  });
});

app.get("/cliente/carrinho", requireRole("client"), (req, res) => {
  const db = readDb();
  const cart = getSessionCart(req);
  const cartSummary = buildCartSummary(db, cart);
  res.render("client/cart", { cartSummary });
});

app.post("/cliente/carrinho/add", requireRole("client"), (req, res) => {
  const { serviceId } = req.body;
  const db = readDb();
  const service = db.services.find((s) => s.id === serviceId);
  if (!service) {
    setFlash(req, "error", "Servico invalido.");
    return res.redirect("/cliente/dashboard");
  }

  const cart = getSessionCart(req);
  const existing = cart.find((item) => item.serviceId === serviceId);
  if (existing) existing.qty += 1;
  else cart.push({ serviceId, qty: 1 });

  setFlash(req, "success", "Servico adicionado ao carrinho.");
  res.redirect("/cliente/dashboard");
});

app.post("/cliente/carrinho/remove", requireRole("client"), (req, res) => {
  const { serviceId } = req.body;
  const cart = getSessionCart(req);
  const item = cart.find((line) => line.serviceId === serviceId);
  if (!item) return redirectBack(req, res, "/cliente/carrinho");
  item.qty -= 1;
  req.session.cart = cart.filter((line) => line.qty > 0);
  setFlash(req, "success", "Carrinho atualizado.");
  redirectBack(req, res, "/cliente/carrinho");
});

app.post("/cliente/carrinho/limpar", requireRole("client"), (req, res) => {
  req.session.cart = [];
  setFlash(req, "success", "Carrinho limpo.");
  redirectBack(req, res, "/cliente/carrinho");
});

app.get("/cliente/reservas/nova", requireRole("client"), (req, res) => {
  const db = readDb();
  const client = db.users.find((u) => u.id === req.session.user.id && u.role === "client");
  const clientType = getClientType(client);
  const cart = getSessionCart(req);
  if (req.query.serviceId) {
    const selected = db.services.find((s) => s.id === req.query.serviceId);
    if (selected) {
      const existing = cart.find((item) => item.serviceId === selected.id);
      if (existing) existing.qty += 1;
      else cart.push({ serviceId: selected.id, qty: 1 });
    }
  }
  const cartSummary = buildCartSummary(db, cart);
  if (cartSummary.lines.length === 0) {
    setFlash(req, "error", "Adicione servicos ao carrinho antes de reservar.");
    return res.redirect("/cliente/dashboard");
  }

  res.render("client/new-booking", {
    staff: db.staff,
    today: new Date().toISOString().split("T")[0],
    cartSummary,
    clientType,
  });
});

app.post("/cliente/reservas", requireRole("client"), (req, res) => {
  const { staffId, date, time, paymentMethod } = req.body;
  const db = readDb();
  const client = db.users.find((u) => u.id === req.session.user.id && u.role === "client");
  const clientType = getClientType(client);
  const cart = getSessionCart(req);
  const cartSummary = buildCartSummary(db, cart);
  const normalizedPaymentMethod = String(paymentMethod || "").trim();

  const pro = db.staff.find((p) => p.id === staffId);
  if (cartSummary.lines.length === 0 || !pro) {
    setFlash(req, "error", "Carrinho vazio ou profissional invalido.");
    return res.redirect("/cliente/reservas/nova");
  }
  if (!client) {
    setFlash(req, "error", "Cliente nao encontrado.");
    return res.redirect("/login");
  }
  if (clientType === "prepaid" && !normalizedPaymentMethod) {
    setFlash(req, "error", "Cliente pre-pago precisa escolher o metodo de pagamento.");
    return res.redirect("/cliente/reservas/nova");
  }

  const newStart = toMinutes(time);
  const newEnd = newStart + cartSummary.totalDuration;
  const conflict = db.reservations.find(
    (r) => {
      if (r.staffId !== staffId || r.date !== date || r.status === "cancelled") return false;
      const existingStart = toMinutes(r.time);
      const existingEnd = existingStart + getReservationDuration(r, db);
      return newStart < existingEnd && existingStart < newEnd;
    }
  );
  if (conflict) {
    setFlash(req, "error", "Horario indisponivel para a duracao total dos servicos.");
    return res.redirect("/cliente/reservas/nova");
  }

  const reservationId = uuidv4();
  let payment = null;
  let paymentId = null;
  const paidNow = Boolean(normalizedPaymentMethod);
  if (paidNow) {
    payment = {
      id: uuidv4(),
      reservationId,
      amount: cartSummary.totalAmount,
      method: normalizedPaymentMethod,
      status: "paid",
      transactionRef: `TX-${Math.floor(Math.random() * 900000 + 100000)}`,
      paidAt: new Date().toISOString(),
    };
    paymentId = payment.id;
  }

  const reservation = {
    id: reservationId,
    clientId: req.session.user.id,
    clientTypeAtBooking: clientType,
    serviceId: cartSummary.lines[0].serviceId,
    serviceIds: cartSummary.lines.map((line) => line.serviceId),
    cartItems: cartSummary.lines.map((line) => ({ serviceId: line.serviceId, qty: line.qty })),
    totalAmount: cartSummary.totalAmount,
    totalDuration: cartSummary.totalDuration,
    staffId,
    date,
    time,
    status: "pending",
    paymentId,
    paymentStatus: paidNow ? "paid" : "unpaid",
    createdAt: new Date().toISOString(),
  };

  if (payment) db.payments.push(payment);
  if (!paidNow && clientType === "postpaid") {
    db.debts.push({
      id: uuidv4(),
      clientId: req.session.user.id,
      reservationId,
      amount: cartSummary.totalAmount,
      status: "open",
      createdAt: new Date().toISOString(),
    });
  }
  db.reservations.push(reservation);
  writeDb(db);
  req.session.cart = [];

  if (!paidNow && clientType === "postpaid") {
    setFlash(req, "success", "Reserva criada para cliente pos-pago. Divida registrada no sistema.");
  } else {
    setFlash(req, "success", "Reserva criada com multiplos servicos e pagamento confirmado.");
  }
  res.redirect("/cliente/dashboard");
});

app.post("/cliente/reservas/:id/cancelar", requireRole("client"), (req, res) => {
  const db = readDb();
  const reservation = db.reservations.find(
    (r) => r.id === req.params.id && r.clientId === req.session.user.id
  );
  if (!reservation) {
    setFlash(req, "error", "Reserva nao encontrada.");
    return res.redirect("/cliente/dashboard");
  }

  reservation.status = "cancelled";
  reservation.cancelledAt = new Date().toISOString();
  writeDb(db);
  setFlash(req, "success", "Reserva cancelada.");
  res.redirect("/cliente/dashboard");
});

app.get("/admin/dashboard", requireRole("admin"), (req, res) => {
  const db = readDb();
  const totals = getReservationTotals(db);
  const revenue = getRevenueTotals(db);
  const today = new Date().toISOString().split("T")[0];
  const todayReservations = db.reservations.filter((r) => r.date === today).length;
  const recentReservationsBase = db.reservations
    .slice()
    .sort((a, b) => {
      const ad = `${a.date}T${a.time}`;
      const bd = `${b.date}T${b.time}`;
      return new Date(bd) - new Date(ad);
    })
    .slice(0, 8);
  const selectedStatus =
    typeof req.query.status === "string" && req.query.status.trim() ? req.query.status : "all";
  const recentReservations =
    selectedStatus === "all"
      ? recentReservationsBase
      : recentReservationsBase.filter((r) => r.status === selectedStatus);
  const todayRevenue = db.payments
    .filter((p) => p.status === "paid" && String(p.paidAt || "").startsWith(today))
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const acceptedCount = totals.confirmed + totals.completed;
  const acceptanceRate = totals.total ? Math.round((acceptedCount / totals.total) * 100) : 0;
  const completionRate = totals.total ? Math.round((totals.completed / totals.total) * 100) : 0;

  res.render("admin/dashboard", {
    totals,
    revenue,
    todayReservations,
    totalClients: db.users.filter((u) => u.role === "client").length,
    totalServices: db.services.length,
    recentReservations,
    usersById: Object.fromEntries(db.users.map((u) => [u.id, u])),
    prosById: Object.fromEntries(db.staff.map((p) => [p.id, p])),
    servicesById: Object.fromEntries(db.services.map((s) => [s.id, s])),
    selectedStatus,
    todayRevenue,
    acceptanceRate,
    completionRate,
  });
});

app.get("/admin/servicos", requireRole("admin"), (req, res) => {
  const db = readDb();
  res.render("admin/services", { services: db.services });
});

app.post("/admin/servicos", requireRole("admin"), (req, res) => {
  const { name, price, duration } = req.body;
  const db = readDb();
  if (!String(name || "").trim() || Number(price) < 0 || Number(duration) <= 0) {
    setFlash(req, "error", "Dados invalidos para criar servico.");
    return res.redirect("/admin/servicos");
  }
  db.services.push({
    id: uuidv4(),
    name: String(name).trim(),
    price: Number(price),
    duration: Number(duration),
  });
  writeDb(db);
  setFlash(req, "success", "Servico criado.");
  res.redirect("/admin/servicos");
});

app.post("/admin/servicos/:id/update", requireRole("admin"), (req, res) => {
  const { name, price, duration } = req.body;
  const db = readDb();
  const service = db.services.find((s) => s.id === req.params.id);
  if (!service) {
    setFlash(req, "error", "Servico nao encontrado.");
    return res.redirect("/admin/servicos");
  }
  if (!String(name || "").trim() || Number(price) < 0 || Number(duration) <= 0) {
    setFlash(req, "error", "Dados invalidos para atualizar servico.");
    return res.redirect("/admin/servicos");
  }

  service.name = String(name).trim();
  service.price = Number(price);
  service.duration = Number(duration);
  writeDb(db);
  setFlash(req, "success", "Servico atualizado.");
  res.redirect("/admin/servicos");
});

app.post("/admin/servicos/:id/delete", requireRole("admin"), (req, res) => {
  const db = readDb();
  db.services = db.services.filter((s) => s.id !== req.params.id);
  writeDb(db);
  setFlash(req, "success", "Servico removido.");
  res.redirect("/admin/servicos");
});

app.get("/admin/profissionais", requireRole("admin"), (req, res) => {
  const db = readDb();
  res.render("admin/staff", { staff: db.staff });
});

app.post("/admin/profissionais", requireRole("admin"), (req, res) => {
  const { name, specialty } = req.body;
  const db = readDb();
  db.staff.push({
    id: uuidv4(),
    name,
    specialty,
  });
  writeDb(db);
  setFlash(req, "success", "Profissional adicionado.");
  res.redirect("/admin/profissionais");
});

app.get("/admin/agenda", requireRole("admin"), (req, res) => {
  const db = readDb();
  const mode = req.query.mode === "calendar" ? "calendar" : "list";
  const monthParamRaw = String(req.query.month || "").trim();
  const monthParamValid = /^\d{4}-\d{2}$/.test(monthParamRaw);
  const today = new Date();
  const monthRef = monthParamValid
    ? new Date(`${monthParamRaw}-01T00:00:00`)
    : new Date(today.getFullYear(), today.getMonth(), 1);
  const monthYear = Number.isNaN(monthRef.getTime())
    ? new Date(today.getFullYear(), today.getMonth(), 1)
    : monthRef;
  const monthStart = new Date(monthYear.getFullYear(), monthYear.getMonth(), 1);
  const monthEnd = new Date(monthYear.getFullYear(), monthYear.getMonth() + 1, 0);
  const formatMonthParam = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  const monthNames = [
    "Janeiro",
    "Fevereiro",
    "Marco",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
  const weekdayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

  const reservations = db.reservations
    .slice()
    .sort((a, b) => {
      const ad = `${a.date}T${a.time}`;
      const bd = `${b.date}T${b.time}`;
      return new Date(bd) - new Date(ad);
    });
  const reservationsByDate = new Map();
  for (const reservation of reservations) {
    const key = String(reservation.date || "");
    if (!reservationsByDate.has(key)) reservationsByDate.set(key, []);
    reservationsByDate.get(key).push(reservation);
  }
  for (const list of reservationsByDate.values()) {
    list.sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
  }

  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const calendarDays = [];
  for (let i = 0; i < 42; i += 1) {
    const current = new Date(gridStart);
    current.setDate(gridStart.getDate() + i);
    const key = current.toISOString().slice(0, 10);
    calendarDays.push({
      key,
      day: current.getDate(),
      inCurrentMonth: current.getMonth() === monthStart.getMonth(),
      reservations: reservationsByDate.get(key) || [],
    });
  }
  const previousMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1);
  const nextMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);

  res.render("admin/schedule", {
    mode,
    reservations,
    calendarDays,
    weekdayNames,
    monthLabel: `${monthNames[monthStart.getMonth()]} ${monthStart.getFullYear()}`,
    monthParam: formatMonthParam(monthStart),
    prevMonthParam: formatMonthParam(previousMonth),
    nextMonthParam: formatMonthParam(nextMonth),
    monthRange: {
      start: monthStart.toISOString().slice(0, 10),
      end: monthEnd.toISOString().slice(0, 10),
    },
    servicesById: Object.fromEntries(db.services.map((s) => [s.id, s])),
    prosById: Object.fromEntries(db.staff.map((p) => [p.id, p])),
    usersById: Object.fromEntries(db.users.map((u) => [u.id, u])),
  });
});

app.post("/admin/reservas/:id/status", requireRole("admin"), (req, res) => {
  const { status } = req.body;
  const allowed = ["pending", "confirmed", "cancelled", "completed"];
  if (!allowed.includes(status)) {
    setFlash(req, "error", "Status invalido.");
    return res.redirect("/admin/agenda");
  }

  const db = readDb();
  const reservation = db.reservations.find((r) => r.id === req.params.id);
  if (!reservation) {
    setFlash(req, "error", "Reserva nao encontrada.");
    return res.redirect("/admin/agenda");
  }

  reservation.status = status;
  writeDb(db);
  setFlash(req, "success", "Status atualizado.");
  redirectBack(req, res, "/admin/agenda");
});

app.post("/admin/reservas/:id/reagendar", requireRole("admin"), (req, res) => {
  const { date, time } = req.body;
  const db = readDb();
  const reservation = db.reservations.find((r) => r.id === req.params.id);
  if (!reservation) {
    setFlash(req, "error", "Reserva nao encontrada.");
    return res.redirect("/admin/agenda");
  }

  const conflict = db.reservations.find(
    (r) =>
      r.id !== reservation.id &&
      r.staffId === reservation.staffId &&
      r.date === date &&
      r.time === time &&
      r.status !== "cancelled"
  );
  if (conflict) {
    setFlash(req, "error", "Conflito de horario para esse profissional.");
    return res.redirect("/admin/agenda");
  }

  reservation.date = date;
  reservation.time = time;
  reservation.status = "confirmed";
  reservation.rescheduledAt = new Date().toISOString();
  writeDb(db);
  setFlash(req, "success", "Reserva reagendada.");
  redirectBack(req, res, "/admin/agenda");
});

app.get("/admin/clientes", requireRole("admin"), (req, res) => {
  const db = readDb();
  const searchQuery = String(req.query.q || "").trim();
  const clients = filterClients(db.users, searchQuery)
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const debts = (Array.isArray(db.debts) ? db.debts : [])
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  res.render("admin/clients", {
    clients,
    debts,
    searchQuery,
    usersById: Object.fromEntries(db.users.map((u) => [u.id, u])),
  });
});

app.get("/admin/clientes/pdf", requireRole("admin"), (req, res) => {
  const db = readDb();
  const searchQuery = String(req.query.q || "").trim();
  const clients = filterClients(db.users, searchQuery)
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  const headerBandHeight = 96;
  const tableTopY = 228;
  const colX = { name: margin + 8, email: 220, phone: 388, type: 468 };
  const rowHeight = 22;
  const logoPathCandidates = [
    path.join(__dirname, "elaeelelogo.png"),
    path.join(__dirname, "eleeelalogo.jpg"),
    path.join(__dirname, "public", "images", "logo.jpg"),
  ];
  const logoPath = logoPathCandidates.find((candidate) => fs.existsSync(candidate));
  const generatedAt = new Date().toISOString().slice(0, 16).replace("T", " ");
  const totalClients = clients.length;
  const prepaidCount = clients.filter((c) => c.clientType !== "postpaid").length;
  const postpaidCount = clients.filter((c) => c.clientType === "postpaid").length;
  const colors = {
    pageBg: "#fbf8ee",
    headerBg: "#011514",
    primary: "#0a2826",
    gold: "#b7792e",
    goldSoft: "#f2d97c",
    cardBg: "#fffdf6",
    border: "#d6bf8b",
    text: "#162120",
    textMuted: "#53605e",
    white: "#ffffff",
    rowAlt: "#f9f3df",
  };

  const safeDate = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=clientes-${safeDate}.pdf`);
  doc.pipe(res);

  const drawMainHeader = () => {
    doc.save();
    doc.rect(0, 0, pageWidth, pageHeight).fill(colors.pageBg);
    doc.restore();

    doc.save();
    doc.roundedRect(margin, margin, contentWidth, headerBandHeight, 16).fill(colors.headerBg);
    doc.lineWidth(4);
    doc
      .moveTo(margin + 14, margin + headerBandHeight - 8)
      .lineTo(margin + contentWidth - 14, margin + headerBandHeight - 8)
      .stroke(colors.gold);
    doc.restore();

    if (logoPath) {
      doc.image(logoPath, margin + 16, margin + 13, { fit: [68, 68], align: "left", valign: "center" });
    }

    doc.fillColor(colors.goldSoft).font("Helvetica-Bold").fontSize(20);
    doc.text("Relatorio de Clientes", margin + 98, margin + 20, { width: 300 });
    doc.font("Helvetica").fontSize(10).fillColor("#c8d2d1");
    doc.text(`Gerado em: ${generatedAt}`, margin + 98, margin + 50, { width: 280 });
    doc.text("Salao Ela&Ele", margin + 98, margin + 64, { width: 280 });

    if (searchQuery) {
      doc.font("Helvetica-Bold").fillColor(colors.white);
      doc.text(`Filtro: ${searchQuery}`, margin + 360, margin + 24, { width: 170, align: "right" });
    }
  };

  const drawSummaryCard = (x, y, width, label, value) => {
    doc.save();
    doc.roundedRect(x, y, width, 54, 10).fill(colors.cardBg);
    doc.restore();
    doc.save();
    doc.roundedRect(x, y, width, 54, 10).lineWidth(0.8).strokeColor(colors.border).stroke();
    doc.moveTo(x, y + 18).lineTo(x + width, y + 18).lineWidth(0.5).strokeColor(colors.goldSoft).stroke();
    doc.restore();

    doc.fillColor(colors.textMuted).font("Helvetica").fontSize(9).text(label, x + 12, y + 6, { width: width - 24 });
    doc.fillColor(colors.primary).font("Helvetica-Bold").fontSize(16).text(String(value), x + 12, y + 24, {
      width: width - 24,
    });
  };

  const drawTableHeader = () => {
    doc.save();
    doc.roundedRect(margin, tableTopY, contentWidth, 24, 6).fill(colors.primary);
    doc.restore();

    const y = tableTopY + 7;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(colors.goldSoft);
    doc.text("Nome", colX.name, y, { width: 170, lineBreak: false });
    doc.text("Email", colX.email, y, { width: 160, lineBreak: false });
    doc.text("Telefone", colX.phone, y, { width: 70, lineBreak: false });
    doc.text("Tipo", colX.type, y, { width: 90, lineBreak: false });
    doc.fillColor(colors.text).font("Helvetica");
  };

  const drawPageTemplate = () => {
    drawMainHeader();
    const cardWidth = (contentWidth - 20) / 3;
    const summaryY = margin + headerBandHeight + 14;
    drawSummaryCard(margin, summaryY, cardWidth, "Total de clientes", totalClients);
    drawSummaryCard(margin + cardWidth + 10, summaryY, cardWidth, "Clientes pre-pago", prepaidCount);
    drawSummaryCard(margin + (cardWidth + 10) * 2, summaryY, cardWidth, "Clientes pos-pago", postpaidCount);
    drawTableHeader();
    doc.y = tableTopY + 30;
  };

  const drawFooter = () => {
    const footerText = `Ela&Ele - Pagina ${doc.page.number}`;
    doc.font("Helvetica").fontSize(8).fillColor(colors.textMuted);
    doc.text(footerText, margin, pageHeight - 28, { width: contentWidth, align: "right", lineBreak: false });
  };

  drawPageTemplate();
  clients.forEach((client) => {
    if (doc.y + rowHeight > pageHeight - 46) {
      drawFooter();
      doc.addPage();
      drawPageTemplate();
    }

    const y = doc.y;
    const isEven = Math.floor((y - (tableTopY + 30)) / rowHeight) % 2 === 0;
    if (isEven) {
      doc.save();
      doc.rect(margin, y - 2, contentWidth, rowHeight).fill(colors.rowAlt);
      doc.restore();
    }

    doc.fontSize(9).fillColor(colors.text);
    doc.text(String(client.name || "-"), colX.name, y + 5, { width: 170, ellipsis: true, lineBreak: false });
    doc.text(String(client.email || "-"), colX.email, y + 5, { width: 160, ellipsis: true, lineBreak: false });
    doc.text(String(client.phone || "-"), colX.phone, y + 5, { width: 70, ellipsis: true, lineBreak: false });
    doc.text(client.clientType === "postpaid" ? "Pos-pago" : "Pre-pago", colX.type, y + 5, {
      width: 90,
      lineBreak: false,
    });
    doc.save();
    doc.moveTo(margin, y + rowHeight - 1)
      .lineTo(margin + contentWidth, y + rowHeight - 1)
      .lineWidth(0.3)
      .stroke(colors.border);
    doc.restore();
    doc.y = y + rowHeight;
  });

  drawFooter();
  doc.end();
});

app.post("/admin/clientes/:id/tipo", requireRole("admin"), (req, res) => {
  const { clientType } = req.body;
  if (!["prepaid", "postpaid"].includes(clientType)) {
    setFlash(req, "error", "Tipo de cliente invalido.");
    return res.redirect("/admin/clientes");
  }

  const db = readDb();
  const client = db.users.find((u) => u.id === req.params.id && u.role === "client");
  if (!client) {
    setFlash(req, "error", "Cliente nao encontrado.");
    return res.redirect("/admin/clientes");
  }

  client.clientType = clientType;
  writeDb(db);
  setFlash(req, "success", "Tipo de cliente atualizado.");
  res.redirect("/admin/clientes");
});

app.post("/admin/dividas/:id/pagar", requireRole("admin"), (req, res) => {
  const { paymentMethod } = req.body;
  const normalizedPaymentMethod = String(paymentMethod || "").trim();
  if (!normalizedPaymentMethod) {
    setFlash(req, "error", "Escolha um metodo de pagamento.");
    return res.redirect("/admin/clientes");
  }

  const db = readDb();
  const debt = (Array.isArray(db.debts) ? db.debts : []).find((d) => d.id === req.params.id);
  if (!debt || debt.status !== "open") {
    setFlash(req, "error", "Divida nao encontrada ou ja paga.");
    return res.redirect("/admin/clientes");
  }

  const payment = {
    id: uuidv4(),
    reservationId: debt.reservationId || null,
    amount: Number(debt.amount || 0),
    method: normalizedPaymentMethod,
    status: "paid",
    transactionRef: `TX-${Math.floor(Math.random() * 900000 + 100000)}`,
    paidAt: new Date().toISOString(),
  };
  db.payments.push(payment);

  const reservation = db.reservations.find((r) => r.id === debt.reservationId);
  if (reservation) {
    reservation.paymentId = payment.id;
    reservation.paymentStatus = "paid";
  }

  debt.status = "paid";
  debt.paymentId = payment.id;
  debt.paidAt = payment.paidAt;
  writeDb(db);
  setFlash(req, "success", "Divida marcada como paga.");
  res.redirect("/admin/clientes");
});

app.get("/admin/financeiro", requireRole("admin"), (req, res) => {
  const db = readDb();
  const payments = db.payments.slice().sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));
  const revenue = getRevenueTotals(db);
  const openDebts = (Array.isArray(db.debts) ? db.debts : []).filter((d) => d.status === "open");
  res.render("admin/finance", {
    payments,
    revenue,
    openDebtsCount: openDebts.length,
    openDebtsAmount: openDebts.reduce((sum, d) => sum + Number(d.amount || 0), 0),
  });
});

app.get("/admin/relatorios", requireRole("admin"), (req, res) => {
  const db = readDb();
  const period = ["all", "day", "week", "month", "year"].includes(req.query.period)
    ? req.query.period
    : "all";
  const now = new Date();

  const inPeriod = (dateValue) => {
    if (!dateValue) return period === "all";
    if (period === "all") return true;
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return false;
    if (period === "day") return date.toDateString() === now.toDateString();
    if (period === "week") {
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 6);
      weekAgo.setHours(0, 0, 0, 0);
      return date >= weekAgo;
    }
    if (period === "month") {
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }
    return date.getFullYear() === now.getFullYear();
  };

  const reservations = db.reservations.filter((r) => {
    const reservationDate = r.createdAt || (r.date && r.time ? `${r.date}T${r.time}` : r.date);
    return inPeriod(reservationDate);
  });

  const payments = db.payments.filter((p) => inPeriod(p.paidAt));

  const reservationsByStatus = reservations.reduce(
    (acc, cur) => {
      acc.total += 1;
      acc[cur.status] = (acc[cur.status] || 0) + 1;
      return acc;
    },
    { total: 0, pending: 0, confirmed: 0, cancelled: 0, completed: 0 }
  );

  const paidPayments = payments.filter((p) => p.status === "paid");
  const revenue = {
    total: paidPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0),
    monthly: paidPayments
      .filter((p) => {
        const date = new Date(p.paidAt);
        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      })
      .reduce((sum, p) => sum + Number(p.amount || 0), 0),
  };

  const methodsMap = new Map();
  for (const payment of paidPayments) {
    const method = payment.method || "Outro";
    methodsMap.set(method, (methodsMap.get(method) || 0) + Number(payment.amount || 0));
  }

  const dailyMap = new Map();
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dailyMap.set(key, 0);
  }
  for (const reservation of reservations) {
    const source = reservation.createdAt || (reservation.date ? `${reservation.date}T00:00:00` : null);
    if (!source) continue;
    const dayKey = new Date(source).toISOString().slice(0, 10);
    if (dailyMap.has(dayKey)) dailyMap.set(dayKey, dailyMap.get(dayKey) + 1);
  }

  res.render("admin/reports", {
    period,
    reservationsByStatus,
    revenue,
    reservations,
    charts: {
      status: [
        reservationsByStatus.pending,
        reservationsByStatus.confirmed,
        reservationsByStatus.completed,
        reservationsByStatus.cancelled,
      ],
      methods: {
        labels: Array.from(methodsMap.keys()),
        values: Array.from(methodsMap.values()),
      },
      daily: {
        labels: Array.from(dailyMap.keys()).map((d) => d.slice(5)),
        values: Array.from(dailyMap.values()),
      },
    },
  });
});

app.listen(PORT, () => {
  console.log(`Ela&Ele rodando em http://localhost:${PORT}`);
});
