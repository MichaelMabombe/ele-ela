const fs = require("fs");
const path = require("path");
const { chromium, devices } = require("playwright");

async function run() {
  const baseUrl = "http://localhost:3000";
  const artifactDir = path.join(process.cwd(), "artifacts");
  if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });

  const email = `cliente.mobile.${Date.now()}@teste.com`;
  const password = "123456";

  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
  });

  const context = await browser.newContext({
    ...devices["iPhone 12"],
  });
  const page = await context.newPage();

  await page.goto(`${baseUrl}/register`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Nome completo").fill("Cliente Mobile");
  await page.getByLabel("Telefone").fill("840000000");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();

  await page.waitForURL(`${baseUrl}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();

  await page.waitForURL(`${baseUrl}/cliente/dashboard`);
  await page.screenshot({
    path: path.join(artifactDir, "cliente-dashboard-mobile.png"),
    fullPage: true,
  });

  await browser.close();

  console.log("Teste mobile concluido.");
  console.log(`Email teste: ${email}`);
  console.log("Screenshot: artifacts/cliente-dashboard-mobile.png");
}

run().catch((err) => {
  console.error("Falha no teste mobile:", err.message);
  process.exit(1);
});
