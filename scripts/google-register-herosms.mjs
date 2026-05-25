/**
 * Google 账号自动注册脚本 (hero-sms 全自动版)
 *
 * 自动完成：住宅代理 → 移动模式 → hero-sms 获取号码 → 接收验证码 → 完成注册
 *
 * 用法:
 *   PROXY=socks5://ip:port HERO_API=xxx node scripts/google-register-herosms.mjs
 *
 * 环境变量:
 *   PROXY       - SOCKS5 住宅代理 (必须)
 *   HERO_API    - hero-sms API key (必须)
 *   HEADLESS    - true/false (默认 true)
 */

import { chromium, devices } from "playwright";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import https from "https";
import http from "http";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Hero-SMS API
// ---------------------------------------------------------------------------

const HERO_API = process.env.HERO_API;
if (!HERO_API) {
  console.error("请设置 HERO_API 环境变量");
  process.exit(1);
}

async function heroRequest(params) {
  const qs = new URLSearchParams({ api_key: HERO_API, ...params }).toString();
  const url = `https://hero-sms.com/stubs/handler_api.php?${qs}`;
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15000 }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve(d));
    }).on("error", reject);
  });
}

async function getHeroNumber() {
  const result = await heroRequest({ action: "getNumber", service: "go", country: "187" });
  if (!result.startsWith("ACCESS_NUMBER")) {
    throw new Error(`hero-sms getNumber failed: ${result}`);
  }
  const [, activationId, phoneNumber] = result.split(":");
  return { activationId, phoneNumber: `+${phoneNumber}` };
}

async function waitForCode(activationId, maxWait = 180000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const result = await heroRequest({ action: "getStatus", id: activationId });
    if (result.startsWith("STATUS_OK")) {
      return result.split(":")[1];
    }
    if (result === "STATUS_CANCEL") {
      throw new Error("Activation was cancelled");
    }
    // STATUS_WAIT_CODE - keep polling
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("Timed out waiting for SMS code");
}

async function markReady(activationId) {
  return heroRequest({ action: "setStatus", id: activationId, status: "1" });
}

async function completeActivation(activationId) {
  return heroRequest({ action: "setStatus", id: activationId, status: "6" });
}

async function cancelActivation(activationId) {
  return heroRequest({ action: "setStatus", id: activationId, status: "8" });
}

// ---------------------------------------------------------------------------
// Config & Utils
// ---------------------------------------------------------------------------

function loadConfig() {
  const configPath = resolve(PROJECT_ROOT, "config.json");
  if (!existsSync(configPath)) {
    console.error("未找到 config.json");
    process.exit(1);
  }
  return JSON.parse(readFileSync(configPath, "utf-8"));
}

function log(step, message) {
  const ts = new Date().toLocaleTimeString("zh-CN");
  console.log(`[${ts}] 步骤 ${step}: ${message}`);
}

function saveScreenshot(page, name) {
  const dir = resolve(PROJECT_ROOT, "screenshots");
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, `${name}.png`);
  return page.screenshot({ path, fullPage: true });
}

// ---------------------------------------------------------------------------
// Registration Steps
// ---------------------------------------------------------------------------

async function stepName(page, config) {
  log(1, "输入姓名...");
  await page.waitForSelector('input[name="firstName"]', { timeout: 60000 });
  await page.fill('input[name="firstName"]', config.firstName);
  if (config.lastName) {
    await page.fill('input[name="lastName"]', config.lastName);
  }
  await page.click('button:has-text("Next")');
  log(1, `姓名: ${config.firstName} ${config.lastName || ""}`);
}

async function stepBirthdayGender(page, config) {
  log(2, "填写生日和性别...");
  await page.waitForURL("**/signup/birthdaygender**", { timeout: 30000 });

  // Select month
  await page.evaluate(() => {
    const section = document.querySelector("section");
    const dropdowns = section.querySelectorAll("div[aria-expanded]");
    if (dropdowns[0]) dropdowns[0].click();
  });
  await page.waitForTimeout(1000);
  await page.evaluate((month) => {
    for (const li of document.querySelectorAll("li")) {
      if (li.textContent.trim() === month) { li.click(); break; }
    }
  }, config.birthday.month);
  await page.waitForTimeout(500);

  await page.fill('input[name="day"]', config.birthday.day);
  await page.fill('input[name="year"]', config.birthday.year);

  // Select gender
  await page.evaluate(() => {
    const section = document.querySelector("section");
    const dropdowns = section.querySelectorAll("div[aria-expanded]");
    if (dropdowns.length >= 2) dropdowns[1].click();
  });
  await page.waitForTimeout(1000);
  await page.evaluate((gender) => {
    for (const li of document.querySelectorAll("li")) {
      if (li.textContent.trim() === gender) { li.click(); break; }
    }
  }, config.gender);
  await page.waitForTimeout(500);

  await page.click('button:has-text("Next")');
  log(2, `生日: ${config.birthday.month} ${config.birthday.day}, ${config.birthday.year}`);
}

async function stepUsername(page, config) {
  log(3, "设置用户名...");
  await page.waitForURL("**/signup/username**", { timeout: 30000 });
  await page.fill('input[name="Username"]', config.username);
  await page.click('button:has-text("Next")');
  log(3, `用户名: ${config.username}@gmail.com`);
}

async function stepPassword(page, config) {
  log(4, "设置密码...");
  await page.waitForURL("**/signup/password**", { timeout: 30000 });
  await page.fill('input[name="Passwd"]', config.password);
  await page.fill('input[name="PasswdAgain"]', config.password);
  await page.click('button:has-text("Next")');
  log(4, "密码已设置");
}

async function stepVerification(page) {
  log(5, "等待验证步骤...");
  await page.waitForTimeout(5000);
  
  // Wait for page to fully load
  await page.waitForLoadState("networkidle").catch(() => {});
  const url = page.url();
  log(5, `当前 URL: ${url}`);

  // Get page text content for debugging
  const bodyText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
  log(5, `页面内容预览: ${bodyText.slice(0, 200)}`);

  await saveScreenshot(page, "step5-verification");

  // Check if there's a phone input regardless of URL
  const hasTelInput = await page.locator('input[type="tel"]').isVisible({ timeout: 3000 }).catch(() => false);
  log(5, `是否有电话输入框: ${hasTelInput}`);

  // Case A: phoneverification or phone number input (residential IP path)
  if (url.includes("phonenumber") || url.includes("phone/number") || url.includes("phoneverification")) {
    if (!url.includes("devicephoneverification")) {
      log(5, "到达手机号输入验证 (phoneverification) — 使用 hero-sms");

      // Get number from hero-sms
      log(5, "从 hero-sms 获取号码...");
      const { activationId, phoneNumber } = await getHeroNumber();
      log(5, `号码: ${phoneNumber} (ID: ${activationId})`);

      // Mark ready to receive
      await markReady(activationId);

      // Fill phone number
      const telInput = page.locator('input[type="tel"]').first();
      await telInput.fill(phoneNumber);
      await page.click('button:has-text("Next")');
      await page.waitForTimeout(3000);

      await saveScreenshot(page, "step5-phone-submitted");

      // Wait for code from hero-sms
      log(5, "等待 hero-sms 接收验证码...");
      try {
        const code = await waitForCode(activationId);
        log(5, `收到验证码: ${code}`);

        // Find and fill code input
        const codeInput = page.locator('input[name="code"], input[type="tel"], input[aria-label*="code"], input[aria-label*="Code"]').first();
        await codeInput.fill(code);
        await page.click('button:has-text("Next"), button:has-text("Verify")');
        await page.waitForTimeout(3000);

        await completeActivation(activationId);
        log(5, "验证码已提交，激活完成！");
      } catch (err) {
        log(5, `验证码获取失败: ${err.message}`);
        await cancelActivation(activationId);
        throw err;
      }
      return;
    }
  }

  // Case B: devicephoneverification (bad IP) - but check if there's a phone input or alternative
  if (url.includes("devicephoneverification")) {
    log(5, "到达 devicephoneverification");
    await saveScreenshot(page, "step5-device-verification");

    // Check if there's a phone input we can use
    if (hasTelInput) {
      log(5, "发现电话输入框 — 尝试输入 hero-sms 号码...");
      const { activationId, phoneNumber } = await getHeroNumber();
      log(5, `号码: ${phoneNumber} (ID: ${activationId})`);
      await markReady(activationId);

      const telInput = page.locator('input[type="tel"]').first();
      await telInput.fill(phoneNumber);
      await page.click('button:has-text("Next"), button:has-text("Send"), button:has-text("Get code")');
      await page.waitForTimeout(5000);

      const newUrl = page.url();
      log(5, `提交后 URL: ${newUrl}`);
      await saveScreenshot(page, "step5-after-phone-submit");

      // Check if we're now on a code input page
      const codeInput = page.locator('input[name="code"], input[aria-label*="code"], input[aria-label*="Code"]').first();
      const hasCodeInput = await codeInput.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasCodeInput) {
        log(5, "等待 hero-sms 接收验证码...");
        try {
          const code = await waitForCode(activationId);
          log(5, `收到验证码: ${code}`);
          await codeInput.fill(code);
          await page.click('button:has-text("Next"), button:has-text("Verify")');
          await page.waitForTimeout(3000);
          await completeActivation(activationId);
          log(5, "验证码已提交！");
          return;
        } catch (err) {
          await cancelActivation(activationId);
          throw err;
        }
      } else {
        // Google probably wants us to SEND SMS, not receive
        log(5, "没有验证码输入框 — Google 要求发送 SMS（不是接收）");
        await cancelActivation(activationId);
        throw new Error("DEVICE_PHONE_VERIFICATION: Google 要求从手机发 SMS 到 96831，无法自动完成");
      }
    }

    throw new Error("DEVICE_PHONE_VERIFICATION: 需要更好的住宅IP代理（无电话输入框）");
  }

  // Case C: QR code (desktop mode)
  if (url.includes("mophoneverification") || url.includes("crossflowverification")) {
    log(5, "到达 QR 码验证 — 建议使用移动模式");
    await saveScreenshot(page, "step5-qr-verification");
    throw new Error("QR_VERIFICATION: 请使用移动模式运行");
  }

  // Case D: Check for tel input on unknown page
  const telInput = page.locator('input[type="tel"]').first();
  if (await telInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    log(5, "检测到手机号输入框 (未知URL模式) — 使用 hero-sms");

    const { activationId, phoneNumber } = await getHeroNumber();
    log(5, `号码: ${phoneNumber} (ID: ${activationId})`);
    await markReady(activationId);

    await telInput.fill(phoneNumber);
    await page.click('button:has-text("Next")');
    await page.waitForTimeout(3000);

    try {
      const code = await waitForCode(activationId);
      log(5, `收到验证码: ${code}`);

      const codeInput = page.locator('input[name="code"], input[type="tel"], input[aria-label*="code"], input[aria-label*="Code"]').first();
      await codeInput.fill(code);
      await page.click('button:has-text("Next"), button:has-text("Verify")');
      await page.waitForTimeout(3000);

      await completeActivation(activationId);
      log(5, "验证码已提交！");
    } catch (err) {
      await cancelActivation(activationId);
      throw err;
    }
    return;
  }

  log(5, `未知验证页面: ${url}`);
  await saveScreenshot(page, "step5-unknown");
}

async function stepRecoveryEmail(page) {
  const url = page.url();
  if (url.includes("recoveryemail") || url.includes("recovery")) {
    log(6, "跳过恢复邮箱...");
    const skipBtn = page.locator('button:has-text("Skip")');
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click();
    }
  }
}

async function stepTerms(page) {
  const url = page.url();
  if (url.includes("tos") || url.includes("terms")) {
    log(7, "同意服务条款...");
    const agreeBtn = page.locator('button:has-text("I agree")');
    if (await agreeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await agreeBtn.click();
      log(7, "已同意服务条款");
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const config = loadConfig();
  const headless = process.env.HEADLESS !== "false";
  const proxyServer = process.env.PROXY || "";

  console.log("=== Google 账号自动注册 (hero-sms 全自动) ===");
  console.log(`代理: ${proxyServer}`);
  console.log(`模式: 移动设备 (Pixel 7)`);
  console.log(`用户: ${config.username}@gmail.com`);
  console.log("");

  // Check balance
  const balanceResult = await heroRequest({ action: "getBalance" });
  console.log(`hero-sms 余额: ${balanceResult}`);

  const launchOptions = {
    headless,
    args: [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--ignore-certificate-errors",
    ],
  };
  if (proxyServer) {
    launchOptions.proxy = { server: proxyServer };
  }
  const browser = await chromium.launch(launchOptions);

  const context = await browser.newContext({
    ...devices["Pixel 7"],
    locale: "en-US",
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  try {
    log(0, "打开 Google 注册页面...");
    await page.goto("https://accounts.google.com/signup", {
      waitUntil: "commit",
      timeout: 60000,
    });

    await stepName(page, config);
    await page.waitForTimeout(2000);
    await stepBirthdayGender(page, config);
    await page.waitForTimeout(2000);
    await stepUsername(page, config);
    await page.waitForTimeout(2000);
    await stepPassword(page, config);
    await page.waitForTimeout(3000);
    await stepVerification(page);
    await page.waitForTimeout(2000);
    await stepRecoveryEmail(page);
    await page.waitForTimeout(2000);
    await stepTerms(page);

    await saveScreenshot(page, "registration-complete");

    console.log("");
    console.log("=== 注册完成！ ===");
    console.log(`邮箱: ${config.username}@gmail.com`);
    console.log(`密码: ${config.password}`);

    // Save account info
    const accountInfo = {
      email: `${config.username}@gmail.com`,
      password: config.password,
      registeredAt: new Date().toISOString(),
      proxy: proxyServer,
    };
    const accountPath = resolve(PROJECT_ROOT, "accounts", "new-account.json");
    mkdirSync(dirname(accountPath), { recursive: true });
    writeFileSync(accountPath, JSON.stringify(accountInfo, null, 2));
    console.log(`账号信息已保存: ${accountPath}`);

    await page.waitForTimeout(5000);
  } catch (error) {
    console.error("");
    console.error("注册失败:", error.message);
    await saveScreenshot(page, "error");
    console.error("错误截图已保存");
  } finally {
    await browser.close();
  }
}

main();
