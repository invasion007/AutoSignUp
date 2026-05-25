/**
 * ChatGPT Plus 订阅自动化脚本
 *
 * 通过 ChatGPT 后端 API 创建 Stripe Checkout 会话，
 * 然后自动填写账单信息并提交订阅。
 *
 * 两种支付路径：
 *   路径 A（推荐）：API → Checkout → PayPal（含免费试用 promo）
 *   路径 B：API → Checkout → 信用卡
 *
 * 用法:
 *   node scripts/chatgpt-plus-subscribe.mjs                    # PayPal 模式（推荐）
 *   CDP=true node scripts/chatgpt-plus-subscribe.mjs           # CDP 连接已打开的 Chrome
 *   PAYMENT=card node scripts/chatgpt-plus-subscribe.mjs       # 信用卡支付
 *   HEADLESS=true node scripts/chatgpt-plus-subscribe.mjs      # 无界面模式
 *   AUTO_SUBMIT=true node scripts/chatgpt-plus-subscribe.mjs   # 自动提交（跳过确认）
 *
 * 参考项目:
 *   - FoundZiGu/GuJumpgate（浏览器扩展，PayPal 通道全流程自动化）
 *   - zxyyang/plus_gopay_gptp-plus（PayPal 通道批量工具）
 */

import { chromium, devices } from "playwright";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// API 常量
// ---------------------------------------------------------------------------

const CHECKOUT_API = "https://chatgpt.com/backend-api/payments/checkout";

const PAYPAL_PAYLOAD = {
  entry_point: "all_plans_pricing_modal",
  plan_name: "chatgptplusplan",
  promo_campaign: {
    promo_campaign_id: "plus-1-month-free",
    is_coupon_from_query_param: false,
  },
  checkout_ui_mode: "hosted",
  billing_details: { country: "US", currency: "USD" },
};

const CARD_PAYLOAD = {
  entry_point: "all_plans_pricing_modal",
  plan_name: "chatgptplusplan",
  checkout_ui_mode: "custom",
  billing_details: { country: "US", currency: "USD" },
};

const DEFAULT_ADDRESS = {
  address1: "Broadway",
  city: "New York",
  region: "New York",
  postalCode: "10007",
};

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

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

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

async function safeType(page, selector, text, options = {}) {
  const { timeout = 10000, clear = true } = options;
  try {
    await page.waitForSelector(selector, { state: "visible", timeout });
    if (clear) {
      await page.click(selector, { clickCount: 3 });
      await page.keyboard.press("Backspace");
    }
    await page.type(selector, text, { delay: 50 });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 步骤 1: 连接或启动浏览器
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
// 步骤 2: 登录 ChatGPT（如未登录）
// ---------------------------------------------------------------------------

async function ensureLoggedIn(page, config) {
  log(1, "检查 ChatGPT 登录状态...");

  await page.goto("https://chatgpt.com", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  const url = page.url();
  if (!url.includes("auth") && !url.includes("login")) {
    log(1, "已登录 ChatGPT");
    return;
  }

  const loginConfig = config.chatgptLogin;
  if (!loginConfig?.email || !loginConfig?.password) {
    throw new Error(
      "未登录 ChatGPT 且 config.json 中未配置 chatgptLogin。\n" +
      "请先在浏览器中登录，或在 config.json 中添加 chatgptLogin 配置。"
    );
  }

  log(1, "执行自动登录...");

  // 点击 Log in
  const loginBtn = page.locator('button:has-text("Log in"), a:has-text("Log in")').first();
  if (await loginBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await loginBtn.click();
    await page.waitForTimeout(2000);
  }

  // 输入邮箱
  const emailInput = page.locator('input[name="email"], input[type="email"], input[id="email-input"]').first();
  if (await emailInput.isVisible({ timeout: 10000 }).catch(() => false)) {
    await emailInput.fill(loginConfig.email);
    info(`邮箱: ${loginConfig.email}`);

    const continueBtn = page.locator('button:has-text("Continue"), button[type="submit"]').first();
    if (await continueBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await continueBtn.click();
    }
    await page.waitForTimeout(2000);
  }

  // 输入密码
  const pwdInput = page.locator('input[name="password"], input[type="password"]').first();
  if (await pwdInput.isVisible({ timeout: 10000 }).catch(() => false)) {
    await pwdInput.fill(loginConfig.password);
    const submitBtn = page.locator('button:has-text("Continue"), button[type="submit"]').first();
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
    }
    await page.waitForTimeout(5000);
  }

  // 验证登录成功
  const afterUrl = page.url();
  if (afterUrl.includes("auth") || afterUrl.includes("login")) {
    await screenshot(page, "login-failed");
    throw new Error("登录失败，请检查 chatgptLogin 配置或手动登录。");
  }

  log(1, "登录成功！");
}

// ---------------------------------------------------------------------------
// 步骤 3: 获取 accessToken
// ---------------------------------------------------------------------------

async function getAccessToken(page) {
  log(2, "获取 accessToken...");

  const session = await page.evaluate(async () => {
    const resp = await fetch("/api/auth/session", { credentials: "include" });
    return resp.json();
  });

  const token = session?.accessToken;
  if (!token) {
    throw new Error("无法获取 accessToken，请确认已登录。");
  }

  info("accessToken 获取成功");
  return token;
}

// ---------------------------------------------------------------------------
// 步骤 4: 创建 Checkout 会话
// ---------------------------------------------------------------------------

async function createCheckout(page, token, method) {
  log(3, `创建 Checkout 会话 (${method})...`);

  const payload = method === "paypal" ? PAYPAL_PAYLOAD : CARD_PAYLOAD;

  const result = await page.evaluate(
    async ({ url, tok, body }) => {
      const resp = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: {
          Authorization: `Bearer ${tok}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await resp.json().catch(() => ({}));
      return { ok: resp.ok, status: resp.status, data };
    },
    { url: CHECKOUT_API, tok: token, body: payload },
  );

  if (!result.ok || !result.data?.checkout_session_id) {
    const detail = result.data?.detail || result.data?.message || `HTTP ${result.status}`;
    throw new Error(`创建 Checkout 失败: ${detail}`);
  }

  const sid = result.data.checkout_session_id;
  const entity = method === "paypal" ? "openai_ie" : "openai_llc";
  const checkoutUrl = `https://chatgpt.com/checkout/${entity}/${sid}`;

  // 查找 hosted checkout URL (Stripe)
  let hostedUrl = "";
  const findUrl = (obj) => {
    if (!obj || typeof obj !== "object") return;
    for (const [, val] of Object.entries(obj)) {
      if (typeof val === "string" && (val.includes("pay.openai.com") || val.includes("checkout.stripe.com"))) {
        hostedUrl = val;
        return;
      }
      if (typeof val === "object") findUrl(val);
    }
  };
  findUrl(result.data);

  log(3, "Checkout 会话创建成功");
  info(`Session ID: ${sid}`);
  info(`Checkout URL: ${checkoutUrl}`);
  if (hostedUrl) info(`Hosted URL: ${hostedUrl}`);

  return { sid, checkoutUrl, hostedUrl, entity, raw: result.data };
}

// ---------------------------------------------------------------------------
// 步骤 5: 打开 Checkout 页面
// ---------------------------------------------------------------------------

async function openCheckout(page, checkout, method) {
  log(4, "打开 Checkout 页面...");

  const url =
    method === "paypal" && checkout.hostedUrl
      ? checkout.hostedUrl
      : checkout.checkoutUrl;

  info(`导航到: ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  await screenshot(page, "checkout-page");

  return page.url();
}

// ---------------------------------------------------------------------------
// 步骤 6A: PayPal 支付流程
// ---------------------------------------------------------------------------

async function handlePayPal(page, config) {
  log(5, "PayPal 支付流程...");

  // 选择 PayPal
  const selectors = [
    '[data-testid="paypal-accordion-item-button"]',
    ".paypal-accordion-item button",
    'button:has-text("PayPal")',
    '[aria-label*="PayPal"]',
  ];

  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 3000 })) {
        await el.click();
        await page.waitForTimeout(1000);
        await el.click();
        info(`选择 PayPal: ${sel}`);
        break;
      }
    } catch {
      continue;
    }
  }

  await page.waitForTimeout(3000);

  // 账单地址
  const addr = config.payment?.billingAddress || DEFAULT_ADDRESS;
  await selectCountry(page, "US");
  await safeType(
    page,
    '#billingAddressLine1, input[name="billingAddressLine1"]',
    addr.address1 || "Broadway",
    { timeout: 5000 },
  );
  await safeType(
    page,
    '#billingLocality, input[name="billingLocality"]',
    addr.city || "New York",
    { timeout: 3000 },
  );
  await safeType(
    page,
    '#billingPostalCode, input[name="billingPostalCode"]',
    addr.postalCode || "10007",
    { timeout: 3000 },
  );

  // 州
  const state = addr.region || addr.state || "New York";
  try {
    const sel = page.locator('#billingAdministrativeArea, select[name="billingAdministrativeArea"]').first();
    if (await sel.isVisible({ timeout: 3000 })) {
      await sel.selectOption({ label: state });
      info(`州: ${state}`);
    }
  } catch {
    await safeType(page, 'input[name="billingAdministrativeArea"]', state, { timeout: 3000 });
  }

  // 持卡人姓名
  if (config.payment?.cardholderName) {
    await fillName(page, config.payment.cardholderName);
  }

  await checkTerms(page);
  await page.waitForTimeout(2000);
  await screenshot(page, "paypal-filled");
  log(5, "PayPal 账单信息填写完成");
}

// ---------------------------------------------------------------------------
// 步骤 6B: 信用卡支付流程
// ---------------------------------------------------------------------------

async function handleCard(page, config) {
  log(5, "信用卡支付流程...");

  const pay = config.payment;
  if (!pay?.cardNumber) {
    throw new Error("config.json 中未配置 payment.cardNumber");
  }

  // 邮箱
  if (pay.email) {
    if (await safeType(page, '#email, input[name="email"]', pay.email, { timeout: 5000 })) {
      info(`邮箱: ${pay.email}`);
    }
  }

  // 卡号 — 尝试直接输入
  let filled = await safeType(
    page,
    '#cardNumber, input[name="cardNumber"], input[autocomplete="cc-number"]',
    pay.cardNumber,
    { timeout: 5000 },
  );

  // 尝试 Stripe iframe
  if (!filled) {
    info("尝试 Stripe iframe...");
    for (const frame of page.frames()) {
      if (frame.url().includes("stripe.com")) {
        try {
          const input = frame.locator('input[name="cardnumber"], input[name="cardNumber"]').first();
          if (await input.isVisible({ timeout: 3000 })) {
            await input.fill(pay.cardNumber);
            filled = true;
            info("通过 iframe 填写卡号");
            break;
          }
        } catch {
          continue;
        }
      }
    }
  }

  if (filled) info("卡号已填写");
  else info("无法自动填写卡号，请手动输入");

  // 有效期
  if (pay.expiry) {
    if (await safeType(page, '#cardExpiry, input[name="cardExpiry"], input[autocomplete="cc-exp"]', pay.expiry, { timeout: 3000 })) {
      info("有效期已填写");
    }
  }

  // CVC
  if (pay.cvc) {
    if (await safeType(page, '#cardCvc, input[name="cardCvc"], input[autocomplete="cc-csc"]', pay.cvc, { timeout: 3000 })) {
      info("CVC 已填写");
    }
  }

  // 持卡人姓名
  if (pay.cardholderName) {
    await fillName(page, pay.cardholderName);
  }

  // 国家 + 邮编
  await selectCountry(page, "US");
  if (pay.postalCode) {
    await safeType(page, '#billingPostalCode, input[name="billingPostalCode"]', pay.postalCode, { timeout: 3000 });
  }

  await checkTerms(page);
  await screenshot(page, "card-filled");
  log(5, "信用卡信息填写完成");
}

// ---------------------------------------------------------------------------
// 步骤 7: 提交订阅
// ---------------------------------------------------------------------------

async function submit(page, autoSubmit) {
  log(6, "提交订阅...");

  if (!autoSubmit) {
    console.log("");
    console.log("  请检查页面上的支付信息是否正确");
    console.log("  30 秒后自动提交，或设置 AUTO_SUBMIT=true 跳过等待");
    console.log("");
    await new Promise((r) => setTimeout(r, 30000));
  }

  const btns = [
    'button[data-testid="submit-button"]',
    'button[data-testid="hosted-payment-submit-button"]',
    "button.SubmitButton--complete",
    'button:has-text("Subscribe")',
    'button:has-text("Pay")',
    'button:has-text("Start subscription")',
    'button:has-text("Next")',
    'button:has-text("Continue")',
    'button[type="submit"]',
  ];

  for (const sel of btns) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 })) {
        if (!(await btn.isDisabled())) {
          info(`点击: ${sel}`);
          await btn.click();
          log(6, "已提交！");
          await page.waitForTimeout(10000);
          await screenshot(page, "after-submit");
          return true;
        }
      }
    } catch {
      continue;
    }
  }

  info("未找到提交按钮，请手动提交");
  await screenshot(page, "no-submit");
  return false;
}

// ---------------------------------------------------------------------------
// 步骤 8: 验证结果
// ---------------------------------------------------------------------------

async function verify(page) {
  log(7, "验证订阅结果...");
  await page.waitForTimeout(5000);

  const url = page.url();
  info(`当前 URL: ${url}`);

  if (url.includes("paypal.com")) {
    info("已跳转到 PayPal，请在 PayPal 中完成支付");
    console.log("");
    console.log("  请在 PayPal 页面中登录并确认支付");
    console.log("  支付完成后会自动返回 ChatGPT");
    console.log("");
    return "paypal_redirect";
  }

  if (url.includes("success") || url.includes("thank")) {
    log(7, "支付成功！");
    return "success";
  }

  if (url.includes("chatgpt.com")) {
    info("已返回 ChatGPT 页面");
    return "returned";
  }

  await screenshot(page, "verify-result");
  return "unknown";
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

async function selectCountry(page, code) {
  for (const sel of ['#billingCountry', 'select[name="billingCountry"]', 'select[name="billingAddressCountry"]']) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 3000 })) {
        await el.selectOption(code);
        info(`国家: ${code}`);
        return true;
      }
    } catch {
      continue;
    }
  }

  try {
    const dd = page.locator('[data-testid="country-dropdown"], [aria-label*="Country"]').first();
    if (await dd.isVisible({ timeout: 3000 })) {
      await dd.click();
      await page.waitForTimeout(500);
      const opt = page.locator('text="United States"').first();
      if (await opt.isVisible({ timeout: 3000 })) {
        await opt.click();
        info("国家: United States");
        return true;
      }
    }
  } catch { /* ignore */ }

  return false;
}

async function fillName(page, name) {
  for (const sel of ['#billingName', 'input[name="billingName"]', 'input[autocomplete="cc-name"]']) {
    if (await safeType(page, sel, name, { timeout: 3000 })) {
      info(`姓名: ${name}`);
      return true;
    }
  }
  return false;
}

async function checkTerms(page) {
  try {
    const cb = page.locator('#termsOfServiceConsentCheckbox, input[name="termsOfServiceConsent"]').first();
    if (await cb.isVisible({ timeout: 3000 })) {
      if (!(await cb.isChecked())) {
        await cb.click();
        info("已勾选服务条款");
      }
    }
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const config = loadConfig();
  const method = process.env.PAYMENT === "card" ? "card" : "paypal";
  const autoSubmit = process.env.AUTO_SUBMIT === "true";

  console.log("");
  console.log("  ChatGPT Plus 订阅自动化");
  console.log("  ========================");
  console.log(`  连接: ${process.env.CDP === "true" ? "CDP" : "独立浏览器"}`);
  console.log(`  支付: ${method === "paypal" ? "PayPal（含 plus-1-month-free promo）" : "信用卡"}`);
  console.log(`  自动提交: ${autoSubmit ? "是" : "否"}`);
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
    await ensureLoggedIn(page, config);
    const token = await getAccessToken(page);
    const checkout = await createCheckout(page, token, method);
    await openCheckout(page, checkout, method);

    if (method === "paypal") {
      await handlePayPal(page, config);
    } else {
      await handleCard(page, config);
    }

    const submitted = await submit(page, autoSubmit);

    if (submitted) {
      const result = await verify(page);
      if (result === "paypal_redirect") {
        info("等待 PayPal 完成（最多 10 分钟）...");
        try {
          await page.waitForURL((u) => !u.href.includes("paypal.com"), { timeout: 600000 });
          await verify(page);
        } catch {
          info("PayPal 超时，请手动完成");
        }
      }
    }

    console.log("");
    console.log("  流程结束。请检查浏览器确认订阅状态。");
    console.log("");

    if (!isCDP) {
      info("浏览器将在 60 秒后关闭...");
      await page.waitForTimeout(60000);
    }
  } catch (error) {
    console.error("");
    console.error("订阅出错:", error.message);
    await screenshot(page, "error");
  } finally {
    if (!isCDP) {
      await browser.close();
    }
  }
}

main();
