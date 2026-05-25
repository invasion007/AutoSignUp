/**
 * ChatGPT Plus 订阅自动化脚本
 *
 * 参考 FoundZiGu/GuJumpgate 项目的方法，通过 ChatGPT 后端 API 创建
 * Stripe Checkout 会话，然后自动填写账单信息并提交订阅。
 *
 * 两种订阅路径：
 *   路径 A（推荐）：API 创建 Checkout → PayPal 支付（含免费试用 promo）
 *   路径 B：API 创建 Checkout → 信用卡支付
 *
 * 用法:
 *   node scripts/chatgpt-plus-subscribe.mjs                    # 标准模式
 *   CDP=true node scripts/chatgpt-plus-subscribe.mjs           # CDP 连接已打开的 Chrome（推荐）
 *   HEADLESS=true node scripts/chatgpt-plus-subscribe.mjs      # 无界面模式
 *   PAYMENT=card node scripts/chatgpt-plus-subscribe.mjs       # 使用信用卡支付
 *
 * 参考项目:
 *   - FoundZiGu/GuJumpgate（浏览器扩展，PayPal 通道全流程自动化）
 *   - zxyyang/plus_gopay_gptp-plus（PayPal 通道批量工具）
 *   - DanOps-1/Gpt-Agreement-Payment（协议重放工具集）
 */

import { chromium, devices } from "playwright";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// 常量（参考 GuJumpgate plus-checkout.js）
// ---------------------------------------------------------------------------

const CHECKOUT_API_URL = "https://chatgpt.com/backend-api/payments/checkout";
const SESSION_API_URL = "/api/auth/session";

const CHECKOUT_PAYLOAD_PAYPAL = {
  entry_point: "all_plans_pricing_modal",
  plan_name: "chatgptplusplan",
  promo_campaign: {
    promo_campaign_id: "plus-1-month-free",
    is_coupon_from_query_param: false,
  },
  checkout_ui_mode: "hosted",
  billing_details: {
    country: "US",
    currency: "USD",
  },
};

const CHECKOUT_PAYLOAD_CARD = {
  entry_point: "all_plans_pricing_modal",
  plan_name: "chatgptplusplan",
  checkout_ui_mode: "custom",
  billing_details: {
    country: "US",
    currency: "USD",
  },
};

const US_ADDRESS_SEEDS = [
  {
    query: "New York NY",
    fallback: {
      address1: "Broadway",
      city: "New York",
      region: "New York",
      postalCode: "10007",
    },
  },
  {
    query: "Los Angeles CA",
    fallback: {
      address1: "Wilshire Blvd",
      city: "Los Angeles",
      region: "California",
      postalCode: "90017",
    },
  },
];

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

function log(step, message) {
  const timestamp = new Date().toLocaleTimeString("zh-CN");
  console.log(`[${timestamp}] 步骤 ${step}: ${message}`);
}

function logInfo(message) {
  const timestamp = new Date().toLocaleTimeString("zh-CN");
  console.log(`[${timestamp}] ℹ️  ${message}`);
}

async function saveScreenshot(page, name) {
  const screenshotDir = resolve(PROJECT_ROOT, "screenshots");
  mkdirSync(screenshotDir, { recursive: true });
  const path = resolve(screenshotDir, `${name}-${Date.now()}.png`);
  await page.screenshot({ path, fullPage: true }).catch(() => {});
  logInfo(`截图已保存: ${path}`);
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
    log(0, `通过 CDP 连接浏览器: ${cdpUrl}`);
    const browser = await chromium.connectOverCDP(cdpUrl);
    const contexts = browser.contexts();
    const context = contexts.length > 0 ? contexts[0] : await browser.newContext();
    return { browser, context, isCDP: true };
  }

  log(0, `启动新浏览器 (headless=${headless})`);
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
// 步骤 2: 确认已登录并获取 accessToken
// ---------------------------------------------------------------------------

async function getAccessToken(page) {
  log(1, "获取 ChatGPT 登录会话...");

  await page.goto("https://chatgpt.com", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);

  const currentUrl = page.url();
  if (currentUrl.includes("auth") || currentUrl.includes("login")) {
    throw new Error("未登录 ChatGPT！请先在浏览器中登录，或使用 CDP 模式连接已登录的浏览器。");
  }

  log(1, "已登录 ChatGPT，正在获取 accessToken...");

  // 通过页面内 fetch 调用获取 session（参考 GuJumpgate）
  const session = await page.evaluate(async () => {
    const resp = await fetch("/api/auth/session", { credentials: "include" });
    return resp.json();
  });

  const accessToken = session?.accessToken;
  if (!accessToken) {
    throw new Error("无法获取 accessToken，请确认已登录 ChatGPT。");
  }

  logInfo("accessToken 获取成功");
  return accessToken;
}

// ---------------------------------------------------------------------------
// 步骤 3: 通过 API 创建 Checkout 会话（核心 — 参考 GuJumpgate）
// ---------------------------------------------------------------------------

async function createCheckoutSession(page, accessToken, paymentMethod) {
  log(2, `通过 API 创建 Checkout 会话 (${paymentMethod})...`);

  const payload = paymentMethod === "paypal"
    ? CHECKOUT_PAYLOAD_PAYPAL
    : CHECKOUT_PAYLOAD_CARD;

  const result = await page.evaluate(async ({ url, token, body }) => {
    const resp = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, data };
  }, { url: CHECKOUT_API_URL, token: accessToken, body: payload });

  if (!result.ok || !result.data?.checkout_session_id) {
    const detail = result.data?.detail || result.data?.message || `HTTP ${result.status}`;
    throw new Error(`创建 Checkout 会话失败：${detail}`);
  }

  const sessionId = result.data.checkout_session_id;
  const processorEntity = paymentMethod === "paypal" ? "openai_ie" : "openai_llc";
  const checkoutUrl = `https://chatgpt.com/checkout/${processorEntity}/${sessionId}`;

  // 查找 hosted checkout URL（Stripe 页面直接链接）
  let hostedCheckoutUrl = "";
  const findUrl = (obj) => {
    if (!obj || typeof obj !== "object") return;
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === "string" && (val.includes("pay.openai.com") || val.includes("checkout.stripe.com"))) {
        hostedCheckoutUrl = val;
        return;
      }
      if (typeof val === "object") findUrl(val);
    }
  };
  findUrl(result.data);

  log(2, "Checkout 会话创建成功！");
  logInfo(`Session ID: ${sessionId}`);
  logInfo(`Checkout URL: ${checkoutUrl}`);
  if (hostedCheckoutUrl) logInfo(`Hosted URL: ${hostedCheckoutUrl}`);

  return {
    sessionId,
    checkoutUrl,
    hostedCheckoutUrl,
    processorEntity,
    rawData: result.data,
  };
}

// ---------------------------------------------------------------------------
// 步骤 4: 打开 Checkout 页面
// ---------------------------------------------------------------------------

async function openCheckoutPage(page, checkoutInfo, paymentMethod) {
  log(3, "打开 Checkout 页面...");

  // PayPal 模式优先使用 hosted checkout URL
  const targetUrl = paymentMethod === "paypal" && checkoutInfo.hostedCheckoutUrl
    ? checkoutInfo.hostedCheckoutUrl
    : checkoutInfo.checkoutUrl;

  logInfo(`导航到: ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);

  await saveScreenshot(page, "checkout-page");

  const url = page.url();
  logInfo(`当前页面: ${url}`);

  return url;
}

// ---------------------------------------------------------------------------
// 步骤 5A: PayPal 支付流程（参考 GuJumpgate）
// ---------------------------------------------------------------------------

async function handlePayPalCheckout(page, config) {
  log(4, "PayPal 支付流程...");

  // 选择 PayPal 支付方式（参考 GuJumpgate 选择器）
  const paypalSelectors = [
    '[data-testid="paypal-accordion-item-button"]',
    '.paypal-accordion-item button',
    'button:has-text("PayPal")',
    '[aria-label*="PayPal"]',
    'div:has-text("PayPal"):not(:has(div:has-text("PayPal")))',
  ];

  let paypalSelected = false;
  for (const sel of paypalSelectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 3000 })) {
        await el.click();
        await page.waitForTimeout(1000);
        await el.click(); // 双击确认（参考 GuJumpgate）
        paypalSelected = true;
        logInfo(`已选择 PayPal: ${sel}`);
        break;
      }
    } catch {
      continue;
    }
  }

  if (!paypalSelected) {
    logInfo("未找到 PayPal 选项，尝试继续填写账单信息...");
  }

  await page.waitForTimeout(3000);

  // 填写账单地址（参考 GuJumpgate address-sources.js）
  const address = config.payment?.billingAddress || US_ADDRESS_SEEDS[0].fallback;

  // 选择国家为 US
  await selectCountryUS(page);

  // 填写地址字段（参考 GuJumpgate 选择器）
  await safeType(page, '#billingAddressLine1, input[name="billingAddressLine1"]', address.address1 || address.street || "Broadway", { timeout: 5000 });
  await safeType(page, '#billingLocality, input[name="billingLocality"]', address.city || "New York", { timeout: 3000 });
  await safeType(page, '#billingPostalCode, input[name="billingPostalCode"]', address.postalCode || address.zip || "10007", { timeout: 3000 });

  // 选择州
  const stateValue = address.region || address.state || "New York";
  try {
    const stateSelect = page.locator('#billingAdministrativeArea, select[name="billingAdministrativeArea"]').first();
    if (await stateSelect.isVisible({ timeout: 3000 })) {
      await stateSelect.selectOption({ label: stateValue });
      logInfo(`已选择州: ${stateValue}`);
    }
  } catch {
    logInfo("未找到州选择框，尝试文本输入...");
    await safeType(page, 'input[name="billingAdministrativeArea"]', stateValue, { timeout: 3000 });
  }

  // 填写持卡人姓名（如果有）
  if (config.payment?.cardholderName) {
    await fillFullName(page, config.payment.cardholderName);
  }

  // 勾选服务条款（参考 GuJumpgate）
  await checkTermsOfService(page);

  await page.waitForTimeout(2000);
  await saveScreenshot(page, "paypal-billing-filled");

  log(4, "PayPal 账单信息填写完成");
}

// ---------------------------------------------------------------------------
// 步骤 5B: 信用卡支付流程
// ---------------------------------------------------------------------------

async function handleCardCheckout(page, config) {
  log(4, "信用卡支付流程...");

  const payment = config.payment;

  // 邮箱
  if (payment.email) {
    const emailFilled = await safeType(page, '#email, input[name="email"]', payment.email, { timeout: 5000 });
    if (emailFilled) logInfo(`已填写邮箱: ${payment.email}`);
  }

  // 卡号（尝试多种选择器）
  let cardFilled = await safeType(
    page,
    '#cardNumber, input[name="cardNumber"], input[autocomplete="cc-number"]',
    payment.cardNumber,
    { timeout: 5000 }
  );

  // 尝试 Stripe iframe
  if (!cardFilled) {
    logInfo("尝试通过 Stripe iframe 填写卡号...");
    for (const frame of page.frames()) {
      if (frame.url().includes("stripe.com")) {
        try {
          const cardInput = frame.locator('input[name="cardnumber"], input[name="cardNumber"]').first();
          if (await cardInput.isVisible({ timeout: 3000 })) {
            await cardInput.fill(payment.cardNumber);
            cardFilled = true;
            logInfo("通过 iframe 填写了卡号");
            break;
          }
        } catch { continue; }
      }
    }
  }

  if (cardFilled) logInfo("已填写卡号");
  else logInfo("无法自动填写卡号，请手动输入");

  // 有效期
  if (await safeType(page, '#cardExpiry, input[name="cardExpiry"], input[autocomplete="cc-exp"]', payment.expiry, { timeout: 3000 })) {
    logInfo("已填写有效期");
  }

  // CVC
  if (await safeType(page, '#cardCvc, input[name="cardCvc"], input[autocomplete="cc-csc"]', payment.cvc, { timeout: 3000 })) {
    logInfo("已填写 CVC");
  }

  // 持卡人姓名
  if (payment.cardholderName) {
    await fillFullName(page, payment.cardholderName);
  }

  // 国家
  await selectCountryUS(page);

  // 邮编
  if (payment.postalCode) {
    await safeType(page, '#billingPostalCode, input[name="billingPostalCode"]', payment.postalCode, { timeout: 3000 });
  }

  // 服务条款
  await checkTermsOfService(page);

  await saveScreenshot(page, "card-billing-filled");
  log(4, "信用卡信息填写完成");
}

// ---------------------------------------------------------------------------
// 步骤 6: 提交订阅（参考 GuJumpgate 选择器）
// ---------------------------------------------------------------------------

async function submitSubscription(page, autoSubmit) {
  log(5, "提交订阅...");

  if (!autoSubmit) {
    console.log("");
    console.log("╔══════════════════════════════════════════════════╗");
    console.log("║   请检查页面上的支付信息是否正确                    ║");
    console.log("║   30 秒后自动提交，或设置 AUTO_SUBMIT=true 跳过    ║");
    console.log("╚══════════════════════════════════════════════════╝");
    console.log("");
    await new Promise((r) => setTimeout(r, 30000));
  }

  // 参考 GuJumpgate 的提交按钮选择器
  const submitSelectors = [
    'button[data-testid="submit-button"]',
    'button[data-testid="hosted-payment-submit-button"]',
    'button[data-atomic-wait-intent="Submit_Email"]',
    'button.SubmitButton--complete',
    'button:has-text("Subscribe")',
    'button:has-text("Pay")',
    'button:has-text("Start subscription")',
    'button:has-text("Next")',
    'button:has-text("Continue")',
    'button:has-text("Agree")',
    'button[type="submit"]',
  ];

  for (const sel of submitSelectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 })) {
        const isDisabled = await btn.isDisabled();
        if (!isDisabled) {
          logInfo(`点击提交: ${sel}`);
          await btn.click();
          log(5, "已提交订阅！");
          await page.waitForTimeout(10000);
          await saveScreenshot(page, "after-submit");
          return true;
        }
      }
    } catch { continue; }
  }

  logInfo("未找到可点击的提交按钮，请手动提交");
  await saveScreenshot(page, "no-submit-button");
  return false;
}

// ---------------------------------------------------------------------------
// 辅助函数（参考 GuJumpgate）
// ---------------------------------------------------------------------------

async function selectCountryUS(page) {
  // 尝试多种国家选择方式
  const countrySelectors = [
    '#billingCountry',
    'select[name="billingCountry"]',
    'select[name="billingAddressCountry"]',
  ];

  for (const sel of countrySelectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 3000 })) {
        await el.selectOption("US");
        logInfo("已选择国家: US");
        return true;
      }
    } catch { continue; }
  }

  // 尝试自定义 dropdown（非 select 元素）
  try {
    const dropdown = page.locator('[data-testid="country-dropdown"], [aria-label*="Country"], [aria-label*="country"]').first();
    if (await dropdown.isVisible({ timeout: 3000 })) {
      await dropdown.click();
      await page.waitForTimeout(500);
      const usOption = page.locator('text="United States"').first();
      if (await usOption.isVisible({ timeout: 3000 })) {
        await usOption.click();
        logInfo("已选择国家: United States");
        return true;
      }
    }
  } catch { /* ignore */ }

  return false;
}

async function fillFullName(page, name) {
  const nameSelectors = [
    '#billingName',
    'input[name="billingName"]',
    'input[autocomplete="cc-name"]',
    'input[autocomplete="name"]',
  ];

  for (const sel of nameSelectors) {
    if (await safeType(page, sel, name, { timeout: 3000 })) {
      logInfo(`已填写姓名: ${name}`);
      return true;
    }
  }
  return false;
}

async function checkTermsOfService(page) {
  // 参考 GuJumpgate: #termsOfServiceConsentCheckbox
  try {
    const checkbox = page.locator('#termsOfServiceConsentCheckbox, input[name="termsOfServiceConsent"]').first();
    if (await checkbox.isVisible({ timeout: 3000 })) {
      const isChecked = await checkbox.isChecked();
      if (!isChecked) {
        await checkbox.click();
        logInfo("已勾选服务条款");
      }
    }
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// 步骤 7: 验证结果
// ---------------------------------------------------------------------------

async function verifySubscription(page) {
  log(6, "验证订阅结果...");
  await page.waitForTimeout(5000);

  const url = page.url();
  logInfo(`当前 URL: ${url}`);

  if (url.includes("chatgpt.com")) {
    logInfo("已返回 ChatGPT 页面");
  }
  if (url.includes("paypal.com")) {
    logInfo("已跳转到 PayPal 页面，请在 PayPal 中完成支付");
    console.log("");
    console.log("╔══════════════════════════════════════════════════╗");
    console.log("║   请在 PayPal 页面中登录并确认支付                 ║");
    console.log("║   支付完成后会自动返回 ChatGPT                    ║");
    console.log("╚══════════════════════════════════════════════════╝");
    console.log("");
    return "paypal_redirect";
  }
  if (url.includes("success") || url.includes("thank")) {
    log(6, "支付成功！");
    return "success";
  }

  await saveScreenshot(page, "verify-result");
  return "unknown";
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const config = loadConfig();
  const paymentMethod = process.env.PAYMENT === "card" ? "card" : "paypal";
  const autoSubmit = process.env.AUTO_SUBMIT === "true";

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║    ChatGPT Plus 订阅自动化（GuJumpgate 方案）      ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log("");
  console.log(`连接模式: ${process.env.CDP === "true" ? "CDP（连接已打开的浏览器）" : "独立浏览器"}`);
  console.log(`支付方式: ${paymentMethod === "paypal" ? "PayPal（含免费试用 promo）" : "信用卡"}`);
  console.log(`自动提交: ${autoSubmit ? "是" : "否（等待30秒确认）"}`);
  console.log("");

  if (paymentMethod === "paypal") {
    console.log(">>> PayPal 模式：使用 plus-1-month-free promo 获得免费试用");
    console.log(">>> 首月 $0，之后 $20/月（可随时取消）");
    console.log("");
  }

  const { browser, context, isCDP } = await connectBrowser();

  let page;
  if (isCDP) {
    const pages = context.pages();
    page = pages.length > 0 ? pages[0] : await context.newPage();
  } else {
    page = await context.newPage();
  }

  try {
    // 步骤 1: 获取 accessToken
    const accessToken = await getAccessToken(page);

    // 步骤 2: 通过 API 创建 Checkout 会话
    const checkoutInfo = await createCheckoutSession(page, accessToken, paymentMethod);

    // 步骤 3: 打开 Checkout 页面
    await openCheckoutPage(page, checkoutInfo, paymentMethod);

    // 步骤 4: 填写支付信息
    if (paymentMethod === "paypal") {
      await handlePayPalCheckout(page, config);
    } else {
      await handleCardCheckout(page, config);
    }

    // 步骤 5: 提交订阅
    const submitted = await submitSubscription(page, autoSubmit);

    // 步骤 6: 验证结果
    if (submitted) {
      const result = await verifySubscription(page);
      if (result === "paypal_redirect") {
        logInfo("等待 PayPal 支付完成...");
        // 等待从 PayPal 返回（最多 10 分钟）
        try {
          await page.waitForURL((url) => !url.href.includes("paypal.com"), { timeout: 600000 });
          await verifySubscription(page);
        } catch {
          logInfo("PayPal 支付超时，请手动完成");
        }
      }
    }

    console.log("");
    console.log("═══════════════════════════════════════════════════");
    console.log("  流程结束。请检查浏览器确认订阅状态。");
    console.log("═══════════════════════════════════════════════════");
    console.log("");

    if (!isCDP) {
      logInfo("浏览器将在 60 秒后关闭...");
      await page.waitForTimeout(60000);
    }
  } catch (error) {
    console.error("");
    console.error("订阅过程中出错:", error.message);
    await saveScreenshot(page, "error");
  } finally {
    if (!isCDP) {
      await browser.close();
    }
  }
}

main();
