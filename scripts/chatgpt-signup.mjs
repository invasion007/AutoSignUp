/**
 * ChatGPT 账号自动注册脚本
 *
 * 参考 GuJumpgate (FoundZiGu/GuJumpgate) 的注册流程实现。
 * 使用 Playwright 自动化 ChatGPT/OpenAI 账号注册。
 *
 * 注册流程:
 *   1. 打开 ChatGPT 官网
 *   2. 点击注册，输入邮箱
 *   3. 填写密码
 *   4. 获取并填写邮箱验证码（需手动输入或通过 IMAP 自动获取）
 *   5. 填写姓名和生日
 *   6. 等待注册成功
 *
 * 用法:
 *   node scripts/chatgpt-signup.mjs                         # 标准模式
 *   HEADLESS=true node scripts/chatgpt-signup.mjs           # 无界面模式
 *   USE_CDP=true node scripts/chatgpt-signup.mjs            # CDP 模式（连接已有浏览器）
 *
 * 代理支持:
 *   PROXY_SERVER=http://host:port node scripts/chatgpt-signup.mjs
 *   PROXY_USERNAME=user PROXY_PASSWORD=pass PROXY_SERVER=http://host:port node scripts/chatgpt-signup.mjs
 *
 * 环境变量:
 *   HEADLESS       - 是否无界面 (default: false)
 *   USE_CDP        - 是否通过 CDP 连接已打开的 Chrome (default: false)
 *   CDP_URL        - CDP 端点地址 (default: http://localhost:29229)
 *   PROXY_SERVER   - 代理服务器地址 (例: http://host:port 或 socks5://host:port)
 *   PROXY_USERNAME - 代理用户名
 *   PROXY_PASSWORD - 代理密码
 */

import { chromium } from "playwright";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------

function loadConfig() {
  const configPath = resolve(PROJECT_ROOT, "config.chatgpt.json");
  if (!existsSync(configPath)) {
    console.error("未找到 config.chatgpt.json，请先复制 config.chatgpt.example.json 并填写信息：");
    console.error("   cp config.chatgpt.example.json config.chatgpt.json");
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
  console.log(`[${timestamp}] ${message}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function takeScreenshot(page, name) {
  const screenshotDir = resolve(PROJECT_ROOT, "screenshots");
  mkdirSync(screenshotDir, { recursive: true });
  const screenshotPath = resolve(screenshotDir, `${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  return screenshotPath;
}

async function safeClick(page, selector, options = {}) {
  const { timeout = 10000, description = selector } = options;
  try {
    const element = page.locator(selector).first();
    await element.waitFor({ state: "visible", timeout });
    await element.click();
    return true;
  } catch {
    logInfo(`未找到按钮: ${description}`);
    return false;
  }
}

async function safeFill(page, selector, value, options = {}) {
  const { timeout = 10000, description = selector } = options;
  try {
    const element = page.locator(selector).first();
    await element.waitFor({ state: "visible", timeout });
    await element.fill(value);
    return true;
  } catch {
    logInfo(`未找到输入框: ${description}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// 注册步骤
// ---------------------------------------------------------------------------

/**
 * 步骤 1: 打开 ChatGPT 官网并进入注册页面
 */
async function stepOpenSignup(page) {
  log(1, "打开 ChatGPT 官网...");
  await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(3000);

  const currentUrl = page.url();
  logInfo(`当前 URL: ${currentUrl}`);

  // 检查是否已经在 auth 页面
  if (currentUrl.includes("auth.openai.com") || currentUrl.includes("auth0.openai.com")) {
    log(1, "已跳转到认证页面");
    return;
  }

  // 尝试点击 "Sign up" 按钮
  const signupSelectors = [
    'a:has-text("Sign up")',
    'button:has-text("Sign up")',
    '[data-testid="signup-button"]',
    'a:has-text("注册")',
    'button:has-text("注册")',
    'a:has-text("Get started")',
    'button:has-text("Get started")',
    'a:has-text("Create account")',
  ];

  let clicked = false;
  for (const selector of signupSelectors) {
    clicked = await safeClick(page, selector, { timeout: 3000, description: "Sign up" });
    if (clicked) break;
  }

  if (!clicked) {
    // 直接导航到注册 URL
    log(1, "未找到注册按钮，直接导航到注册页面...");
    await page.goto("https://chatgpt.com/auth/login?screen_hint=signup", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
  }

  await sleep(3000);
  log(1, `注册页面已打开 (${page.url()})`);
}

/**
 * 步骤 2: 输入邮箱地址
 *
 * ChatGPT 注册页面的邮箱输入框选择器参考 GuJumpgate:
 *   - input[name="email"]
 *   - input[type="email"]
 *   - input[autocomplete="email"]
 *   - input[autocomplete="username"]
 */
async function stepEnterEmail(page, config) {
  log(2, "输入邮箱地址...");

  const emailSelectors = [
    'input[name="email"]',
    'input[type="email"]',
    'input[autocomplete="email"]',
    'input[autocomplete="username"]',
    'input[id*="email"]',
    'input[placeholder*="email" i]',
    'input[placeholder*="邮箱"]',
  ];

  let filled = false;
  for (const selector of emailSelectors) {
    filled = await safeFill(page, selector, config.email, { timeout: 3000, description: "邮箱输入框" });
    if (filled) break;
  }

  if (!filled) {
    // 有时需要先切换到邮箱注册模式
    await safeClick(page, 'button:has-text("Continue with email")', { timeout: 3000 });
    await sleep(1500);
    for (const selector of emailSelectors) {
      filled = await safeFill(page, selector, config.email, { timeout: 3000, description: "邮箱输入框" });
      if (filled) break;
    }
  }

  if (!filled) {
    const screenshotPath = await takeScreenshot(page, "step2-email-not-found");
    throw new Error(`未找到邮箱输入框。截图: ${screenshotPath}`);
  }

  await sleep(800);

  // 点击 Continue / 继续按钮
  const continueSelectors = [
    'button:has-text("Continue")',
    'button:has-text("继续")',
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Sign up")',
    'button:has-text("Next")',
  ];

  let clickedContinue = false;
  for (const selector of continueSelectors) {
    clickedContinue = await safeClick(page, selector, { timeout: 3000, description: "Continue" });
    if (clickedContinue) break;
  }

  await sleep(2000);
  log(2, `邮箱已输入: ${config.email}`);
}

/**
 * 步骤 3: 填写密码
 *
 * 密码输入框选择器参考 GuJumpgate:
 *   - input[type="password"]
 *   - input[name="password"]
 *   - input[autocomplete="new-password"]
 */
async function stepEnterPassword(page, config) {
  log(3, "填写密码...");

  const passwordSelectors = [
    'input[type="password"]',
    'input[name="password"]',
    'input[autocomplete="new-password"]',
    'input[autocomplete="current-password"]',
  ];

  let filled = false;
  for (const selector of passwordSelectors) {
    filled = await safeFill(page, selector, config.password, { timeout: 10000, description: "密码输入框" });
    if (filled) break;
  }

  if (!filled) {
    const screenshotPath = await takeScreenshot(page, "step3-password-not-found");
    throw new Error(`未找到密码输入框。截图: ${screenshotPath}`);
  }

  await sleep(800);

  // 点击 Continue / 注册按钮
  const submitSelectors = [
    'button:has-text("Continue")',
    'button:has-text("继续")',
    'button:has-text("Sign up")',
    'button:has-text("注册")',
    'button:has-text("Create account")',
    'button[type="submit"]',
  ];

  let clickedSubmit = false;
  for (const selector of submitSelectors) {
    clickedSubmit = await safeClick(page, selector, { timeout: 3000, description: "Submit password" });
    if (clickedSubmit) break;
  }

  await sleep(3000);
  log(3, "密码已填写并提交");
}

/**
 * 步骤 4: 获取并填写邮箱验证码
 *
 * 验证码输入框选择器参考 GuJumpgate:
 *   - input[name="code"]
 *   - input[name="otp"]
 *   - input[autocomplete="one-time-code"]
 *   - input[type="text"][maxlength="6"]
 *   - input[inputmode="numeric"]
 *
 * 也支持分格输入（每格一个数字）
 */
async function stepVerificationCode(page) {
  log(4, "等待验证码页面...");

  // 等待验证码输入框出现
  const codeSelectors = [
    'input[name="code"]',
    'input[name="otp"]',
    'input[autocomplete="one-time-code"]',
    'input[type="text"][maxlength="6"]',
    'input[type="tel"][maxlength="6"]',
    'input[inputmode="numeric"]',
  ];

  let codeInput = null;
  let isSplitInput = false;

  // 等待验证码页面加载
  for (let attempt = 0; attempt < 30; attempt++) {
    // 检查单输入框
    for (const selector of codeSelectors) {
      try {
        const el = page.locator(selector).first();
        if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
          codeInput = el;
          break;
        }
      } catch {
        // continue
      }
    }
    if (codeInput) break;

    // 检查分格输入（每格一个字符）
    const splitInputs = page.locator('input[maxlength="1"]');
    const splitCount = await splitInputs.count().catch(() => 0);
    if (splitCount >= 4) {
      isSplitInput = true;
      break;
    }

    // 检查是否已经跳过验证码（某些情况下不需要）
    const currentUrl = page.url();
    if (currentUrl.includes("profile") || currentUrl.includes("name") || currentUrl.includes("onboarding")) {
      log(4, "验证码步骤已自动跳过");
      return;
    }

    await sleep(1000);
  }

  if (!codeInput && !isSplitInput) {
    const screenshotPath = await takeScreenshot(page, "step4-code-not-found");
    log(4, `验证码输入框未出现，可能页面结构已变化。截图: ${screenshotPath}`);
    // 不抛错，让用户在有界面模式下手动处理
    console.log("");
    console.log("=== 手动验证 ===");
    console.log("请在浏览器中手动完成验证步骤。");
    console.log("脚本将等待页面跳转...");
    await waitForUrlChange(page, 300000);
    return;
  }

  // 提示用户输入验证码
  console.log("");
  console.log("=== 邮箱验证码 ===");
  console.log("OpenAI 已向你的邮箱发送了 6 位验证码。");
  console.log("请查收邮件并输入验证码。");
  console.log("");

  const code = await prompt("请输入 6 位验证码: ");

  if (!code || code.length < 4) {
    throw new Error("验证码无效");
  }

  if (isSplitInput) {
    // 分格输入
    const splitInputs = page.locator('input[maxlength="1"]');
    const count = await splitInputs.count();
    for (let i = 0; i < Math.min(count, code.length); i++) {
      await splitInputs.nth(i).fill(code[i]);
      await sleep(100);
    }
  } else {
    await codeInput.fill(code);
  }

  await sleep(1000);

  // 尝试点击验证按钮
  const verifySelectors = [
    'button:has-text("Continue")',
    'button:has-text("Verify")',
    'button:has-text("验证")',
    'button[type="submit"]',
  ];

  for (const selector of verifySelectors) {
    const clicked = await safeClick(page, selector, { timeout: 2000, description: "Verify" });
    if (clicked) break;
  }

  await sleep(3000);
  log(4, "验证码已提交");
}

/**
 * 步骤 5: 填写姓名和生日
 *
 * ChatGPT 注册页面的姓名/生日选择器参考 GuJumpgate:
 *   - 姓名: input[name="name"] (全名，单个字段)
 *   - 生日: date spinners 或 input[name="birthday"] 或 input[name="age"]
 */
async function stepFillProfile(page, config) {
  log(5, "填写个人资料...");
  await sleep(2000);

  const currentUrl = page.url();
  logInfo(`当前 URL: ${currentUrl}`);

  // 检查是否需要填写资料
  if (!currentUrl.includes("profile") && !currentUrl.includes("name") && !currentUrl.includes("onboarding") && !currentUrl.includes("auth")) {
    log(5, "不在资料填写页面，可能已跳过此步骤");
    return;
  }

  const fullName = `${config.firstName} ${config.lastName || ""}`.trim();

  // 尝试填写全名（单字段）
  const nameSelectors = [
    'input[name="name"]',
    'input[placeholder*="全名"]',
    'input[placeholder*="Full name" i]',
    'input[placeholder*="Name" i]',
    'input[autocomplete="name"]',
  ];

  let filledName = false;
  for (const selector of nameSelectors) {
    filledName = await safeFill(page, selector, fullName, { timeout: 5000, description: "姓名输入框" });
    if (filledName) break;
  }

  if (!filledName) {
    // 分开的名/姓字段
    await safeFill(page, 'input[name="firstName"]', config.firstName, { timeout: 3000 });
    await safeFill(page, 'input[name="lastName"]', config.lastName || "", { timeout: 3000 });
  }

  log(5, `姓名已填写: ${fullName}`);

  // 填写生日/年龄
  if (config.birthday) {
    const { year, month, day } = config.birthday;

    // 方式 1: 隐藏的 birthday 输入框
    const birthdayInput = page.locator('input[name="birthday"]');
    if (await birthdayInput.count() > 0) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      await birthdayInput.evaluate((el, val) => {
        el.value = val;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }, dateStr);
      log(5, `生日已填写: ${dateStr}`);
    }

    // 方式 2: 下拉选择器 (React Aria DateField)
    const yearSpinner = page.locator('[role="spinbutton"][data-type="year"]');
    const monthSpinner = page.locator('[role="spinbutton"][data-type="month"]');
    const daySpinner = page.locator('[role="spinbutton"][data-type="day"]');

    if (await yearSpinner.isVisible({ timeout: 2000 }).catch(() => false)) {
      await yearSpinner.fill(String(year));
      await sleep(300);
      await monthSpinner.fill(String(month));
      await sleep(300);
      await daySpinner.fill(String(day));
      log(5, `生日已通过 spinbutton 填写: ${year}-${month}-${day}`);
    }
  }

  // 填写年龄（某些版本使用年龄字段代替生日）
  if (config.age || config.birthday?.year) {
    const ageInput = page.locator('input[name="age"]');
    if (await ageInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      const age = config.age || (new Date().getFullYear() - Number(config.birthday.year));
      await ageInput.fill(String(age));
      log(5, `年龄已填写: ${age}`);
    }
  }

  await sleep(1000);

  // 点击 Continue
  const continueSelectors = [
    'button:has-text("Continue")',
    'button:has-text("继续")',
    'button:has-text("Agree")',
    'button:has-text("同意")',
    'button[type="submit"]',
  ];

  for (const selector of continueSelectors) {
    const clicked = await safeClick(page, selector, { timeout: 3000, description: "Continue" });
    if (clicked) break;
  }

  await sleep(3000);
  log(5, "个人资料已提交");
}

/**
 * 步骤 6: 等待注册成功
 */
async function stepWaitForSuccess(page, config) {
  log(6, "等待注册完成...");

  // 等待跳转到 ChatGPT 主页或确认页面
  const maxWaitMs = 120000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const currentUrl = page.url();

    // 成功标志
    if (
      currentUrl.includes("chatgpt.com") && !currentUrl.includes("auth") ||
      currentUrl.includes("chat.openai.com") && !currentUrl.includes("auth")
    ) {
      log(6, "注册成功！已跳转到 ChatGPT 主页。");

      // 保存账号信息
      saveAccountInfo(config);
      return true;
    }

    // 可能还有额外步骤（如服务条款）
    await safeClick(page, 'button:has-text("Okay")', { timeout: 1000 });
    await safeClick(page, 'button:has-text("好的")', { timeout: 1000 });
    await safeClick(page, 'button:has-text("Continue")', { timeout: 1000 });
    await safeClick(page, 'button:has-text("Next")', { timeout: 1000 });
    await safeClick(page, 'button:has-text("Done")', { timeout: 1000 });

    await sleep(2000);
  }

  const screenshotPath = await takeScreenshot(page, "step6-timeout");
  log(6, `等待超时，请查看截图: ${screenshotPath}`);
  return false;
}

/**
 * 等待 URL 变化
 */
async function waitForUrlChange(page, timeoutMs = 60000) {
  const startUrl = page.url();
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (page.url() !== startUrl) return;
    await sleep(1000);
  }
}

/**
 * 保存账号信息到 accounts/ACCOUNTS.md
 */
function saveAccountInfo(config) {
  const accountsPath = resolve(PROJECT_ROOT, "accounts", "ACCOUNTS.md");
  const date = new Date().toISOString().split("T")[0];

  const entry = `

---

## ChatGPT 账号

| 项目 | 内容 |
|------|------|
| **邮箱地址** | ${config.email} |
| **密码** | ${config.password} |
| **姓名** | ${config.firstName} ${config.lastName || ""} |
| **创建日期** | ${date} |
| **状态** | 待确认 |

### 用途
- ChatGPT 免费版账号
`;

  try {
    if (existsSync(accountsPath)) {
      const existing = readFileSync(accountsPath, "utf-8");
      writeFileSync(accountsPath, existing + entry);
    } else {
      writeFileSync(accountsPath, "# 已创建的账号\n" + entry);
    }
    logInfo(`账号信息已保存到 ${accountsPath}`);
  } catch (err) {
    logInfo(`保存账号信息失败: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const config = loadConfig();
  const headless = process.env.HEADLESS === "true";
  const useCDP = process.env.USE_CDP === "true";
  const cdpUrl = process.env.CDP_URL || "http://localhost:29229";
  const proxyServer = process.env.PROXY_SERVER || config.proxy?.server || "";
  const proxyUsername = process.env.PROXY_USERNAME || config.proxy?.username || "";
  const proxyPassword = process.env.PROXY_PASSWORD || config.proxy?.password || "";

  console.log("=========================================");
  console.log("  ChatGPT 账号自动注册工具");
  console.log("  参考: GuJumpgate (FoundZiGu/GuJumpgate)");
  console.log("=========================================");
  console.log("");
  console.log(`邮箱: ${config.email}`);
  console.log(`模式: ${useCDP ? "CDP (连接已有浏览器)" : headless ? "无界面" : "有界面"}`);
  if (proxyServer) {
    console.log(`代理: ${proxyServer}`);
  } else {
    console.log("代理: 无（注意：数据中心 IP 可能被检测拦截）");
    console.log("提示: 使用住宅代理可降低被拦截概率");
    console.log("      例: PROXY_SERVER=http://host:port node scripts/chatgpt-signup.mjs");
  }
  console.log("");

  let browser;
  let context;

  if (useCDP) {
    logInfo(`通过 CDP 连接浏览器: ${cdpUrl}`);
    browser = await chromium.connectOverCDP(cdpUrl);
    const contexts = browser.contexts();
    context = contexts[0] || await browser.newContext();
  } else {
    const launchOptions = {
      headless,
      args: [
        "--no-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
      ],
    };

    if (proxyServer) {
      launchOptions.proxy = { server: proxyServer };
      if (proxyUsername) {
        launchOptions.proxy.username = proxyUsername;
        launchOptions.proxy.password = proxyPassword;
      }
    }

    browser = await chromium.launch(launchOptions);

    const contextOptions = {
      locale: "en-US",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
    };

    context = await browser.newContext(contextOptions);
  }

  const page = useCDP
    ? context.pages()[0] || await context.newPage()
    : await context.newPage();

  try {
    await stepOpenSignup(page);
    await stepEnterEmail(page, config);
    await stepEnterPassword(page, config);
    await stepVerificationCode(page);
    await stepFillProfile(page, config);
    const success = await stepWaitForSuccess(page, config);

    console.log("");
    if (success) {
      console.log("========================================");
      console.log("  注册流程完成！");
      console.log(`  邮箱: ${config.email}`);
      console.log("========================================");
    } else {
      console.log("注册流程未能完全完成，请查看 screenshots/ 目录。");
    }

    // 保持浏览器打开一段时间
    if (!headless && !useCDP) {
      console.log("浏览器将在 30 秒后关闭...");
      await sleep(30000);
    }
  } catch (error) {
    console.error("");
    console.error("注册过程中出错:", error.message);
    const screenshotPath = await takeScreenshot(page, "error");
    console.error(`错误截图已保存: ${screenshotPath}`);
  } finally {
    if (!useCDP) {
      await browser.close();
    }
  }
}

main();
