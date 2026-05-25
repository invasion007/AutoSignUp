/**
 * Google 注册脚本 — 自动发现住宅代理 + 移动设备模拟
 *
 * 功能:
 *   1. 从 ProxyScrape 获取免费 SOCKS5 代理列表
 *   2. 通过 ip-api.com 筛选住宅 IP（排除数据中心）
 *   3. 用住宅代理 + Pixel 7 模拟注册 Google，获得 SMS 验证而非 QR 码
 *   4. 集成 hero-sms.com API 自动购号 + 接收验证码
 *
 * 用法:
 *   node scripts/google-register-with-proxy.mjs
 *   PROXY=socks5://ip:port node scripts/google-register-with-proxy.mjs   # 指定代理
 *   HEADLESS=true node scripts/google-register-with-proxy.mjs             # 无头模式
 *   SKIP_PROXY_DISCOVERY=true PROXY=socks5://... node scripts/...         # 跳过代理发现
 */

import { chromium, devices } from "playwright";
import { readFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import https from "https";
import http from "http";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const SCREENSHOT_DIR = resolve(PROJECT_ROOT, "screenshots");
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const HEADLESS = process.env.HEADLESS === "true";
const HERO_SMS_API_KEY = process.env.HERO_SMS_KEY || "86e4451c952e1cc851fA3323f557527A";

const DC_KEYWORDS = [
  "hosting", "cloud", "server", "data center", "datacenter", "vps",
  "digital ocean", "amazon", "aws", "google", "microsoft", "azure",
  "linode", "vultr", "hetzner", "ovh", "leaseweb", "servermания",
  "hostwinds", "hostgator", "choopa", "cogent", "m247",
];

function log(step, msg) {
  console.log(`[${new Date().toISOString()}] Step ${step}: ${msg}`);
}

function httpGet(url) {
  const mod = url.startsWith("https") ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.get(url, { timeout: 10000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

// ---------------------------------------------------------------------------
// Proxy Discovery
// ---------------------------------------------------------------------------

async function fetchProxyList() {
  log("proxy", "Fetching SOCKS5 proxy list from ProxyScrape...");
  const raw = await httpGet(
    "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000&country=US"
  );
  const proxies = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  log("proxy", `Got ${proxies.length} US SOCKS5 proxies`);
  return proxies;
}

async function checkProxyResidential(proxyAddr) {
  const [host, port] = proxyAddr.split(":");
  try {
    // Use curl via child_process to test socks5 proxy
    const { execSync } = await import("child_process");
    const result = execSync(
      `timeout 8 curl -s -x socks5://${proxyAddr} http://ip-api.com/json`,
      { encoding: "utf-8", timeout: 10000 }
    );
    const info = JSON.parse(result);
    const ispLower = ((info.isp || "") + " " + (info.org || "")).toLowerCase();
    const isDC = DC_KEYWORDS.some((kw) => ispLower.includes(kw));
    return { ...info, isDC, proxy: proxyAddr };
  } catch {
    return null;
  }
}

async function findResidentialProxy(proxies, maxCheck = 30) {
  log("proxy", `Checking up to ${maxCheck} proxies for residential IPs...`);

  // Prioritize IPs that look like residential (common US ISP ranges)
  const residential_patterns = /^(98|68|72|174|184|67|76|71|75|73|24|50|66|70|99|96|107|108)\./;
  const sorted = [
    ...proxies.filter((p) => residential_patterns.test(p)),
    ...proxies.filter((p) => !residential_patterns.test(p)),
  ].slice(0, maxCheck);

  for (const proxy of sorted) {
    process.stdout.write(`  Testing ${proxy} ... `);
    const info = await checkProxyResidential(proxy);
    if (!info) {
      console.log("TIMEOUT");
      continue;
    }
    if (info.isDC) {
      console.log(`DATACENTER (${info.isp})`);
      continue;
    }
    console.log(`RESIDENTIAL! ISP: ${info.isp} | ${info.city}, ${info.regionName}`);
    return { proxyAddr: proxy, info };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Hero-SMS API
// ---------------------------------------------------------------------------

async function heroSmsApi(action, params = {}) {
  const url = new URL("https://hero-sms.com/stubs/handler_api.php");
  url.searchParams.set("action", action);
  url.searchParams.set("api_key", HERO_SMS_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return httpGet(url.toString());
}

async function checkBalance() {
  const result = await heroSmsApi("getBalance");
  log("sms", `Hero-SMS balance: ${result}`);
  return result;
}

async function buyNumber(country = "12") {
  // country 12 = USA, 6 = Indonesia (cheaper)
  const result = await heroSmsApi("getNumber", { service: "go", country });
  log("sms", `Buy number result: ${result}`);
  if (result.startsWith("ACCESS_NUMBER:")) {
    const [, activationId, phone] = result.split(":");
    return { activationId, phone: "+" + phone };
  }
  return null;
}

async function pollForCode(activationId, maxAttempts = 40, interval = 5000) {
  log("sms", `Polling for SMS code (activation ${activationId})...`);
  for (let i = 0; i < maxAttempts; i++) {
    const result = await heroSmsApi("getStatus", { id: activationId });
    console.log(`  Poll ${i + 1}/${maxAttempts}: ${result}`);
    if (result.startsWith("STATUS_OK:")) return result.split(":")[1];
    if (result === "STATUS_CANCEL") return null;
    await new Promise((r) => setTimeout(r, interval));
  }
  return null;
}

async function cancelActivation(id) {
  return heroSmsApi("setStatus", { id, status: "8" });
}

// ---------------------------------------------------------------------------
// Registration Steps
// ---------------------------------------------------------------------------

async function stepName(page, config) {
  log(1, "Filling name...");
  await page.waitForSelector('input[name="firstName"]', { timeout: 30000 });
  await page.fill('input[name="firstName"]', config.firstName);
  if (config.lastName) await page.fill('input[name="lastName"]', config.lastName);
  await page.click('button:has-text("Next")');
  await page.waitForTimeout(3000);
  log(1, `Done (${config.firstName} ${config.lastName || ""})`);
}

async function stepBirthday(page, config) {
  log(2, "Filling birthday & gender...");
  await page.waitForTimeout(2000);

  // Month
  await page.click("#month");
  await page.waitForTimeout(500);
  await page.click(`li[role="option"]:has-text("${config.birthday.month}")`);
  await page.waitForTimeout(300);

  // Day + Year
  await page.fill("#day", config.birthday.day);
  await page.fill("#year", config.birthday.year);
  await page.waitForTimeout(300);

  // Gender
  await page.click("#gender");
  await page.waitForTimeout(500);
  const opt = page.locator('li[role="option"]:visible').filter({ hasText: config.gender });
  await opt.click();
  await page.waitForTimeout(500);

  await page.click('button:has-text("Next")');
  await page.waitForTimeout(5000);
  log(2, `Done. URL: ${page.url()}`);
}

async function stepUsername(page, config) {
  log(3, "Filling username...");
  if (!page.url().includes("username") && !page.url().includes("gmail")) {
    log(3, `Skipped (URL: ${page.url()})`);
    return;
  }

  const createOwn = page.locator('text=Create your own Gmail address');
  if (await createOwn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await createOwn.click();
    await page.waitForTimeout(1000);
  }

  const input = page.locator('input[name="Username"], input[type="text"]').first();
  await input.fill(config.username);
  await page.click('button:has-text("Next")');
  await page.waitForTimeout(3000);
  log(3, `Done (${config.username})`);
}

async function stepPassword(page, config) {
  log(4, "Filling password...");
  const visible = await page.locator('input[name="Passwd"]').isVisible({ timeout: 5000 }).catch(() => false);
  if (!page.url().includes("password") && !visible) {
    log(4, `Skipped (URL: ${page.url()})`);
    return;
  }

  await page.fill('input[name="Passwd"]', config.password);
  const confirm = page.locator('input[name="PasswdAgain"], input[name="ConfirmPasswd"]');
  if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) {
    await confirm.fill(config.password);
  }
  await page.click('button:has-text("Next")');
  await page.waitForTimeout(3000);
  log(4, "Done");
}

async function stepVerification(page) {
  await page.waitForTimeout(5000);
  const url = page.url();
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "step5_verification.png"), fullPage: true });
  log(5, `Verification URL: ${url}`);

  // SMS verification with phone number input (best case)
  if (url.includes("phoneverification") && !url.includes("devicephoneverification")) {
    log(5, "Got SMS verification (phone number input)!");

    const telInput = page.locator('input[type="tel"]');
    if (await telInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Buy a number
      const numInfo = await buyNumber("6"); // Indonesia — cheapest
      if (!numInfo) {
        log(5, "Failed to buy virtual number. Check hero-sms balance.");
        return "sms_no_number";
      }
      log(5, `Bought number: ${numInfo.phone} (activation: ${numInfo.activationId})`);

      await telInput.fill(numInfo.phone);
      await page.click('button:has-text("Next"), button:has-text("Send")');
      await page.waitForTimeout(5000);
      await page.screenshot({ path: resolve(SCREENSHOT_DIR, "step5_after_send.png"), fullPage: true });

      const code = await pollForCode(numInfo.activationId);
      if (code) {
        const codeInput = page.locator('input[name="code"], input[type="tel"], input[aria-label*="code" i]').first();
        await codeInput.fill(code);
        await page.click('button:has-text("Next"), button:has-text("Verify")');
        await page.waitForTimeout(5000);
        log(5, `Code submitted! URL: ${page.url()}`);
        return "sms_ok";
      } else {
        await cancelActivation(numInfo.activationId).catch(() => {});
        return "sms_no_code";
      }
    }
  }

  // Device phone verification (IP too suspicious)
  if (url.includes("devicephoneverification")) {
    log(5, "Device SMS verification — IP detected as suspicious. Need better residential IP.");
    return "device_verification";
  }

  // QR code
  if (url.includes("mophoneverification") || url.includes("crossflowverification")) {
    log(5, "QR code verification — cannot automate. Try mobile mode or better IP.");
    return "qr_code";
  }

  log(5, `Unknown verification state: ${url}`);
  const body = await page.innerText("body").catch(() => "");
  console.log("Page excerpt:", body.substring(0, 400));
  return "unknown";
}

async function stepPostVerification(page) {
  await page.waitForTimeout(2000);
  const url = page.url();

  if (url.includes("recovery")) {
    log(6, "Skipping recovery email...");
    const skip = page.locator('button:has-text("Skip")');
    if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click();
    await page.waitForTimeout(2000);
  }

  if (page.url().includes("tos") || page.url().includes("terms")) {
    log(7, "Agreeing to terms...");
    const agree = page.locator('button:has-text("I agree")');
    if (await agree.isVisible({ timeout: 5000 }).catch(() => false)) await agree.click();
    await page.waitForTimeout(3000);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const config = JSON.parse(readFileSync(resolve(PROJECT_ROOT, "config.json"), "utf-8"));

  console.log("=== Google Register — Auto Proxy Discovery + Mobile Mode ===");
  console.log(`Name: ${config.firstName} ${config.lastName}`);
  console.log(`Username: ${config.username}`);
  console.log(`Headless: ${HEADLESS}`);
  console.log("");

  // -- Discover or use provided proxy --
  let proxyServer = process.env.PROXY || "";

  if (!proxyServer || process.env.SKIP_PROXY_DISCOVERY !== "true") {
    if (proxyServer) {
      // Verify the provided proxy
      const info = await checkProxyResidential(proxyServer.replace(/^socks5:\/\//, ""));
      if (info && !info.isDC) {
        log("proxy", `Provided proxy is residential: ${info.isp} (${info.city})`);
      } else if (info) {
        log("proxy", `WARNING: Provided proxy is datacenter (${info.isp}). Searching for residential...`);
        proxyServer = "";
      } else {
        log("proxy", "Provided proxy is unreachable. Searching for alternative...");
        proxyServer = "";
      }
    }

    if (!proxyServer) {
      const proxies = await fetchProxyList();
      const result = await findResidentialProxy(proxies);
      if (result) {
        proxyServer = `socks5://${result.proxyAddr}`;
        log("proxy", `Using residential proxy: ${proxyServer} (${result.info.isp})`);
      } else {
        log("proxy", "No residential proxy found. Proceeding with direct connection (may get QR code).");
      }
    }
  }

  if (!proxyServer.startsWith("socks")) {
    proxyServer = proxyServer ? `socks5://${proxyServer}` : "";
  }

  console.log(`\nProxy: ${proxyServer || "(direct)"}\n`);

  // -- Launch browser --
  const launchOpts = {
    headless: HEADLESS,
    args: [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--ignore-certificate-errors",
    ],
  };
  if (proxyServer) {
    launchOpts.proxy = { server: proxyServer };
    launchOpts.args.push("--ignore-certificate-errors");
  }

  const browser = await chromium.launch(launchOpts);

  const context = await browser.newContext({
    ...devices["Pixel 7"],
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  try {
    // Verify IP
    log(0, "Verifying IP address...");
    await page.goto("http://ip-api.com/json", { waitUntil: "domcontentloaded", timeout: 30000 });
    const ipText = await page.locator("body").textContent();
    const ipInfo = JSON.parse(ipText);
    log(0, `IP: ${ipInfo.query} | ISP: ${ipInfo.isp} | ${ipInfo.city}, ${ipInfo.regionName}`);

    // Open signup
    log(0, "Opening Google signup...");
    await page.goto("https://accounts.google.com/signup", { waitUntil: "commit", timeout: 60000 });

    await stepName(page, config);
    await stepBirthday(page, config);
    await stepUsername(page, config);
    await stepPassword(page, config);

    const verifyResult = await stepVerification(page);

    if (verifyResult === "sms_ok") {
      await stepPostVerification(page);
    }

    await page.screenshot({ path: resolve(SCREENSHOT_DIR, "final.png"), fullPage: true });
    console.log(`\nFinal URL: ${page.url()}`);

    const finalPath = new URL(page.url()).pathname;
    if (finalPath.includes("myaccount") || finalPath.includes("ManageAccount")) {
      console.log("\n=== REGISTRATION SUCCESSFUL! ===");
      console.log(`Email: ${config.username}@gmail.com`);
      console.log(`Password: ${config.password}`);
    } else {
      console.log(`\nRegistration stopped at: ${verifyResult || "unknown"}`);
      console.log("Verification type analysis:");
      if (verifyResult === "device_verification") {
        console.log("  - devicephoneverification: Device must SEND SMS to Google");
        console.log("  - Cannot use virtual number (needs to send, not receive)");
        console.log("  - Caused by: IP flagged or browser fingerprint detected");
        console.log("  - Solutions: Better residential IP, stealth mode, or try later");
      }
    }
  } catch (err) {
    console.error("\nError:", err.message);
    await page.screenshot({ path: resolve(SCREENSHOT_DIR, "error.png"), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main();
