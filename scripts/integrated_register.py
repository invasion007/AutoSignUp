"""
Integrated Google registration with Outlook email verification.
All steps in one script with proper error handling.
"""
import asyncio
import re
import time
from playwright.async_api import async_playwright

CDP_URL = "http://localhost:29229"

CONFIG = {
    "firstName": "David",
    "lastName": "Carter",
    "birthday": {"month": "January", "day": "15", "year": "1990"},
    "gender": "Rather not say",
    "email": "david.carter.2490@outlook.com",
    "outlook_password": "Dc$9Kp2x!mR4vN",
    "google_password": "Gk#7mPw2$xN9bL",
}


async def safe_screenshot(page, path):
    try:
        await page.screenshot(path=path, timeout=10000)
    except:
        pass


async def get_code_from_outlook(browser):
    """Login to Outlook and retrieve the latest verification code."""
    print("\n--- Outlook: Getting verification code ---")
    ctx = await browser.new_context(viewport={"width": 1280, "height": 800}, locale="en-US")
    page = await ctx.new_page()

    try:
        await page.goto("https://login.live.com/", wait_until="domcontentloaded", timeout=30000)
        await asyncio.sleep(3)

        # Email
        email_input = page.locator('input[type="email"]')
        await email_input.fill(CONFIG["email"])
        await page.keyboard.press("Enter")
        await asyncio.sleep(4)

        # Password
        pwd = page.locator('input[type="password"]')
        await pwd.wait_for(timeout=15000)
        await pwd.fill(CONFIG["outlook_password"])
        await page.keyboard.press("Enter")
        await asyncio.sleep(5)

        # Privacy notice or Stay signed in
        text = await page.evaluate("document.body.innerText")
        if "Stay signed in" in text or "quick note" in text or "privacy" in text.lower():
            # Try clicking continue/next or pressing Enter
            try:
                continue_btn = page.locator('button:has-text("Continue")')
                if await continue_btn.count() > 0:
                    await continue_btn.click()
                else:
                    await page.keyboard.press("Enter")
            except:
                await page.keyboard.press("Enter")
            await asyncio.sleep(3)

        # Go to inbox
        await page.goto("https://outlook.live.com/mail/0/inbox", wait_until="domcontentloaded", timeout=30000)
        await asyncio.sleep(8)

        print(f"[Outlook] Inbox URL: {page.url}")
        await safe_screenshot(page, "/home/ubuntu/AutoSignUp/screenshots/int_outlook_inbox.png")

        # Try multiple times to find the code (it might take a moment to arrive)
        for attempt in range(6):
            text = await page.evaluate("document.body.innerText")

            # Try patterns
            # The Google verification email contains: "XXX-XXX is your Google verification code"
            # or in the inbox preview it might show as "XXXXXX is your Google verification code"
            patterns = [
                r'(\d{6})\s+is your Google verification code',
                r'G-(\d{6})',
                r'(\d{6})\s+is your.*verification code',
                r'verification code.*?(\d{6})',
                r'Google.*?(\d{6})',
            ]

            for pat in patterns:
                matches = re.findall(pat, text, re.IGNORECASE)
                if matches:
                    code = matches[-1]  # Take the last (most recent) match
                    print(f"[Outlook] Found code: {code} (attempt {attempt + 1})")
                    return code

            if attempt < 5:
                print(f"[Outlook] Attempt {attempt + 1}: No code yet, waiting 5s...")
                await asyncio.sleep(5)
                await page.reload()
                await asyncio.sleep(5)

        # Fallback: look for any 6-digit codes
        all_codes = re.findall(r'\b(\d{6})\b', text)
        if all_codes:
            print(f"[Outlook] 6-digit codes found: {all_codes[:10]}")
            # Try clicking on the first/most recent email to see the full content
            items = page.locator('div[role="option"]')
            count = await items.count()
            if count > 0:
                for i in range(min(count, 3)):
                    item_text = await items.nth(i).inner_text()
                    if "google" in item_text.lower() or "verification" in item_text.lower():
                        await items.nth(i).click()
                        await asyncio.sleep(3)
                        email_text = await page.evaluate("document.body.innerText")
                        for pat in patterns:
                            match = re.search(pat, email_text, re.IGNORECASE)
                            if match:
                                code = match.group(1)
                                print(f"[Outlook] Found code in email body: {code}")
                                return code

            # Return the most recent 6-digit code as last resort
            print(f"[Outlook] Returning first code as fallback: {all_codes[0]}")
            return all_codes[0]

        print("[Outlook] No codes found")
        return None

    except Exception as e:
        print(f"[Outlook] Error: {e}")
        import traceback
        traceback.print_exc()
        return None
    finally:
        await ctx.close()


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(CDP_URL)

        # Google signup - mobile context
        pixel7 = p.devices["Pixel 7"]
        ctx = await browser.new_context(**pixel7, locale="en-US")
        page = await ctx.new_page()

        print("=" * 60)
        print("Google Account Registration (Existing Email Flow)")
        print("=" * 60)

        try:
            # Step 0: Navigate
            print("\n[Step 0] Navigating to signup...")
            await page.goto("https://accounts.google.com/signup", wait_until="domcontentloaded", timeout=30000)
            await asyncio.sleep(3)

            # Step 1: Name
            print("[Step 1] Entering name...")
            await page.wait_for_selector('input[name="firstName"]', timeout=15000)
            await page.fill('input[name="firstName"]', CONFIG["firstName"])
            await page.fill('input[name="lastName"]', CONFIG["lastName"])
            await page.click('button:has-text("Next")')
            await asyncio.sleep(4)

            # Step 2: Birthday + gender
            print("[Step 2] Birthday + gender...")
            await page.wait_for_selector('input[name="day"]', timeout=15000)
            # Month dropdown
            await page.evaluate("""() => {
                const s = document.querySelector('section');
                const d = s.querySelectorAll('div[aria-expanded]');
                if (d[0]) d[0].click();
            }""")
            await asyncio.sleep(1)
            await page.evaluate(f"""(m) => {{
                for (const li of document.querySelectorAll('li'))
                    if (li.textContent.trim() === m) {{ li.click(); break; }}
            }}""", CONFIG["birthday"]["month"])
            await asyncio.sleep(0.5)
            await page.fill('input[name="day"]', CONFIG["birthday"]["day"])
            await page.fill('input[name="year"]', CONFIG["birthday"]["year"])
            # Gender dropdown
            await page.evaluate("""() => {
                const s = document.querySelector('section');
                const d = s.querySelectorAll('div[aria-expanded]');
                if (d.length >= 2) d[1].click();
            }""")
            await asyncio.sleep(1)
            await page.evaluate(f"""(g) => {{
                for (const li of document.querySelectorAll('li'))
                    if (li.textContent.trim() === g) {{ li.click(); break; }}
            }}""", CONFIG["gender"])
            await asyncio.sleep(0.5)
            await page.evaluate("""() => {
                for (const btn of document.querySelectorAll('button'))
                    if (btn.textContent.trim() === 'Next') { btn.click(); break; }
            }""")
            await asyncio.sleep(4)

            # Step 3: Use existing email
            print("[Step 3] Using existing email...")
            await page.click('button:has-text("Use your existing email")')
            await asyncio.sleep(3)
            
            username_input = page.locator('input[name="Username"]')
            await username_input.fill(CONFIG["email"])
            await page.click('button:has-text("Next")')
            await asyncio.sleep(5)

            url = page.url
            print(f"[Step 3] URL: {url}")
            page_text = await page.evaluate("document.body.innerText")
            print(f"[Step 3] Text: {page_text[:200]}")

            if "verifyemail" not in url:
                print(f"[!] Unexpected page! Aborting.")
                await safe_screenshot(page, "/home/ubuntu/AutoSignUp/screenshots/int_unexpected.png")
                return

            print("\n[Step 4] Email verification needed!")

            # Get code from Outlook
            code = await get_code_from_outlook(browser)

            if not code:
                print("[!] Could not get code. Page open for 300s for manual entry.")
                await asyncio.sleep(300)
                return

            # Enter the code
            print(f"\n[Step 4] Entering code: {code}")
            code_input = page.locator('input[name="code"]')
            if await code_input.count() == 0:
                code_input = page.locator('input').first
            await code_input.fill(code)
            await safe_screenshot(page, "/home/ubuntu/AutoSignUp/screenshots/int_code_entered.png")
            await page.click('button:has-text("Next")')
            await asyncio.sleep(5)

            url = page.url
            text = await page.evaluate("document.body.innerText")
            print(f"[Step 4] After code: {url}")
            print(f"[Step 4] Text: {text[:300]}")
            await safe_screenshot(page, "/home/ubuntu/AutoSignUp/screenshots/int_after_code.png")

            if "Wrong code" in text:
                print("\n[!] Wrong code! Trying to get code again...")
                # The code might have changed, try again
                code2 = await get_code_from_outlook(browser)
                if code2 and code2 != code:
                    print(f"[Step 4] Retrying with code: {code2}")
                    code_input = page.locator('input[name="code"]')
                    if await code_input.count() == 0:
                        code_input = page.locator('input').first
                    await code_input.fill("")
                    await code_input.fill(code2)
                    await page.click('button:has-text("Next")')
                    await asyncio.sleep(5)
                    url = page.url
                    text = await page.evaluate("document.body.innerText")
                    print(f"[Step 4] Retry result: {url}")
                    print(f"[Step 4] Text: {text[:300]}")

                    if "Wrong code" in text:
                        print("[!] Still wrong code. Keeping page open for 300s...")
                        await asyncio.sleep(300)
                        return

            # Step 5: Password
            if "password" in url.lower():
                print("\n[Step 5] Setting password...")
                await page.wait_for_selector('input[name="Passwd"]', timeout=10000)
                await page.fill('input[name="Passwd"]', CONFIG["google_password"])
                await page.fill('input[name="PasswdAgain"]', CONFIG["google_password"])
                await page.click('button:has-text("Next")')
                await asyncio.sleep(8)

                url = page.url
                text = await page.evaluate("document.body.innerText")
                print(f"[Step 5] URL: {url}")
                print(f"[Step 5] Text: {text[:400]}")
                await safe_screenshot(page, "/home/ubuntu/AutoSignUp/screenshots/int_after_password.png")

            # Check final state
            url = page.url
            if "phoneverification" in url.lower() or "devicephoneverification" in url.lower():
                print("\n[RESULT] Phone verification still required.")
                print("[RESULT] The existing email flow still triggers phone verification.")
            elif "myaccount" in url.lower() or "manageaccount" in url.lower():
                print("\n[SUCCESS] Google account created!")
            elif "tos" in url.lower() or "terms" in url.lower():
                print("\n[PROGRESS] Terms of Service page - almost done!")
                # Accept TOS if needed
                agree_btn = page.locator('button:has-text("I agree")')
                if await agree_btn.count() > 0:
                    await agree_btn.click()
                    await asyncio.sleep(5)
                    print(f"After TOS: {page.url}")
            else:
                print(f"\n[RESULT] Final URL: {url}")
                content = await page.content()
                with open("/home/ubuntu/AutoSignUp/screenshots/int_final.html", "w") as f:
                    f.write(content)

            print(f"\nKeeping page open for 120s...")
            await asyncio.sleep(120)

        except Exception as e:
            print(f"\n[ERROR] {e}")
            import traceback
            traceback.print_exc()
            await safe_screenshot(page, "/home/ubuntu/AutoSignUp/screenshots/int_error.png")
            await asyncio.sleep(60)
        finally:
            await ctx.close()
            print("[INFO] Done.")


if __name__ == "__main__":
    asyncio.run(main())
