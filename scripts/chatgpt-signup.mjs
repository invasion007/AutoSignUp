/**
 * ChatGPT 账号注册脚本 (Playwright + 免费住宅IP代理)
 *
 * 使用方法:
 *   PROXY=socks5://<residential-ip>:<port> EMAIL=<outlook-email> node scripts/chatgpt-signup.mjs
 *
 * 环境变量:
 *   PROXY    - 住宅IP代理地址 (必须, 例: socks5://98.182.147.97:4145)
 *   EMAIL    - Outlook 邮箱地址 (必须)
 *   NAME     - 全名 (默认: David Carter)
 *   AGE      - 年龄 (默认: 35)
 *   HEADLESS - 是否无头模式 (默认: false)
 *
 * 前置要求:
 *   1. 需要一个可用的住宅IP代理 (数据中心IP会被Cloudflare拦截)
 *   2. 免费住宅代理来源: https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000&country=US
 *   3. 用 ip-api.com 验证IP是否为住宅: curl -x socks5://<ip>:<port> http://ip-api.com/json
 *   4. 需要能访问 Outlook 邮箱来获取验证码
 */

import { chromium } from "playwright";

const PROXY = process.env.PROXY;
const EMAIL = process.env.EMAIL;
const NAME = process.env.NAME || "David Carter";
const AGE = process.env.AGE || "35";
const HEADLESS = process.env.HEADLESS === "true";

if (!PROXY) {
  console.error("错误: 请设置 PROXY 环境变量 (例: PROXY=socks5://ip:port)");
  process.exit(1);
}
if (!EMAIL) {
  console.error("错误: 请设置 EMAIL 环境变量");
  process.exit(1);
}

async function verifyResidentialIP(page) {
  console.log("验证代理IP是否为住宅IP...");
  await page.goto("http://ip-api.com/json", { waitUntil: "domcontentloaded" });
  const text = await page.locator("body").textContent();
  const info = JSON.parse(text);
  console.log(`IP: ${info.query} | ISP: ${info.isp} | 城市: ${info.city}, ${info.regionName}`);

  const dcKeywords = ["hosting", "cloud", "server", "data center", "datacenter", "vps", "digital ocean", "amazon", "aws", "google", "microsoft", "azure", "linode", "vultr", "hetzner"];
  const isDC = dcKeywords.some((kw) => (info.isp || "").toLowerCase().includes(kw) || (info.org || "").toLowerCase().includes(kw));

  if (isDC) {
    console.error("警告: 此IP可能是数据中心IP，ChatGPT注册可能会被Cloudflare拦截");
    console.error("建议使用住宅ISP的IP (如 Comcast, AT&T, Cox, Spectrum 等)");
  } else {
    console.log("IP看起来是住宅IP，继续注册...");
  }
  return info;
}

async function navigateToSignup(page) {
  console.log("步骤1: 打开 ChatGPT 登录页...");
  await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);

  const signupBtn = page.locator('[data-testid="login-button"], button:has-text("Sign up"), a:has-text("Sign up")');
  if (await signupBtn.count() > 0) {
    await signupBtn.first().click();
    await page.waitForTimeout(3000);
  }
}

async function enterEmail(page) {
  console.log(`步骤2: 输入邮箱 ${EMAIL}...`);
  const emailInput = page.locator('input[name="email"], input[type="email"]');
  await emailInput.waitFor({ timeout: 15000 });
  await emailInput.fill(EMAIL);
  await page.waitForTimeout(500);

  const continueBtn = page.locator('button[type="submit"], button:has-text("Continue")');
  const buttons = await continueBtn.all();
  for (const btn of buttons) {
    const text = await btn.textContent();
    if (text && text.includes("Continue") && !text.includes("Google") && !text.includes("Microsoft") && !text.includes("Apple")) {
      await btn.click();
      break;
    }
  }
  await page.waitForTimeout(5000);
}

async function waitForVerificationCode(page) {
  console.log("步骤3: 等待邮箱验证码...");
  console.log("请检查 Outlook 邮箱获取验证码");
  console.log(`邮箱: ${EMAIL}`);
  console.log("提示: 验证码邮件来自 ChatGPT，主题为 'Your temporary ChatGPT verification code'");
  console.log("");
  console.log("在浏览器中手动输入验证码，然后按 Continue");
  console.log("等待页面跳转...");

  await page.waitForURL(/about-you|create-account/, { timeout: 300000 });
  console.log("验证码已通过！");
}

async function fillProfile(page) {
  console.log(`步骤4: 填写个人信息 (姓名: ${NAME}, 年龄: ${AGE})...`);
  await page.waitForTimeout(2000);

  const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first();
  if (await nameInput.count() > 0) {
    await nameInput.fill(NAME);
  }

  const ageInput = page.locator('input[name="age"], input[placeholder*="age" i]').first();
  if (await ageInput.count() > 0) {
    await ageInput.fill(AGE);
  }
  await page.waitForTimeout(500);

  const finishBtn = page.locator('button:has-text("Finish creating account")');
  if (await finishBtn.count() > 0) {
    await finishBtn.click();
    await page.waitForTimeout(5000);
  }
}

async function skipPasskey(page) {
  console.log("步骤5: 跳过 Passkey 设置...");
  const skipBtn = page.locator('button:has-text("Skip"), a:has-text("Skip")');
  if (await skipBtn.count() > 0) {
    await skipBtn.first().click();
    await page.waitForTimeout(5000);
  }
}

async function verifySuccess(page) {
  console.log("步骤6: 验证注册成功...");
  const url = page.url();
  if (url.includes("chatgpt.com")) {
    console.log("注册成功！已进入 ChatGPT 主页面");
    return true;
  }
  console.log(`当前URL: ${url}`);
  return false;
}

(async () => {
  console.log("=== ChatGPT 注册脚本 ===");
  console.log(`代理: ${PROXY}`);
  console.log(`邮箱: ${EMAIL}`);
  console.log("");

  const browser = await chromium.launch({
    headless: HEADLESS,
    proxy: { server: PROXY },
    args: [
      "--disable-blink-features=AutomationControlled",
      "--ignore-certificate-errors",
      "--start-maximized",
    ],
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    viewport: null,
  });

  const page = await context.newPage();

  try {
    await verifyResidentialIP(page);
    await navigateToSignup(page);
    await enterEmail(page);
    await waitForVerificationCode(page);
    await fillProfile(page);
    await skipPasskey(page);
    const success = await verifySuccess(page);

    if (success) {
      console.log("");
      console.log("=== 注册完成 ===");
      console.log(`账号: ${EMAIL}`);
      console.log("登录方式: 邮箱验证码 (无密码)");
      console.log("请保存好账号信息");
    }
  } catch (err) {
    console.error("注册过程出错:", err.message);
    const screenshot = `screenshots/chatgpt-error-${Date.now()}.png`;
    await page.screenshot({ path: screenshot });
    console.error(`错误截图已保存: ${screenshot}`);
  }

  console.log("按 Ctrl+C 关闭浏览器...");
  await new Promise(() => {});
})();
