/**
 * ChatGPT 自动登录脚本
 *
 * 自动登录 ChatGPT 账号，适用于：
 *   1. 订阅前的登录准备（配合 chatgpt-plus-subscribe.mjs）
 *   2. 日常使用时的自动登录
 *
 * 用法:
 *   node scripts/chatgpt-login.mjs                    # 标准模式
 *   CDP=true node scripts/chatgpt-login.mjs           # CDP 连接已打开的 Chrome（推荐）
 *   HEADLESS=true node scripts/chatgpt-login.mjs      # 无界面模式
 */

import { chromium, devices } from "playwright";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------

function loadConfig() {
  const configPath = resolve(PROJECT_ROOT, "config.json");
  if (!existsSync(configPath)) {
    console.error("未找到 config.json，请先复制 config.example.json 并填写信息：");
    console.error("   cp config.example.json config.json");
    process.exit(1);
  }
  return JSON.parse(readFileSync(configPath, "utf-8"));
}

function log(step, msg) {
  const ts = new Date().toLocaleTimeString("zh-CN");
  console.log(`[${ts}] 步骤 ${step}: ${msg}`);
}

function info(msg) {
  const ts = new Date().toLocaleTimeString("zh-CN");
  console.log(`[${ts}] ${msg}`);
}

async function screenshot(page, name) {
  const dir = resolve(PROJECT_ROOT, "screenshots");
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, `${name}-${Date.now()}.png`);
  await page.screenshot({ path, fullPage: true }).catch(() => {});
  info(`截图: ${path}`);
  return path;
}

// ---------------------------------------------------------------------------
// 连接浏览器
// ---------------------------------------------------------------------------

async function connectBrowser() {
  const useCDP = process.env.CDP === "true";
  const headless = process.env.HEADLESS === "true";
  const cdpUrl = process.env.CDP_URL || "http://localhost:29229";

  if (useCDP) {
    log(0, `CDP 连接: ${cdpUrl}`);
    const browser = await chromium.connectOverCDP(cdpUrl);
    const contexts = browser.contexts();
    const context = contexts.length > 0 ? contexts[0] : await browser.newContext();
    return { browser, context, isCDP: true };
  }

  log(0, `启动浏览器 (headless=${headless})`);
  const browser = await chromium.launch({
    headless,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    ...devices["Pixel 7"],
    locale: "en-US",
  });

  return { browser, context, isCDP: false };
}

// ---------------------------------------------------------------------------
// 登录流程
// ---------------------------------------------------------------------------

async function login(page, loginConfig) {
  log(1, "打开 ChatGPT...");
  await page.goto("https://chatgpt.com", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  const url = page.url();
  if (!url.includes("auth") && !url.includes("login")) {
    // 检查页面上是否有 Log in 按钮
    const loginBtn = page.locator('button:has-text("Log in"), a:has-text("Log in")').first();
    if (!(await loginBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      log(1, "已经登录！");
      return true;
    }
  }

  log(2, "开始登录...");

  // 点击 Log in
  const loginBtn = page.locator('button:has-text("Log in"), a:has-text("Log in")').first();
  if (await loginBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await loginBtn.click();
    await page.waitForTimeout(3000);
  }

  await screenshot(page, "login-page");

  // 输入邮箱
  log(3, `输入邮箱: ${loginConfig.email}`);
  const emailInput = page.locator('input[name="email"], input[type="email"], input[id="email-input"]').first();
  if (await emailInput.isVisible({ timeout: 10000 }).catch(() => false)) {
    await emailInput.fill(loginConfig.email);

    const continueBtn = page.locator('button:has-text("Continue"), button[type="submit"]').first();
    if (await continueBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await continueBtn.click();
    }
    await page.waitForTimeout(3000);
  } else {
    await screenshot(page, "no-email-input");
    throw new Error("未找到邮箱输入框");
  }

  // 输入密码
  log(4, "输入密码...");
  const pwdInput = page.locator('input[name="password"], input[type="password"]').first();
  if (await pwdInput.isVisible({ timeout: 10000 }).catch(() => false)) {
    await pwdInput.fill(loginConfig.password);

    const submitBtn = page.locator('button:has-text("Continue"), button[type="submit"]').first();
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
    }
    await page.waitForTimeout(5000);
  } else {
    await screenshot(page, "no-password-input");
    throw new Error("未找到密码输入框");
  }

  // 验证登录
  const afterUrl = page.url();
  if (afterUrl.includes("auth") || afterUrl.includes("login")) {
    await screenshot(page, "login-failed");
    throw new Error("登录失败，请检查账号密码是否正确");
  }

  log(5, "登录成功！");
  await screenshot(page, "login-success");

  // 验证 session
  try {
    const session = await page.evaluate(async () => {
      const resp = await fetch("/api/auth/session", { credentials: "include" });
      return resp.json();
    });

    if (session?.accessToken) {
      info("accessToken 验证通过");
      if (session?.user?.email) info(`登录用户: ${session.user.email}`);
    }
  } catch {
    info("无法验证 session，但登录页面跳转成功");
  }

  return true;
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const config = loadConfig();
  const loginConfig = config.chatgptLogin;

  if (!loginConfig?.email || !loginConfig?.password) {
    console.error("请在 config.json 中配置 chatgptLogin:");
    console.error('  "chatgptLogin": { "email": "...", "password": "..." }');
    process.exit(1);
  }

  console.log("");
  console.log("  ChatGPT 自动登录");
  console.log("  =================");
  console.log(`  连接: ${process.env.CDP === "true" ? "CDP" : "独立浏览器"}`);
  console.log(`  邮箱: ${loginConfig.email}`);
  console.log("");

  const { browser, context, isCDP } = await connectBrowser();

  let page;
  if (isCDP) {
    const pages = context.pages();
    page = pages.length > 0 ? pages[0] : await context.newPage();
  } else {
    page = await context.newPage();
  }

  try {
    await login(page, loginConfig);

    console.log("");
    console.log("  登录完成！现在可以运行订阅脚本：");
    console.log("  npm run subscribe:cdp");
    console.log("");

    if (!isCDP) {
      info("浏览器将在 30 秒后关闭...");
      await page.waitForTimeout(30000);
    }
  } catch (error) {
    console.error("");
    console.error("登录出错:", error.message);
    await screenshot(page, "error");
  } finally {
    if (!isCDP) {
      await browser.close();
    }
  }
}

main();
