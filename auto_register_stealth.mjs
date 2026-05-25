/**
 * Google registration with fingerprint browser approach (like AdsPower).
 * Uses playwright-stealth + device fingerprint spoofing + residential proxy.
 * 
 * This mimics what AdsPower does:
 * 1. Unique browser fingerprint (canvas, WebGL, fonts, etc.)
 * 2. Residential IP
 * 3. Matching timezone/locale to the proxy location
 * 4. Anti-automation detection measures
 */

import { chromium } from "playwright";
import { stealth } from "@mr_ozio/playwright-stealth";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import https from "https";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname);

// Configuration
const HERO_SMS_API_KEY = "86e4451c952e1cc851fA3323f557527A";
const ACTIVATION_ID = process.env.ACTIVATION_ID || "";
const PHONE_NUMBER = process.env.PHONE || "";

// Proxy settings
const PROXY_SERVER = process.env.PROXY || "";
const PROXY_USER = process.env.PROXY_USER || "";
const PROXY_PASS = process.env.PROXY_PASS || "";

function log(step, msg) {
  console.log(`[${new Date().toLocaleTimeString()}] Step ${step}: ${msg}`);
}

// Hero-SMS API
async function heroSmsApi(action, params = {}) {
  const url = new URL("https://hero-sms.com/stubs/handler_api.php");
  url.searchParams.set("action", action);
  url.searchParams.set("api_key", HERO_SMS_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Promise((resolve, reject) => {
    https.get(url.toString(), (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

// Buy a number for Google
async function buyNumber(country = 6) {
  const result = await heroSmsApi("getNumber", { service: "go", country: String(country) });
  console.log("Buy number result:", result);
  if (result.startsWith("ACCESS_NUMBER:")) {
    const parts = result.split(":");
    return { activationId: parts[1], phone: parts[2] };
  }
  return null;
}

// Poll for SMS code
async function pollForSmsCode(activationId, maxAttempts = 40, interval = 5000) {
  log("SMS", `Polling for code (activation ${activationId})...`);
  for (let i = 0; i < maxAttempts; i++) {
    const result = await heroSmsApi("getStatus", { id: activationId });
    console.log(`  Poll ${i + 1}: ${result}`);
    if (result.startsWith("STATUS_OK:")) return result.split(":")[1];
    if (result === "STATUS_CANCEL") return null;
    await new Promise(r => setTimeout(r, interval));
  }
  return null;
}

// Cancel activation
async function cancelActivation(activationId) {
  return heroSmsApi("setStatus", { id: activationId, status: "8" });
}

async function main() {
  const config = JSON.parse(readFileSync(resolve(PROJECT_ROOT, "config.json"), "utf-8"));
  
  console.log("=== Google Registration (Stealth/Fingerprint Mode) ===");
  console.log(`Name: ${config.firstName} ${config.lastName}`);
  console.log(`Username: ${config.username}`);
  console.log(`Proxy: ${PROXY_SERVER || "(direct)"}`);
  console.log("");

  // Launch with stealth patches (like a fingerprint browser)
  const stealthChromium = stealth(chromium);
  
  const launchOptions = {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-site-isolation-trials",
    ],
  };
  if (PROXY_SERVER) {
    launchOptions.proxy = { server: PROXY_SERVER };
    if (PROXY_USER) {
      launchOptions.proxy.username = PROXY_USER;
      launchOptions.proxy.password = PROXY_PASS;
    }
  }

  const browser = await stealthChromium.launch(launchOptions);

  // Create context with fingerprint settings mimicking a real US user
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.165 Mobile Safari/537.36",
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    geolocation: { latitude: 34.0522, longitude: -118.2437 }, // Los Angeles
    permissions: ["geolocation"],
    colorScheme: "light",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  // Add additional fingerprint spoofing scripts
  await context.addInitScript(() => {
    // Override navigator.webdriver
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    
    // Override navigator.plugins (empty in headless)
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5].map(() => ({
        name: 'Chrome PDF Plugin',
        description: 'Portable Document Format',
        filename: 'internal-pdf-viewer',
      })),
    });
    
    // Override navigator.languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
    
    // Canvas fingerprint noise
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type) {
      if (type === 'image/png') {
        const context = this.getContext('2d');
        if (context) {
          const imageData = context.getImageData(0, 0, this.width, this.height);
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] += (Math.random() * 2 - 1) | 0;
          }
          context.putImageData(imageData, 0, 0);
        }
      }
      return originalToDataURL.apply(this, arguments);
    };
    
    // WebGL renderer spoofing
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) return 'Google Inc. (Qualcomm)';
      if (parameter === 37446) return 'ANGLE (Qualcomm, Adreno (TM) 730, OpenGL ES 3.2)';
      return getParameter.apply(this, arguments);
    };
    
    // Chrome runtime
    window.chrome = { runtime: {}, loadTimes: () => ({}) };
    
    // Permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
  });

  const page = await context.newPage();

  let activationId = ACTIVATION_ID;
  let phoneNumber = PHONE_NUMBER;

  try {
    // Step 0: Open Google signup
    log(0, "Opening Google signup page...");
    await page.goto("https://accounts.google.com/signup", {
      waitUntil: "commit",
      timeout: 60000,
    });
    await page.waitForSelector('input[name="firstName"]', { timeout: 60000 });
    log(0, "Page loaded");

    // Step 1: Name
    log(1, "Entering name...");
    await page.fill('input[name="firstName"]', config.firstName);
    if (config.lastName) await page.fill('input[name="lastName"]', config.lastName);
    await page.click('button:has-text("Next")');
    await page.waitForTimeout(3000);
    log(1, "Done");

    // Step 2: Birthday & Gender
    log(2, "Entering birthday and gender...");
    await page.waitForTimeout(2000);
    await page.click('#month');
    await page.waitForTimeout(500);
    await page.click(`li[role="option"]:has-text("${config.birthday.month}")`);
    await page.waitForTimeout(300);
    await page.fill('#day', config.birthday.day);
    await page.fill('#year', config.birthday.year);
    await page.waitForTimeout(300);
    await page.click('#gender');
    await page.waitForTimeout(500);
    const genderOption = page.locator('li[role="option"]:visible').filter({ hasText: config.gender });
    await genderOption.click();
    await page.waitForTimeout(500);
    await page.click('button:has-text("Next")');
    await page.waitForTimeout(5000);
    log(2, `Done. URL: ${page.url()}`);

    // Step 3: Username
    log(3, "Entering username...");
    if (page.url().includes("username")) {
      const createOwn = page.locator('text=Create your own Gmail address');
      if (await createOwn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await createOwn.click();
        await page.waitForTimeout(1000);
      }
      const usernameInput = page.locator('input[name="Username"], input[type="text"]').first();
      await usernameInput.fill(config.username);
      await page.click('button:has-text("Next")');
      await page.waitForTimeout(3000);
      log(3, "Done");
    } else {
      log(3, `Skipped (URL: ${page.url()})`);
    }

    // Step 4: Password
    log(4, "Entering password...");
    if (page.url().includes("password") || await page.locator('input[name="Passwd"]').isVisible({ timeout: 5000 }).catch(() => false)) {
      await page.fill('input[name="Passwd"]', config.password);
      const confirm = page.locator('input[name="PasswdAgain"], input[name="ConfirmPasswd"]');
      if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) await confirm.fill(config.password);
      await page.click('button:has-text("Next")');
      await page.waitForTimeout(3000);
      log(4, "Done");
    } else {
      log(4, `Skipped (URL: ${page.url()})`);
    }

    // Step 5: Verification
    await page.waitForTimeout(5000);
    const verifyUrl = page.url();
    log(5, `Verification: ${verifyUrl}`);
    
    const { mkdirSync } = await import("fs");
    mkdirSync(resolve(PROJECT_ROOT, "screenshots"), { recursive: true });
    await page.screenshot({ path: resolve(PROJECT_ROOT, "screenshots/stealth_step5.png"), fullPage: true });

    // Check which verification type
    if (verifyUrl.includes("phoneverification") && !verifyUrl.includes("devicephoneverification")) {
      // SUCCESS - Got the "input phone number" flow!
      log(5, "SUCCESS! Got phone number input verification!");
      
      // Buy a number if not provided
      if (!phoneNumber) {
        const numberInfo = await buyNumber(6); // Indonesia (cheapest)
        if (numberInfo) {
          activationId = numberInfo.activationId;
          phoneNumber = "+" + numberInfo.phone;
          log(5, `Bought number: ${phoneNumber} (activation: ${activationId})`);
        }
      }
      
      if (phoneNumber) {
        const telInput = page.locator('input[type="tel"]');
        await telInput.fill(phoneNumber);
        await page.click('button:has-text("Next"), button:has-text("Send")');
        await page.waitForTimeout(5000);
        
        // Poll for code
        const code = await pollForSmsCode(activationId);
        if (code) {
          const codeInput = page.locator('input[name="code"], input[type="tel"]').first();
          await codeInput.fill(code);
          await page.click('button:has-text("Next"), button:has-text("Verify")');
          await page.waitForTimeout(5000);
          log(5, `Code submitted! URL: ${page.url()}`);
        }
      }
    } else if (verifyUrl.includes("devicephoneverification")) {
      log(5, "BLOCKED: devicephoneverification (IP detected as datacenter)");
      console.log("The proxy IP is not residential. Need real residential IP.");
      console.log("Recommendation: Get Webshare STATIC RESIDENTIAL plan (10 free IPs trial).");
      console.log("Link: https://www.webshare.io (select 'Static Residential' plan)");
    } else {
      // Maybe no verification needed! (rare with fingerprint browser)
      log(5, `Other state: ${verifyUrl}`);
      const bodyText = await page.innerText('body').catch(() => '');
      console.log("Page content:", bodyText.substring(0, 500));
    }

    // Post-verification
    const finalUrl = page.url();
    if (finalUrl.includes("recovery")) {
      const skip = page.locator('button:has-text("Skip")');
      if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click();
    }
    if (page.url().includes("tos")) {
      const agree = page.locator('button:has-text("I agree")');
      if (await agree.isVisible({ timeout: 3000 }).catch(() => false)) await agree.click();
    }

    await page.screenshot({ path: resolve(PROJECT_ROOT, "screenshots/stealth_final.png"), fullPage: true });
    console.log("\nFinal URL:", page.url());
    
    if (page.url().includes("myaccount") || page.url().includes("ManageAccount")) {
      console.log("\n=== REGISTRATION SUCCESSFUL! ===");
      console.log(`Email: ${config.username}@gmail.com`);
      console.log(`Password: ${config.password}`);
    }

  } catch (error) {
    console.error("\nError:", error.message);
    await page.screenshot({ path: resolve(PROJECT_ROOT, "screenshots/stealth_error.png"), fullPage: true }).catch(() => {});
  } finally {
    if (activationId && !PHONE_NUMBER) await cancelActivation(activationId).catch(() => {});
    await browser.close();
  }
}

main();
