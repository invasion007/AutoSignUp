/**
 * Google Account Registration - Automated with Email Verification
 * 
 * This script automates the entire Google signup flow using an existing email (Outlook).
 * It handles steps 1-5 fully automatically, and for step 6 (phone verification),
 * it captures the SMS code needed and waits for user to send it.
 * 
 * Prerequisites:
 *   - PROXY env var (SOCKS5 residential proxy) 
 *   - Outlook email access (david.carter.2490@outlook.com)
 * 
 * Usage:
 *   PROXY=socks5://<ip>:<port> node scripts/google-register-email-verify.mjs
 *   
 *   # With custom email:
 *   PROXY=socks5://<ip>:<port> EMAIL=your@outlook.com EMAIL_PASS=yourpass node scripts/google-register-email-verify.mjs
 */
import { chromium, devices } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

const PROJECT_ROOT = resolve(import.meta.url.replace("file://", ""), "../..");
const PROXY = process.env.PROXY || "socks5://72.195.34.60:27391";
const OUTLOOK_EMAIL = process.env.EMAIL || "david.carter.2490@outlook.com";
const OUTLOOK_PASSWORD = process.env.EMAIL_PASS || "Dc$9Kp2x!mR4vN";
const ACCOUNT_PASSWORD = process.env.ACCOUNT_PASS || "DavidC2026Secure!";
const HEADLESS = process.env.HEADLESS !== "false";

mkdirSync(resolve(PROJECT_ROOT, "screenshots"), { recursive: true });

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function delay(min, max) {
  const ms = Math.floor(Math.random() * (max - min) + min);
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Login to Outlook and get the latest Google verification code
 */
async function getCodeFromOutlook(browser) {
  log("📧 Opening Outlook to get verification code...");
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  try {
    await page.goto("https://login.live.com", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);

    const emailInput = page.locator('input[type="email"], input[name="loginfmt"]');
    await emailInput.fill(OUTLOOK_EMAIL);
    await page.click('input[type="submit"], button[type="submit"]');
    await page.waitForTimeout(3000);

    const pwdInput = page.locator('input[type="password"], input[name="passwd"]');
    await pwdInput.waitFor({ timeout: 10000 });
    await pwdInput.fill(OUTLOOK_PASSWORD);
    await page.click('input[type="submit"], button[type="submit"]');
    await page.waitForTimeout(5000);

    // "Stay signed in?" prompt
    const stayBtn = page.locator('input[value="No"], button:has-text("No")');
    if (await stayBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await stayBtn.click();
      await page.waitForTimeout(3000);
    }

    await page.goto("https://outlook.live.com/mail/0/inbox", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);

    // Look for verification code in inbox
    for (let attempt = 0; attempt < 12; attempt++) {
      const fullText = await page.innerText("body").catch(() => "");
      // Match patterns like "is 123456" or "code: 123456" or standalone 6 digits near Google
      const codeMatch = fullText.match(/(?:is|code)[:\s]*(\d{6})/i) || fullText.match(/(\d{6})/);
      if (codeMatch) {
        log(`  ✓ Found code: ${codeMatch[1]}`);
        await ctx.close();
        return codeMatch[1];
      }
      log(`  Attempt ${attempt + 1}/12: No code yet, waiting...`);
      await page.reload();
      await page.waitForTimeout(5000);
    }

    await ctx.close();
    return null;
  } catch (err) {
    log(`  Outlook error: ${err.message}`);
    await ctx.close();
    return null;
  }
}

async function main() {
  log("═══════════════════════════════════════════════════════════");
  log("  Google Account Registration (Existing Email Method)");
  log("═══════════════════════════════════════════════════════════");
  log(`Email: ${OUTLOOK_EMAIL}`);
  log(`Proxy: ${PROXY}`);
  log(`Headless: ${HEADLESS}\n`);

  // Browser for signup (with proxy)
  const signupBrowser = await chromium.launch({
    headless: HEADLESS,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled", "--ignore-certificate-errors"],
    proxy: { server: PROXY },
  });
  const signupCtx = await signupBrowser.newContext({
    ...devices["Pixel 7"],
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    ignoreHTTPSErrors: true,
  });
  const page = await signupCtx.newPage();

  // Browser for Outlook (direct connection)
  const outlookBrowser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--ignore-certificate-errors"],
  });

  try {
    // ═══ STEP 1: Name ═══
    log("Step 1/6: Name...");
    await page.goto("https://accounts.google.com/signup/v2/createaccount?flowName=GlifWebSignIn&flowEntry=SignUp", {
      waitUntil: "commit", timeout: 60000,
    });
    await page.waitForTimeout(3000);
    await page.waitForSelector('input[name="firstName"]', { timeout: 30000 });
    await page.fill('input[name="firstName"]', "David");
    await page.fill('input[name="lastName"]', "Carter");
    await delay(1000, 2000);
    await page.click('button:has-text("Next")');
    await delay(3000, 5000);
    log("  ✓ Name submitted");

    // ═══ STEP 2: Birthday & Gender ═══
    log("Step 2/6: Birthday & Gender...");
    await page.click("#month");
    await page.waitForTimeout(500);
    await page.click('li[role="option"]:has-text("March")');
    await page.fill("#day", "14");
    await page.fill("#year", "1990");
    await page.click("#gender");
    await page.waitForTimeout(500);
    await page.locator('li[role="option"]:visible').filter({ hasText: "Rather not say" }).click();
    await delay(1000, 2000);
    await page.click('button:has-text("Next")');
    await delay(4000, 6000);
    log("  ✓ Birthday submitted");

    // ═══ STEP 3: Use Existing Email ═══
    log("Step 3/6: Using existing email...");
    const existingEmailBtn = page.locator('text=Use your existing email');
    if (!await existingEmailBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
      throw new Error("'Use your existing email' option not found");
    }
    await existingEmailBtn.click();
    await delay(2000, 3000);
    await page.locator('input[type="email"], input[name="Email"], input[type="text"]').first().fill(OUTLOOK_EMAIL);
    await delay(1000, 2000);
    await page.click('button:has-text("Next")');
    await delay(6000, 8000);
    log("  ✓ Email submitted");

    // ═══ STEP 4: Email Verification Code ═══
    if (!page.url().includes("verifyemail")) {
      throw new Error(`Expected verifyemail page, got: ${page.url()}`);
    }
    log("Step 4/6: Email verification...");
    log("  Google sent verification code to Outlook. Retrieving...");

    const code = await getCodeFromOutlook(outlookBrowser);
    if (!code) throw new Error("Could not retrieve email verification code from Outlook");

    await page.locator("input").first().fill(code);
    await delay(1000, 2000);
    await page.click('button:has-text("Next")');
    await delay(4000, 6000);
    log(`  ✓ Email verified with code: ${code}`);

    // ═══ STEP 5: Password ═══
    log("Step 5/6: Password...");
    const pwdField = page.locator('input[name="Passwd"]');
    if (!await pwdField.isVisible({ timeout: 10000 }).catch(() => false)) {
      throw new Error(`Expected password page, got: ${page.url()}`);
    }
    await pwdField.fill(ACCOUNT_PASSWORD);
    const confirm = page.locator('input[name="PasswdAgain"], input[name="ConfirmPasswd"]');
    if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) await confirm.fill(ACCOUNT_PASSWORD);
    await delay(1000, 2000);
    await page.click('button:has-text("Next")');
    await delay(4000, 6000);
    log("  ✓ Password set");

    // ═══ STEP 6: Phone Verification ═══
    log("Step 6/6: Phone verification...");
    const url = page.url();

    if (url.includes("phoneverification") && !url.includes("device") && !url.includes("mophone")) {
      // Best case: Regular phone verification (Google sends us code)
      log("  ★ Got REGULAR phoneverification! Can use virtual number!");
      // TODO: Integrate hero-sms here
    } else if (url.includes("devicephoneverification")) {
      log("  ⚠ Got devicephoneverification (device must SEND SMS)");

      // Wait for page to load and click Send SMS
      await page.waitForTimeout(3000);
      const sendBtn = page.locator('button:has-text("Send SMS"), a:has-text("Send SMS")');
      if (await sendBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
        // Intercept the SMS intent
        let smsUrl = null;
        page.on("request", req => {
          if (req.url().startsWith("sms:")) smsUrl = req.url();
        });
        await sendBtn.click();
        await page.waitForTimeout(3000);

        if (smsUrl) {
          const decoded = decodeURIComponent(smsUrl);
          const match = decoded.match(/sms:\/\/(\d+)\?body=(.+)/);
          if (match) {
            const targetNumber = match[1];
            const messageBody = match[2];
            
            log("");
            log("═══════════════════════════════════════════════════════════");
            log("  📱 ACTION REQUIRED: Send ONE SMS to complete registration");
            log("═══════════════════════════════════════════════════════════");
            log(`  To: ${targetNumber}`);
            log(`  Message: ${messageBody}`);
            log("");
            log("  You can use voice command:");
            log(`  \"Hey Siri/Google, send a text to ${targetNumber} saying ${messageBody}\"`);
            log("═══════════════════════════════════════════════════════════");
            
            // Save instructions to file
            const instructions = {
              action: "Send SMS",
              to: targetNumber,
              message: messageBody,
              voiceCommand: `Send a text to ${targetNumber} saying ${messageBody}`,
              timestamp: new Date().toISOString(),
            };
            writeFileSync(resolve(PROJECT_ROOT, "sms-instructions.json"), JSON.stringify(instructions, null, 2));
            log("\n  Instructions saved to sms-instructions.json");

            // Wait for verification (user sends SMS)
            log("\n  Waiting for SMS verification (up to 120 seconds)...");
            for (let i = 0; i < 24; i++) {
              await page.waitForTimeout(5000);
              const currentUrl = page.url();
              if (!currentUrl.includes("devicephoneverification")) {
                log(`  ✓ Verification completed! Redirected to: ${currentUrl}`);
                break;
              }
              if (i % 4 === 3) log(`  Still waiting... (${(i + 1) * 5}s)`);
            }
          }
        }
      }
    } else if (url.includes("mophoneverification")) {
      log("  ⚠ Got QR code verification (desktop mode)");
    }

    // ═══ POST-VERIFICATION ═══
    const finalUrl = page.url();
    if (finalUrl.includes("myaccount") || finalUrl.includes("ManageAccount") || finalUrl.includes("recovery")) {
      log("\n═══════════════════════════════════════════════════════════");
      log("  🎉 REGISTRATION SUCCESSFUL!");
      log("═══════════════════════════════════════════════════════════");
      log(`  Google Account: ${OUTLOOK_EMAIL}`);
      log(`  Password: ${ACCOUNT_PASSWORD}`);
      log("═══════════════════════════════════════════════════════════");
    }

    await page.screenshot({ path: resolve(PROJECT_ROOT, "screenshots/final_state.png"), fullPage: true });
    log(`\nFinal URL: ${finalUrl}`);

  } catch (err) {
    log(`\n✗ ERROR: ${err.message}`);
    await page.screenshot({ path: resolve(PROJECT_ROOT, "screenshots/error_state.png"), fullPage: true }).catch(() => {});
  } finally {
    await signupBrowser.close();
    await outlookBrowser.close();
  }
}

main();
