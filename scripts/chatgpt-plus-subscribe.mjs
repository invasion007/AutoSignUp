/**
 * ChatGPT Plus 订阅自动化脚本
 *
 * 自动完成 ChatGPT Plus 的升级/订阅流程：
 *   1. 登录 ChatGPT（已登录则跳过）
 *   2. 导航到升级页面
 *   3. 选择 Plus 计划
 *   4. 在 Stripe Checkout 页面填写支付信息
 *   5. 提交订阅
 *
 * 用法:
 *   node scripts/chatgpt-plus-subscribe.mjs                    # 标准模式
 *   HEADLESS=true node scripts/chatgpt-plus-subscribe.mjs      # 无界面模式
 *   CDP=true node scripts/chatgpt-plus-subscribe.mjs           # CDP 连接已打开的 Chrome
 *
 * 前提:
 *   - 需要一个已登录 ChatGPT 的浏览器会话（CDP模式），或提供登录凭据
 *   - 需要有效的支付信息（信用卡/借记卡）
 *
 * 参考项目:
 *   - zxyyang/plus_gopay_gptp-plus（PayPal 通道自动化）
 *   - DanOps-1/Gpt-Agreement-Payment（协议重放工具集）
 */

import { chromium, devices } from "playwright";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
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
  const config = JSON.parse(readFileSync(configPath, "utf-8"));

  if (!config.payment) {
    console.error("config.json 中缺少 payment（支付信息）配置。");
    console.error("请参考 config.example.json 添加 payment 字段。");
    process.exit(1);
  }

  return config;
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

async function waitAndClick(page, selector, options = {}) {
  const { timeout = 10000, description = selector } = options;
  try {
    await page.waitForSelector(selector, { state: "visible", timeout });
    await page.click(selector);
    logInfo(`已点击: ${description}`);
    return true;
  } catch {
    logInfo(`未找到或无法点击: ${description}`);
    return false;
  }
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
// 步骤 2: 确认已登录 ChatGPT
// ---------------------------------------------------------------------------

async function ensureLoggedIn(page, config) {
  log(1, "检查 ChatGPT 登录状态...");

  await page.goto("https://chatgpt.com", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);

  const currentUrl = page.url();

  if (currentUrl.includes("auth") || currentUrl.includes("login")) {
    log(1, "未登录，尝试使用配置中的凭据登录...");

    if (!config.chatgptLogin) {
      console.error("");
      console.error("=== 需要登录 ChatGPT ===");
      console.error("请在 config.json 中添加 chatgptLogin 配置，或使用 CDP 模式连接已登录的浏览器。");
      console.error("");
      console.error('示例 config.json:');
      console.error('  "chatgptLogin": {');
      console.error('    "email": "your-email@gmail.com",');
      console.error('    "password": "your-password"');
      console.error("  }");
      console.error("");
      console.error("或使用 CDP 模式: CDP=true node scripts/chatgpt-plus-subscribe.mjs");
      process.exit(1);
    }

    await loginChatGPT(page, config.chatgptLogin);
  } else {
    log(1, "已登录 ChatGPT");
  }
}

async function loginChatGPT(page, loginConfig) {
  logInfo("开始 ChatGPT 登录流程...");

  const loginButton = page.locator('button:has-text("Log in"), a:has-text("Log in")').first();
  if (await loginButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await loginButton.click();
    await page.waitForTimeout(2000);
  }

  // Auth0 login page
  const emailInput = page.locator('input[name="email"], input[type="email"], #email-input').first();
  if (await emailInput.isVisible({ timeout: 10000 }).catch(() => false)) {
    await emailInput.fill(loginConfig.email);
    logInfo(`已输入邮箱: ${loginConfig.email}`);

    const continueBtn = page.locator('button[type="submit"], button:has-text("Continue")').first();
    await continueBtn.click();
    await page.waitForTimeout(2000);
  }

  const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
  if (await passwordInput.isVisible({ timeout: 10000 }).catch(() => false)) {
    await passwordInput.fill(loginConfig.password);
    logInfo("已输入密码");

    const submitBtn = page.locator('button[type="submit"], button:has-text("Continue"), button:has-text("Log in")').first();
    await submitBtn.click();
    await page.waitForTimeout(5000);
  }

  const url = page.url();
  if (url.includes("chatgpt.com") && !url.includes("auth")) {
    logInfo("ChatGPT 登录成功！");
  } else {
    logInfo("登录可能需要额外验证（如 CAPTCHA），请检查浏览器");
    await saveScreenshot(page, "login-issue");
  }
}

// ---------------------------------------------------------------------------
// 步骤 3: 导航到升级页面
// ---------------------------------------------------------------------------

async function navigateToUpgrade(page) {
  log(2, "导航到 ChatGPT Plus 升级页面...");

  // 方式1: 直接访问升级页面URL
  await page.goto("https://chatgpt.com/#pricing", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  let foundUpgrade = false;

  // 检查是否在定价页面
  const plusButton = page.locator(
    'button:has-text("Get Plus"), button:has-text("Upgrade to Plus"), button:has-text("Subscribe"), a:has-text("Get Plus"), a:has-text("Upgrade to Plus")'
  ).first();

  if (await plusButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    logInfo("找到 Plus 升级按钮");
    foundUpgrade = true;
  }

  if (!foundUpgrade) {
    // 方式2: 通过侧边栏/设置菜单
    logInfo("尝试通过侧边栏查找升级选项...");

    // 点击头像/设置
    const profileBtn = page.locator(
      'button[aria-label="User menu"], button[data-testid="profile-button"], img[alt="User"]'
    ).first();

    if (await profileBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await profileBtn.click();
      await page.waitForTimeout(1000);
    }

    const upgradeOption = page.locator(
      'a:has-text("Upgrade"), button:has-text("Upgrade"), a:has-text("My plan"), [data-testid="upgrade-button"]'
    ).first();

    if (await upgradeOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await upgradeOption.click();
      await page.waitForTimeout(3000);
      foundUpgrade = true;
    }
  }

  if (!foundUpgrade) {
    // 方式3: 直接访问 settings 页面
    logInfo("尝试通过设置页面...");
    await page.goto("https://chatgpt.com/settings", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    const subscriptionLink = page.locator(
      'a:has-text("Subscription"), a:has-text("Manage subscription"), a:has-text("Upgrade")'
    ).first();

    if (await subscriptionLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await subscriptionLink.click();
      await page.waitForTimeout(3000);
      foundUpgrade = true;
    }
  }

  await saveScreenshot(page, "upgrade-page");
  return foundUpgrade;
}

// ---------------------------------------------------------------------------
// 步骤 4: 选择 Plus 计划并进入 Stripe Checkout
// ---------------------------------------------------------------------------

async function selectPlusPlan(page) {
  log(3, "选择 Plus 计划...");

  // 点击 "Get Plus" / "Upgrade to Plus" / "Subscribe" 按钮
  const selectors = [
    'button:has-text("Get Plus")',
    'button:has-text("Upgrade to Plus")',
    'button:has-text("Subscribe to Plus")',
    'button:has-text("Upgrade")',
    'a:has-text("Get Plus")',
    'a:has-text("Upgrade to Plus")',
    '[data-testid="select-plus-button"]',
  ];

  for (const selector of selectors) {
    const el = page.locator(selector).first();
    if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
      logInfo(`找到按钮: ${selector}`);
      await el.click();
      await page.waitForTimeout(5000);

      const url = page.url();
      logInfo(`当前 URL: ${url}`);

      // 检查是否跳转到 Stripe Checkout
      if (
        url.includes("pay.openai.com") ||
        url.includes("checkout.stripe.com") ||
        url.includes("stripe")
      ) {
        log(3, "已进入 Stripe Checkout 页面！");
        return true;
      }

      // 等待可能的新标签页打开（Stripe checkout 可能在新标签页）
      break;
    }
  }

  // 检查是否有新页面/弹窗打开
  await page.waitForTimeout(3000);
  await saveScreenshot(page, "after-select-plus");

  const url = page.url();
  if (url.includes("pay.openai.com") || url.includes("checkout.stripe.com")) {
    return true;
  }

  logInfo("等待 Stripe Checkout 页面加载...");
  try {
    await page.waitForURL(
      (u) => u.href.includes("pay.openai.com") || u.href.includes("checkout.stripe.com"),
      { timeout: 30000 }
    );
    return true;
  } catch {
    logInfo("未自动跳转到 Stripe Checkout");
    return false;
  }
}

// ---------------------------------------------------------------------------
// 步骤 5: 填写 Stripe Checkout 支付信息
// ---------------------------------------------------------------------------

async function fillStripeCheckout(page, payment) {
  log(4, "填写 Stripe Checkout 支付信息...");

  await page.waitForTimeout(3000);
  await saveScreenshot(page, "stripe-checkout");

  const url = page.url();
  logInfo(`Stripe Checkout URL: ${url}`);

  // --- 邮箱 ---
  if (payment.email) {
    const emailFilled = await safeType(page, '#email, input[name="email"]', payment.email, {
      timeout: 5000,
    });
    if (emailFilled) logInfo(`已填写邮箱: ${payment.email}`);
  }

  // --- 信用卡信息 ---
  // Stripe Checkout 页面的卡号输入可能在 iframe 中
  // 先尝试直接输入（Stripe hosted checkout 通常不用 iframe）

  // 卡号
  let cardFilled = false;

  // 尝试方式1: 直接在页面上输入（Stripe Checkout hosted page）
  cardFilled = await safeType(
    page,
    '#cardNumber, input[name="cardNumber"], input[placeholder*="card number"], input[autocomplete="cc-number"]',
    payment.cardNumber,
    { timeout: 5000 }
  );

  // 尝试方式2: 通过 iframe (Stripe Elements)
  if (!cardFilled) {
    logInfo("尝试通过 Stripe iframe 填写卡号...");
    const frames = page.frames();
    for (const frame of frames) {
      const frameUrl = frame.url();
      if (frameUrl.includes("stripe.com") || frameUrl.includes("js.stripe.com")) {
        const cardInput = frame.locator(
          'input[name="cardnumber"], input[name="cardNumber"], input[placeholder*="card number"]'
        ).first();
        if (await cardInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await cardInput.fill(payment.cardNumber);
          cardFilled = true;
          logInfo("通过 iframe 填写了卡号");
          break;
        }
      }
    }
  }

  if (!cardFilled) {
    logInfo("⚠️ 无法自动填写卡号，请手动输入");
    await saveScreenshot(page, "card-input-issue");
  }

  // 有效期 (MM/YY)
  const expiryFilled = await safeType(
    page,
    '#cardExpiry, input[name="cardExpiry"], input[placeholder*="MM"], input[autocomplete="cc-exp"]',
    payment.expiry,
    { timeout: 3000 }
  );
  if (expiryFilled) logInfo("已填写有效期");

  // CVC
  const cvcFilled = await safeType(
    page,
    '#cardCvc, input[name="cardCvc"], input[placeholder*="CVC"], input[autocomplete="cc-csc"]',
    payment.cvc,
    { timeout: 3000 }
  );
  if (cvcFilled) logInfo("已填写 CVC");

  // 持卡人姓名
  if (payment.cardholderName) {
    const nameFilled = await safeType(
      page,
      '#billingName, input[name="billingName"], input[placeholder*="name on card"], input[autocomplete="cc-name"]',
      payment.cardholderName,
      { timeout: 3000 }
    );
    if (nameFilled) logInfo(`已填写持卡人姓名: ${payment.cardholderName}`);
  }

  // 国家
  if (payment.country) {
    const countrySelect = page.locator(
      '#billingCountry, select[name="billingCountry"], select[name="billingAddressCountry"]'
    ).first();
    if (await countrySelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await countrySelect.selectOption({ label: payment.country });
      logInfo(`已选择国家: ${payment.country}`);
    }
  }

  // 邮政编码
  if (payment.postalCode) {
    const zipFilled = await safeType(
      page,
      '#billingPostalCode, input[name="billingPostalCode"], input[name="postal"], input[placeholder*="ZIP"], input[autocomplete="postal-code"]',
      payment.postalCode,
      { timeout: 3000 }
    );
    if (zipFilled) logInfo(`已填写邮编: ${payment.postalCode}`);
  }

  await saveScreenshot(page, "stripe-filled");
  log(4, "支付信息填写完成");

  return cardFilled;
}

// ---------------------------------------------------------------------------
// 步骤 6: 确认并提交订阅
// ---------------------------------------------------------------------------

async function submitSubscription(page, autoSubmit) {
  log(5, "准备提交订阅...");

  if (!autoSubmit) {
    console.log("");
    console.log("╔══════════════════════════════════════════════════╗");
    console.log("║        请检查支付信息是否正确                       ║");
    console.log("║        确认无误后，脚本将自动提交                    ║");
    console.log("║                                                  ║");
    console.log("║  如果需要手动调整，请在浏览器中修改后               ║");
    console.log("║  等待 30 秒后脚本将自动提交                        ║");
    console.log("╚══════════════════════════════════════════════════╝");
    console.log("");

    await new Promise((r) => setTimeout(r, 30000));
  }

  // 尝试点击提交按钮
  const submitSelectors = [
    'button:has-text("Subscribe")',
    'button:has-text("Pay")',
    'button:has-text("Start subscription")',
    'button:has-text("确认")',
    'button[type="submit"]',
    '.SubmitButton',
    '.SubmitButton-IconContainer',
  ];

  for (const selector of submitSelectors) {
    const btn = page.locator(selector).first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      logInfo(`点击提交按钮: ${selector}`);
      await btn.click();

      log(5, "已提交订阅，等待处理...");
      await page.waitForTimeout(10000);
      await saveScreenshot(page, "after-submit");
      return true;
    }
  }

  logInfo("⚠️ 未找到提交按钮，请手动点击提交");
  await saveScreenshot(page, "no-submit-button");
  return false;
}

// ---------------------------------------------------------------------------
// 步骤 7: 验证订阅结果
// ---------------------------------------------------------------------------

async function verifySubscription(page) {
  log(6, "验证订阅结果...");

  await page.waitForTimeout(5000);
  const url = page.url();
  logInfo(`当前 URL: ${url}`);

  // 检查是否返回 ChatGPT 页面
  if (url.includes("chatgpt.com")) {
    logInfo("已返回 ChatGPT 页面");

    // 检查是否显示 Plus 标识
    const plusBadge = page.locator(
      'text=Plus, [data-testid="plus-badge"], .plus-indicator'
    ).first();
    if (await plusBadge.isVisible({ timeout: 5000 }).catch(() => false)) {
      log(6, "🎉 ChatGPT Plus 订阅成功！");
      return true;
    }
  }

  // 检查 Stripe 成功页面
  if (url.includes("success") || url.includes("thank")) {
    log(6, "🎉 支付成功页面已显示！");
    return true;
  }

  await saveScreenshot(page, "verify-result");
  logInfo("请手动确认订阅是否成功");
  return false;
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const config = loadConfig();
  const payment = config.payment;
  const autoSubmit = process.env.AUTO_SUBMIT === "true";

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║       ChatGPT Plus 订阅自动化工具                  ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log("");
  console.log(`模式: ${process.env.CDP === "true" ? "CDP（连接已打开的浏览器）" : "独立浏览器"}`);
  console.log(`自动提交: ${autoSubmit ? "是" : "否（默认等待30秒后提交）"}`);
  console.log("");

  if (!autoSubmit) {
    console.log("提示: 设置 AUTO_SUBMIT=true 可跳过确认直接提交");
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
    // 步骤 1: 确认已登录
    await ensureLoggedIn(page, config);

    // 步骤 2: 导航到升级页面
    const foundUpgrade = await navigateToUpgrade(page);
    if (!foundUpgrade) {
      logInfo("⚠️ 未找到升级入口，尝试直接选择 Plus 计划...");
    }

    // 步骤 3: 选择 Plus 计划
    const enteredCheckout = await selectPlusPlan(page);
    if (!enteredCheckout) {
      console.error("");
      console.error("=== 无法进入 Stripe Checkout ===");
      console.error("可能的原因：");
      console.error("  1. 账号已经是 Plus 会员");
      console.error("  2. 页面结构已变化，需要更新选择器");
      console.error("  3. 需要额外的验证步骤");
      console.error("");
      console.error("请尝试在浏览器中手动操作，或使用 CDP 模式。");
      await saveScreenshot(page, "checkout-failed");
      process.exit(1);
    }

    // 步骤 4: 填写支付信息
    await fillStripeCheckout(page, payment);

    // 步骤 5: 提交订阅
    const submitted = await submitSubscription(page, autoSubmit);

    // 步骤 6: 验证结果
    if (submitted) {
      await verifySubscription(page);
    }

    console.log("");
    console.log("═══════════════════════════════════════════════════");
    console.log("  流程结束。请检查浏览器确认订阅状态。");
    console.log("═══════════════════════════════════════════════════");
    console.log("");

    // 等待用户查看
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
