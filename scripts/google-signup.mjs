/**
 * Google 账号自动注册脚本
 *
 * 支持两种模式：
 *   1. 桌面模式（默认）：可能遇到 QR 码验证
 *   2. 移动模式（推荐）：模拟 Pixel 手机，获得 SMS 短信验证而非 QR 码
 *
 * 用法:
 *   node scripts/google-signup.mjs                       # 移动模式（推荐）
 *   MOBILE=false node scripts/google-signup.mjs          # 桌面模式
 *   HEADLESS=true node scripts/google-signup.mjs         # 无界面模式
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

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

async function waitForNavigation(page, urlFragment, timeout = 30000) {
  await page.waitForURL(`**/${urlFragment}**`, { timeout });
}

async function clickDropdownOption(page, dropdownSelector, optionText) {
  await page.click(dropdownSelector);
  await page.waitForTimeout(500);
  const option = page.locator(`li`).filter({ hasText: optionText }).first();
  await option.click();
  await page.waitForTimeout(300);
}

function log(step, message) {
  const timestamp = new Date().toLocaleTimeString("zh-CN");
  console.log(`[${timestamp}] 步骤 ${step}: ${message}`);
}

// ---------------------------------------------------------------------------
// 注册步骤
// ---------------------------------------------------------------------------

/**
 * 步骤 1: 输入姓名
 * URL: /signup/name
 */
async function stepName(page, config) {
  log(1, "输入姓名...");
  await waitForNavigation(page, "signup/name");

  await page.fill('input[name="firstName"]', config.firstName);
  if (config.lastName) {
    await page.fill('input[name="lastName"]', config.lastName);
  }

  await page.click('button:has-text("Next")');
  log(1, `姓名已填写: ${config.firstName} ${config.lastName || ""}`);
}

/**
 * 步骤 2: 选择生日和性别
 * URL: /signup/birthdaygender
 */
async function stepBirthdayGender(page, config) {
  log(2, "填写生日和性别...");
  await waitForNavigation(page, "signup/birthdaygender");

  // 选择月份 — 使用 JS 点击 section 内的第一个下拉框，避免误击 footer 语言选择器
  await page.evaluate(() => {
    const section = document.querySelector("section");
    const dropdowns = section.querySelectorAll("div[aria-expanded]");
    if (dropdowns[0]) dropdowns[0].click();
  });
  await page.waitForTimeout(1000);
  await page.evaluate((month) => {
    const items = document.querySelectorAll("li");
    for (const li of items) {
      if (li.textContent.trim() === month) { li.click(); break; }
    }
  }, config.birthday.month);
  await page.waitForTimeout(500);

  // 填写日期和年份
  await page.fill('input[name="day"]', config.birthday.day);
  await page.fill('input[name="year"]', config.birthday.year);

  // 选择性别 — 使用 JS 点击 section 内的第二个下拉框
  await page.evaluate(() => {
    const section = document.querySelector("section");
    const dropdowns = section.querySelectorAll("div[aria-expanded]");
    if (dropdowns.length >= 2) dropdowns[1].click();
  });
  await page.waitForTimeout(1000);
  await page.evaluate((gender) => {
    const items = document.querySelectorAll("li");
    for (const li of items) {
      if (li.textContent.trim() === gender) { li.click(); break; }
    }
  }, config.gender);
  await page.waitForTimeout(500);

  await page.click('button:has-text("Next")');
  log(2, `生日: ${config.birthday.month} ${config.birthday.day}, ${config.birthday.year} | 性别: ${config.gender}`);
}

/**
 * 步骤 3: 选择用户名
 * URL: /signup/username
 */
async function stepUsername(page, config) {
  log(3, "设置用户名...");
  await waitForNavigation(page, "signup/username");

  await page.fill('input[name="Username"]', config.username);
  await page.click('button:has-text("Next")');
  log(3, `用户名: ${config.username}@gmail.com`);
}

/**
 * 步骤 4: 设置密码
 * URL: /signup/password
 */
async function stepPassword(page, config) {
  log(4, "设置密码...");
  await waitForNavigation(page, "signup/password");

  await page.fill('input[name="Passwd"]', config.password);
  await page.fill('input[name="PasswdAgain"]', config.password);
  await page.click('button:has-text("Next")');
  log(4, "密码已设置");
}

/**
 * 步骤 5: 验证（根据模式不同会有不同的验证方式）
 *
 * 桌面模式：QR 码扫描验证 (mophoneverification)
 * 移动模式：SMS 短信验证 (devicephoneverification)
 */
async function stepVerification(page) {
  const currentUrl = page.url();

  if (currentUrl.includes("devicephoneverification")) {
    // 移动模式 — SMS 短信验证
    log(5, "到达 SMS 短信验证步骤");
    console.log("");
    console.log("=== SMS 短信验证 ===");
    console.log("页面显示「Verify your phone number」");
    console.log("点击「Send SMS」后，Google 会向模拟设备发送验证短信。");
    console.log("由于这是模拟设备，需要使用虚拟号码服务接收短信。");
    console.log("");
    console.log("建议的虚拟号码服务（仅供参考）：");
    console.log("  - sms-activate.org");
    console.log("  - 5sim.net");
    console.log("  - onlinesim.io");
    console.log("");
    console.log("等待验证完成...");

    await page.waitForURL(
      (url) =>
        !url.pathname.includes("phoneverification") &&
        !url.pathname.includes("devicephoneverification"),
      { timeout: 600000 }
    );
    log(5, "SMS 验证已完成！");
  } else if (currentUrl.includes("mophoneverification") || currentUrl.includes("crossflowverification")) {
    // 桌面模式 — QR 码验证
    log(5, "到达 QR 码验证步骤 - 需要手动扫码！");
    console.log("");
    console.log("=== QR 码验证 ===");
    console.log("1. 打开手机相机 App");
    console.log("2. 扫描屏幕上的 QR 码");
    console.log("3. 按照手机上的提示完成验证");
    console.log("4. 验证完成后脚本将自动继续");
    console.log("");
    console.log("提示：使用 MOBILE=true（默认）模式可获得 SMS 验证而非 QR 码");
    console.log("");

    await page.waitForURL(
      (url) =>
        !url.pathname.includes("mophoneverification") &&
        !url.pathname.includes("crossflowverification"),
      { timeout: 600000 }
    );
    log(5, "QR 码验证已完成！");
  } else {
    log(5, "未检测到已知验证页面，继续...");
  }
}

/**
 * 步骤 6: 添加恢复邮箱（可选步骤）
 */
async function stepRecoveryEmail(page) {
  const currentUrl = page.url();

  if (currentUrl.includes("recoveryemail") || currentUrl.includes("recovery")) {
    log(6, "跳过恢复邮箱...");
    const skipButton = page.locator('button:has-text("Skip")');
    if (await skipButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipButton.click();
      log(6, "已跳过恢复邮箱");
    }
  }
}

/**
 * 步骤 7: 同意服务条款
 */
async function stepTerms(page) {
  const currentUrl = page.url();

  if (currentUrl.includes("tos") || currentUrl.includes("terms")) {
    log(7, "同意服务条款...");
    const agreeButton = page.locator('button:has-text("I agree")');
    if (await agreeButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await agreeButton.click();
      log(7, "已同意服务条款");
    }
  }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const config = loadConfig();
  const headless = process.env.HEADLESS === "true";
  const useMobile = process.env.MOBILE !== "false"; // 默认使用移动模式

  console.log("开始 Google 账号注册流程...");
  console.log(`模式: ${useMobile ? "移动设备模拟 (Pixel 7)" : "桌面"}`);
  console.log(`界面: ${headless ? "无界面" : "有界面"}`);
  console.log("");

  if (useMobile) {
    console.log(">>> 移动模式：Google 会使用 SMS 短信验证（而非 QR 码）");
    console.log("");
  }

  const proxyServer = process.env.PROXY || "";
  const launchOptions = {
    headless,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
  };
  if (proxyServer) {
    launchOptions.proxy = { server: proxyServer };
    console.log(`代理: ${proxyServer}`);
  }

  const browser = await chromium.launch(launchOptions);

  const contextOptions = useMobile
    ? {
        ...devices["Pixel 7"],
        locale: "en-US",
      }
    : {
        locale: "en-US",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      };

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  try {
    log(0, "打开 Google 注册页面...");
    await page.goto("https://accounts.google.com/signup", {
      waitUntil: "networkidle",
    });

    await stepName(page, config);
    await stepBirthdayGender(page, config);
    await stepUsername(page, config);
    await stepPassword(page, config);

    // 等待页面跳转到验证步骤
    await page.waitForTimeout(2000);
    const currentUrl = page.url();
    if (
      currentUrl.includes("phoneverification") ||
      currentUrl.includes("mophoneverification") ||
      currentUrl.includes("crossflowverification") ||
      currentUrl.includes("devicephoneverification")
    ) {
      await stepVerification(page);
    }

    await stepRecoveryEmail(page);
    await stepTerms(page);

    console.log("");
    console.log("注册流程完成！");
    console.log(`邮箱地址: ${config.username}@gmail.com`);

    await page.waitForTimeout(5000);
  } catch (error) {
    console.error("");
    console.error("注册过程中出错:", error.message);

    const screenshotDir = resolve(PROJECT_ROOT, "screenshots");
    mkdirSync(screenshotDir, { recursive: true });
    const screenshotPath = resolve(screenshotDir, "error.png");
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    console.error(`错误截图已保存: ${screenshotPath}`);
  } finally {
    await browser.close();
  }
}

main();
