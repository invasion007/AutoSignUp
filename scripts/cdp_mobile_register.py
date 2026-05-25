"""
Google Registration via CDP with Mobile Device Emulation.
Connects to the running Chrome browser and creates a new context
with Pixel 7 emulation to get SMS verification instead of QR code.
"""
import asyncio
import time
from playwright.async_api import async_playwright

CDP_URL = "http://localhost:29229"

CONFIG = {
    "firstName": "David",
    "lastName": "Carter",
    "birthday": {"month": "January", "day": "15", "year": "1990"},
    "gender": "Rather not say",
    "username": f"david.carter.t{int(time.time()) % 100000}",
    "password": "Gk#7mPw2$xN9bL",
}


async def safe_screenshot(page, path):
    try:
        await page.screenshot(path=path, timeout=10000)
    except Exception:
        pass


async def click_with_js(page, selector):
    """Click an element using JavaScript evaluation as fallback."""
    await page.evaluate(f"""
        const el = document.querySelector('{selector}');
        if (el) el.click();
    """)


async def main():
    async with async_playwright() as p:
        print(f"[INFO] Connecting to Chrome CDP at {CDP_URL} ...")
        browser = await p.chromium.connect_over_cdp(CDP_URL)

        pixel7 = p.devices["Pixel 7"]
        context = await browser.new_context(
            **pixel7,
            locale="en-US",
        )
        page = await context.new_page()

        print("[INFO] Mobile context created (Pixel 7 emulation)")
        print(f"[INFO] Username will be: {CONFIG['username']}@gmail.com")
        print()

        try:
            # Step 0: Navigate to Google signup
            print("[Step 0] Navigating to Google signup page...")
            await page.goto("https://accounts.google.com/signup", wait_until="domcontentloaded", timeout=30000)
            await asyncio.sleep(3)
            print(f"[Step 0] Current URL: {page.url}")

            # Step 1: Enter name
            print(f"[Step 1] Entering name: {CONFIG['firstName']} {CONFIG['lastName']}")
            await page.wait_for_selector('input[name="firstName"]', timeout=15000)
            await page.fill('input[name="firstName"]', CONFIG["firstName"])
            if CONFIG["lastName"]:
                await page.fill('input[name="lastName"]', CONFIG["lastName"])
            await page.click('button:has-text("Next")')
            await asyncio.sleep(4)
            print(f"[Step 1] Done. URL: {page.url}")

            # Step 2: Birthday and gender
            print("[Step 2] Filling birthday and gender...")
            await page.wait_for_selector('input[name="day"]', timeout=15000)

            # Month dropdown - use JS to find all dropdowns in section
            # Click the month dropdown
            await page.evaluate("""
                const section = document.querySelector('section');
                const dropdowns = section.querySelectorAll('div[aria-expanded]');
                if (dropdowns[0]) dropdowns[0].click();
            """)
            await asyncio.sleep(1)
            
            # Select month
            month = CONFIG["birthday"]["month"]
            await page.evaluate(f"""
                const items = document.querySelectorAll('li');
                for (const li of items) {{
                    if (li.textContent.trim() === '{month}') {{
                        li.click();
                        break;
                    }}
                }}
            """)
            await asyncio.sleep(0.5)

            # Fill day and year
            await page.fill('input[name="day"]', CONFIG["birthday"]["day"])
            await page.fill('input[name="year"]', CONFIG["birthday"]["year"])

            # Gender dropdown - use JS click
            print("[Step 2] Setting gender...")
            await page.evaluate("""
                const section = document.querySelector('section');
                const dropdowns = section.querySelectorAll('div[aria-expanded]');
                // The second dropdown in section is gender
                if (dropdowns.length >= 2) {
                    dropdowns[1].click();
                }
            """)
            await asyncio.sleep(1)

            # Select gender option
            gender = CONFIG["gender"]
            await page.evaluate(f"""
                const items = document.querySelectorAll('li');
                for (const li of items) {{
                    if (li.textContent.trim() === '{gender}') {{
                        li.click();
                        break;
                    }}
                }}
            """)
            await asyncio.sleep(0.5)

            await safe_screenshot(page, "/home/ubuntu/AutoSignUp/screenshots/step2.png")
            
            # Click Next
            await page.evaluate("""
                const buttons = document.querySelectorAll('button');
                for (const btn of buttons) {
                    if (btn.textContent.trim() === 'Next') {
                        btn.click();
                        break;
                    }
                }
            """)
            await asyncio.sleep(4)
            print(f"[Step 2] Done. URL: {page.url}")

            # Step 3: Username
            print("[Step 3] Setting username...")
            await page.wait_for_selector('input[name="Username"]', timeout=15000)
            await page.fill('input[name="Username"]', CONFIG["username"])
            await safe_screenshot(page, "/home/ubuntu/AutoSignUp/screenshots/step3.png")
            await page.click('button:has-text("Next")')
            await asyncio.sleep(4)
            current_url = page.url
            print(f"[Step 3] Done. URL: {current_url}")

            # Check if username was taken
            if "username" in current_url.lower() and "password" not in current_url.lower():
                new_username = f"david.carter.x{int(time.time()) % 99999}"
                print(f"[Step 3] Username may be taken, trying: {new_username}")
                CONFIG["username"] = new_username
                await page.fill('input[name="Username"]', "")
                await page.fill('input[name="Username"]', new_username)
                await page.click('button:has-text("Next")')
                await asyncio.sleep(4)
                print(f"[Step 3] Retry URL: {page.url}")

            # Step 4: Password
            print("[Step 4] Setting password...")
            await page.wait_for_selector('input[name="Passwd"]', timeout=15000)
            await page.fill('input[name="Passwd"]', CONFIG["password"])
            await page.fill('input[name="PasswdAgain"]', CONFIG["password"])
            await safe_screenshot(page, "/home/ubuntu/AutoSignUp/screenshots/step4.png")
            await page.click('button:has-text("Next")')
            print("[Step 4] Clicked Next, waiting for verification page...")
            await asyncio.sleep(8)
            current_url = page.url
            print(f"[Step 4] Done. URL: {current_url}")

            # Step 5: Check verification type
            await safe_screenshot(page, "/home/ubuntu/AutoSignUp/screenshots/step5.png")

            if "devicephoneverification" in current_url:
                print()
                print("=" * 60)
                print("[Step 5] SUCCESS! Got SMS verification!")
                print("=" * 60)
            elif "mophoneverification" in current_url or "crossflowverification" in current_url:
                print()
                print("=" * 60)
                print("[Step 5] Got QR code verification")
                print("=" * 60)
            elif "phoneverification" in current_url:
                print()
                print("=" * 60)
                print(f"[Step 5] Phone verification: {current_url}")
                print("=" * 60)
            else:
                print()
                print("=" * 60)
                print(f"[Step 5] After password: {current_url}")
                print("=" * 60)
                try:
                    content = await page.content()
                    with open("/home/ubuntu/AutoSignUp/screenshots/step5_page.html", "w") as f:
                        f.write(content)
                except:
                    pass

            print()
            print(f"Registration info:")
            print(f"  Username: {CONFIG['username']}@gmail.com")
            print(f"  Final URL: {page.url}")

            print("\nKeeping page open for 120s...")
            await asyncio.sleep(120)

        except Exception as e:
            print(f"\n[ERROR] {e}")
            await safe_screenshot(page, "/home/ubuntu/AutoSignUp/screenshots/error.png")
            import traceback
            traceback.print_exc()
            print("\nKeeping page open for 60s...")
            await asyncio.sleep(60)
        finally:
            await context.close()
            print("\n[INFO] Context closed.")


if __name__ == "__main__":
    asyncio.run(main())
