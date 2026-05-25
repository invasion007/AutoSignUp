/**
 * Fully automated Google registration with hero-sms.com API integration.
 * Polls for SMS verification code automatically.
 */

import { chromium, devices } from "playwright";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import https from "https";
import http from "http";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname);

// Configuration
const HERO_SMS_API_KEY = "86e4451c952e1cc851fA3323f557527A";
const ACTIVATION_ID = process.env.ACTIVATION_ID || "415120246";
const PHONE_NUMBER = process.env.PHONE || "+6283196756844";

// Proxy settings (Webshare) - set PROXY env var to use, otherwise direct connection
const PROXY_SERVER = process.env.PROXY || "";
const PROXY_USER = process.env.PROXY_USER || "";
const PROXY_PASS = process.env.PROXY_PASS || "";

function log(step, msg) {
  console.log(`[${new Date().toLocaleTimeString()}] Step ${step}: ${msg}`);
}

// Hero-SMS API helper
async function heroSmsApi(action, params = {}) {
  const url = new URL("https://hero-sms.com/stubs/handler_api.php");
  url.searchParams.set("action", action);
  url.searchParams.set("api_key", HERO_SMS_API_KEY);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  
  return new Promise((resolve, reject) => {
    https.get(url.toString(), (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

// Poll for SMS code
async function pollForSmsCode(activationId, maxAttempts = 60, interval = 5000) {
  log("SMS", `Polling for verification code (activation ${activationId})...`);
  
  for (let i = 0; i < maxAttempts; i++) {
    const result = await heroSmsApi("getActiveActivations");
    console.log(`  Poll ${i + 1}/${maxAttempts}: ${result.substring(0, 200)}`);
    
    try {
      const data = JSON.parse(result);
      if (data.activeActivations) {
        const activation = data.activeActivations.find(a => a.activationId === String(activationId));
        if (activation && activation.smsCode) {
          log("SMS", `Got code: ${activation.smsCode}`);
          return activation.smsCode;
        }
      }
    } catch(e) {
      // Response might be in simple text format like STATUS_WAIT_CODE
      if (result.includes("STATUS_OK")) {
        const code = result.split(":")[1];
        if (code) {
          log("SMS", `Got code: ${code}`);
          return code;
        }
      }
    }
    
    // Also try getStatus for this specific activation
    const statusResult = await heroSmsApi("getStatus", { id: activationId });
    console.log(`  Status: ${statusResult}`);
    
    if (statusResult.startsWith("STATUS_OK:")) {
      const code = statusResult.split(":")[1];
      log("SMS", `Got code from status: ${code}`);
      return code;
    }
    
    if (statusResult === "STATUS_CANCEL") {
      log("SMS", "Activation was cancelled!");
      return null;
    }
    
    await new Promise(r => setTimeout(r, interval));
  }
  
  log("SMS", "Timeout waiting for SMS code");
  return null;
}

async function main() {
  const config = JSON.parse(readFileSync(resolve(PROJECT_ROOT, "config.json"), "utf-8"));
  
  console.log("=== Google Account Auto-Registration ===");
  console.log(`Name: ${config.firstName} ${config.lastName}`);
  console.log(`Username: ${config.username}`);
  console.log(`Phone: ${PHONE_NUMBER}`);
  console.log(`Proxy: ${PROXY_SERVER}`);
  console.log(`Activation ID: ${ACTIVATION_ID}`);
  console.log("");

  const launchOptions = {
    headless: true,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
  };
  if (PROXY_SERVER) {
    launchOptions.proxy = { server: PROXY_SERVER };
    if (PROXY_USER) {
      launchOptions.proxy.username = PROXY_USER;
      launchOptions.proxy.password = PROXY_PASS;
    }
  }
  const browser = await chromium.launch(launchOptions);

  const context = await browser.newContext({
    ...devices["Pixel 7"],
    locale: "en-US",
  });

  const page = await context.newPage();

  try {
    // Step 0: Open Google signup
    log(0, "Opening Google signup page...");
    await page.goto("https://accounts.google.com/signup", {
      waitUntil: "commit",
      timeout: 60000,
    });
    await page.waitForSelector('input[name="firstName"]', { timeout: 60000 });
    log(0, "Signup page loaded");

    // Step 1: Name
    log(1, "Entering name...");
    await page.fill('input[name="firstName"]', config.firstName);
    if (config.lastName) {
      await page.fill('input[name="lastName"]', config.lastName);
    }
    await page.click('button:has-text("Next")');
    await page.waitForTimeout(3000);
    log(1, "Name submitted");

    // Step 2: Birthday & Gender
    log(2, "Entering birthday and gender...");
    await page.waitForTimeout(2000);
    
    // Month dropdown (custom Material Design div#month)
    await page.click('#month');
    await page.waitForTimeout(500);
    await page.click(`li[role="option"]:has-text("${config.birthday.month}")`);
    await page.waitForTimeout(300);
    
    // Day and Year inputs
    await page.fill('#day', config.birthday.day);
    await page.fill('#year', config.birthday.year);
    await page.waitForTimeout(300);
    
    // Gender dropdown (custom Material Design div#gender)
    await page.click('#gender');
    await page.waitForTimeout(500);
    // Click the visible "Rather not say" option
    const genderOption = page.locator('li[role="option"]:visible').filter({ hasText: config.gender });
    await genderOption.click();
    await page.waitForTimeout(500);
    
    await page.click('button:has-text("Next")');
    await page.waitForTimeout(5000);
    log(2, `Birthday/gender done. URL: ${page.url()}`);

    // Step 3: Username
    log(3, "Entering username...");
    const currentUrl3 = page.url();
    if (currentUrl3.includes("username") || currentUrl3.includes("gmail")) {
      // Check for "Create your own" option
      const createOwn = page.locator('text=Create your own Gmail address');
      if (await createOwn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await createOwn.click();
        await page.waitForTimeout(1000);
      }
      
      const usernameInput = page.locator('input[name="Username"], input[type="text"]').first();
      await usernameInput.fill(config.username);
      await page.click('button:has-text("Next")');
      await page.waitForTimeout(3000);
      log(3, "Username submitted");
    } else {
      log(3, `Skipped (current URL: ${currentUrl3})`);
    }

    // Step 4: Password
    log(4, "Entering password...");
    const currentUrl4 = page.url();
    if (currentUrl4.includes("password") || await page.locator('input[name="Passwd"]').isVisible({ timeout: 5000 }).catch(() => false)) {
      await page.fill('input[name="Passwd"]', config.password);
      const confirmInput = page.locator('input[name="PasswdAgain"], input[name="ConfirmPasswd"]');
      if (await confirmInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmInput.fill(config.password);
      }
      await page.click('button:has-text("Next")');
      await page.waitForTimeout(3000);
      log(4, "Password submitted");
    } else {
      log(4, `Skipped (current URL: ${currentUrl4})`);
    }

    // Step 5: Verification
    await page.waitForTimeout(5000);
    const currentUrl5 = page.url();
    log(5, `Verification page: ${currentUrl5}`);
    
    // Take screenshot
    await page.screenshot({ path: resolve(PROJECT_ROOT, "screenshots/step5_verification.png"), fullPage: true });
    log(5, "Screenshot saved");

    // Case A: Phone number input field visible (residential IP scenario)
    const telInput = page.locator('input[type="tel"]');
    if (await telInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      log(5, "Phone input detected! Entering virtual number...");
      await telInput.fill(PHONE_NUMBER);
      await page.click('button:has-text("Next"), button:has-text("Send")');
      await page.waitForTimeout(5000);
      
      log(5, `After phone submit URL: ${page.url()}`);
      await page.screenshot({ path: resolve(PROJECT_ROOT, "screenshots/step5_after_phone.png"), fullPage: true });
      
      // Wait for code input
      const codeInput = page.locator('input[name="code"], input[type="tel"], input[aria-label*="code"], input[aria-label*="Code"]').first();
      if (await codeInput.isVisible({ timeout: 10000 }).catch(() => false)) {
        log(5, "Code input visible! Polling hero-sms for code...");
        const code = await pollForSmsCode(ACTIVATION_ID);
        if (code) {
          await codeInput.fill(code);
          await page.click('button:has-text("Next"), button:has-text("Verify")');
          await page.waitForTimeout(5000);
          log(5, "Verification code submitted!");
          log(5, `After verify URL: ${page.url()}`);
        } else {
          log(5, "Failed to get verification code!");
        }
      }
    }
    // Case B: devicephoneverification 
    else if (currentUrl5.includes("devicephoneverification")) {
      log(5, "Device SMS verification (requires device to SEND SMS) - cannot automate from datacenter IP");
      await page.screenshot({ path: resolve(PROJECT_ROOT, "screenshots/step5_device_sms.png"), fullPage: true });
      console.log("This means the proxy IP is detected as datacenter. Need residential IP.");
    }
    // Case C: QR code
    else if (currentUrl5.includes("mophoneverification") || currentUrl5.includes("crossflowverification")) {
      log(5, "QR code verification detected - cannot automate");
      await page.screenshot({ path: resolve(PROJECT_ROOT, "screenshots/step5_qrcode.png"), fullPage: true });
    }
    // Case D: Unknown
    else {
      log(5, `Unknown verification state. URL: ${currentUrl5}`);
      const bodyText = await page.innerText('body').catch(() => '');
      console.log("Page content:", bodyText.substring(0, 500));
      await page.screenshot({ path: resolve(PROJECT_ROOT, "screenshots/step5_unknown.png"), fullPage: true });
    }

    // Post-verification steps
    const finalUrl = page.url();
    if (finalUrl.includes("recovery") || finalUrl.includes("tos") || finalUrl.includes("terms")) {
      // Step 6: Recovery email (skip)
      if (finalUrl.includes("recovery")) {
        const skipBtn = page.locator('button:has-text("Skip")');
        if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await skipBtn.click();
          await page.waitForTimeout(2000);
        }
      }
      
      // Step 7: Terms
      if (page.url().includes("tos") || page.url().includes("terms")) {
        const agreeBtn = page.locator('button:has-text("I agree")');
        if (await agreeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await agreeBtn.click();
          await page.waitForTimeout(3000);
        }
      }
      
      console.log("\n=== Registration Complete! ===");
      console.log(`Email: ${config.username}@gmail.com`);
      console.log(`Password: ${config.password}`);
    }

    await page.screenshot({ path: resolve(PROJECT_ROOT, "screenshots/final.png"), fullPage: true });
    console.log("\nFinal URL:", page.url());

  } catch (error) {
    console.error("\nError during registration:", error.message);
    await page.screenshot({ path: resolve(PROJECT_ROOT, "screenshots/error.png"), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main();
