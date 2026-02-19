const { chromium } = require("playwright");

async function run() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage();
  const email = `cliente.cart.${Date.now()}@teste.com`;
  const password = "123456";

  await page.goto("http://localhost:3000/register");
  await page.getByLabel("Nome completo").fill("Cliente Carrinho");
  await page.getByLabel("Telefone").fill("840000001");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();

  await page.waitForURL("**/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(password);
  await Promise.all([
    page.waitForURL("**/cliente/dashboard", { waitUntil: "domcontentloaded" }),
    page.getByRole("button", { name: "Entrar" }).click(),
  ]);

  const addButtons = page.getByRole("button", { name: "Adicionar ao carrinho" });
  await Promise.all([
    page.waitForURL("**/cliente/dashboard", { waitUntil: "domcontentloaded" }),
    addButtons.nth(0).click(),
  ]);
  await Promise.all([
    page.waitForURL("**/cliente/dashboard", { waitUntil: "domcontentloaded" }),
    addButtons.nth(1).click(),
  ]);

  await Promise.all([
    page.waitForURL("**/cliente/carrinho", { waitUntil: "domcontentloaded" }),
    page.getByRole("link", { name: /Carrinho/ }).first().click(),
  ]);
  await Promise.all([
    page.waitForURL("**/cliente/reservas/nova", { waitUntil: "domcontentloaded" }),
    page.getByRole("link", { name: "Seguir para pagamento" }).click(),
  ]);

  await page.locator("select[name='staffId']").selectOption({ index: 1 });
  const bookingDate = new Date();
  bookingDate.setDate(bookingDate.getDate() + 30);
  const dateStr = bookingDate.toISOString().slice(0, 10);
  await page.locator("input[name='date']").fill(dateStr);
  await page.locator("select[name='time']").selectOption("09:00");
  await page.locator("select[name='paymentMethod']").selectOption("M-Pesa");
  await Promise.all([
    page.waitForURL("**/cliente/dashboard", { waitUntil: "domcontentloaded" }),
    page.getByRole("button", { name: "Confirmar reserva e pagar" }).click(),
  ]);
  const content = await page.content();
  if (!content.includes("x1")) {
    throw new Error("Reserva com multiplos servicos nao apareceu no dashboard.");
  }

  await browser.close();
  console.log("OK: carrinho + checkout multi-servicos funcionando.");
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
