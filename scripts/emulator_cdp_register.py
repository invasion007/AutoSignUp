"""
Register via Android emulator WebView using raw CDP commands.
"""
import asyncio
import json
import re
import websockets
import subprocess
import requests

WEBVIEW_PORT = 9223
OUTLOOK_CDP = "http://localhost:29229"

CONFIG = {
    "firstName": "David",
    "lastName": "Carter",
    "birthday_month": "January",
    "birthday_day": "15",
    "birthday_year": "1990",
    "gender": "Rather not say",
    "email": "david.carter.2490@outlook.com",
    "outlook_password": "Dc$9Kp2x!mR4vN",
    "google_password": "Gk#7mPw2$xN9bL",
}


class CDPClient:
    def __init__(self, ws_url):
        self.ws_url = ws_url
        self.ws = None
        self.msg_id = 0
    
    async def connect(self):
        self.ws = await websockets.connect(self.ws_url, max_size=10*1024*1024)
    
    async def send(self, method, params=None):
        self.msg_id += 1
        msg = {"id": self.msg_id, "method": method}
        if params:
            msg["params"] = params
        await self.ws.send(json.dumps(msg))
        while True:
            resp = json.loads(await self.ws.recv())
            if resp.get("id") == self.msg_id:
                return resp.get("result", {})
    
    async def evaluate(self, expression):
        result = await self.send("Runtime.evaluate", {
            "expression": expression,
            "returnByValue": True,
        })
        return result.get("result", {}).get("value")
    
    async def screenshot(self, path):
        import base64
        result = await self.send("Page.captureScreenshot", {"format": "png"})
        data = base64.b64decode(result["data"])
        with open(path, "wb") as f:
            f.write(data)
        print(f"  Screenshot: {path}")
    
    async def close(self):
        if self.ws:
            await self.ws.close()


async def get_code_from_outlook_via_playwright():
    """Get verification code from Outlook using the Chrome browser."""
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(OUTLOOK_CDP)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 800}, locale="en-US")
        page = await ctx.new_page()
        try:
            await page.goto("https://login.live.com/", wait_until="domcontentloaded", timeout=30000)
            await asyncio.sleep(3)
            email_input = page.locator('input[type="email"]')
            await email_input.fill(CONFIG["email"])
            await page.keyboard.press("Enter")
            await asyncio.sleep(4)
            pwd = page.locator('input[type="password"]')
            await pwd.wait_for(timeout=15000)
            await pwd.fill(CONFIG["outlook_password"])
            await page.keyboard.press("Enter")
            await asyncio.sleep(5)
            text = await page.evaluate("document.body.innerText")
            if "Stay signed in" in text or "quick note" in text:
                await page.keyboard.press("Enter")
                await asyncio.sleep(3)
            await page.goto("https://outlook.live.com/mail/0/inbox", wait_until="domcontentloaded", timeout=30000)
            
            for attempt in range(10):
                await asyncio.sleep(8)
                text = await page.evaluate("document.body.innerText")
                patterns = [r'(\d{6})\s+is your Google verification code', r'G-(\d{6})']
                for pat in patterns:
                    matches = re.findall(pat, text, re.IGNORECASE)
                    if matches:
                        return matches[-1]
                codes = re.findall(r'\b(\d{6})\b', text)
                if codes:
                    return codes[-1]
                print(f"  [Outlook] Attempt {attempt+1}: No code yet...")
            return None
        except Exception as e:
            print(f"  [Outlook] Error: {e}")
            return None
        finally:
            await ctx.close()


async def main():
    # Get WebSocket URL
    pages = requests.get(f"http://localhost:{WEBVIEW_PORT}/json").json()
    ws_url = pages[0]["webSocketDebuggerUrl"]
    print(f"WebSocket URL: {ws_url}")
    
    cdp = CDPClient(ws_url)
    await cdp.connect()
    print("Connected to WebView CDP")
    
    # Enable necessary domains
    await cdp.send("Page.enable")
    await cdp.send("Runtime.enable")
    await cdp.send("DOM.enable")
    
    # Get current page info
    url = await cdp.evaluate("window.location.href")
    text = await cdp.evaluate("document.body.innerText")
    print(f"URL: {url}")
    print(f"Text: {text[:300]}")
    await cdp.screenshot("/home/ubuntu/AutoSignUp/screenshots/emu_cdp1.png")
    
    # Step 1: Fill name
    if "name" in url.lower() and "Enter your name" in text:
        print("\n[Step 1] Entering name...")
        await cdp.evaluate(f'document.querySelector(\'input[name="firstName"]\').value = ""')
        await cdp.evaluate(f'document.querySelector(\'input[name="firstName"]\').focus()')
        # Use DOM events to properly set value
        await cdp.evaluate(f"""
            (function() {{
                const el = document.querySelector('input[name="firstName"]');
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                nativeInputValueSetter.call(el, '{CONFIG["firstName"]}');
                el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                el.dispatchEvent(new Event('change', {{ bubbles: true }}));
            }})()
        """)
        await asyncio.sleep(0.5)
        
        await cdp.evaluate(f"""
            (function() {{
                const el = document.querySelector('input[name="lastName"]');
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                nativeInputValueSetter.call(el, '{CONFIG["lastName"]}');
                el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                el.dispatchEvent(new Event('change', {{ bubbles: true }}));
            }})()
        """)
        await asyncio.sleep(0.5)
        
        await cdp.screenshot("/home/ubuntu/AutoSignUp/screenshots/emu_cdp_name.png")
        
        # Click Next
        await cdp.evaluate("""
            (function() {
                for (const b of document.querySelectorAll('button')) {
                    if (b.textContent.trim() === 'Next') { b.click(); break; }
                }
            })()
        """)
        await asyncio.sleep(6)
        
        url = await cdp.evaluate("window.location.href")
        text = await cdp.evaluate("document.body.innerText")
        print(f"After name: {url}")
    
    # Step 2: Birthday + Gender
    if "birthday" in url.lower() or "Basic information" in text:
        print("\n[Step 2] Birthday + Gender...")
        await cdp.screenshot("/home/ubuntu/AutoSignUp/screenshots/emu_cdp_bday_before.png")
        
        # Open month dropdown
        await cdp.evaluate("""
            (function() {
                const section = document.querySelector('section') || document;
                const dropdowns = section.querySelectorAll('div[aria-expanded]');
                if (dropdowns.length > 0) dropdowns[0].click();
            })()
        """)
        await asyncio.sleep(1)
        
        # Select January
        await cdp.evaluate(f"""
            (function() {{
                for (const li of document.querySelectorAll('li')) {{
                    if (li.textContent.trim() === '{CONFIG["birthday_month"]}') {{ li.click(); break; }}
                }}
            }})()
        """)
        await asyncio.sleep(0.5)
        
        # Day
        await cdp.evaluate(f"""
            (function() {{
                const el = document.querySelector('input[name="day"]');
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                setter.call(el, '{CONFIG["birthday_day"]}');
                el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                el.dispatchEvent(new Event('change', {{ bubbles: true }}));
            }})()
        """)
        await asyncio.sleep(0.5)
        
        # Year
        await cdp.evaluate(f"""
            (function() {{
                const el = document.querySelector('input[name="year"]');
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                setter.call(el, '{CONFIG["birthday_year"]}');
                el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                el.dispatchEvent(new Event('change', {{ bubbles: true }}));
            }})()
        """)
        await asyncio.sleep(0.5)
        
        # Gender dropdown
        await cdp.evaluate("""
            (function() {
                const section = document.querySelector('section') || document;
                const dropdowns = section.querySelectorAll('div[aria-expanded]');
                if (dropdowns.length >= 2) dropdowns[1].click();
            })()
        """)
        await asyncio.sleep(1)
        
        await cdp.evaluate(f"""
            (function() {{
                for (const li of document.querySelectorAll('li')) {{
                    if (li.textContent.trim() === '{CONFIG["gender"]}') {{ li.click(); break; }}
                }}
            }})()
        """)
        await asyncio.sleep(0.5)
        
        await cdp.screenshot("/home/ubuntu/AutoSignUp/screenshots/emu_cdp_bday_after.png")
        
        # Next
        await cdp.evaluate("""
            (function() {
                for (const b of document.querySelectorAll('button')) {
                    if (b.textContent.trim() === 'Next') { b.click(); break; }
                }
            })()
        """)
        await asyncio.sleep(6)
        
        url = await cdp.evaluate("window.location.href")
        text = await cdp.evaluate("document.body.innerText")
        print(f"After birthday: {url}")
        print(f"Text: {text[:300]}")
    
    # Step 3: Username selection
    if "username" in url.lower() or "How you" in text or "sign in" in text.lower():
        print("\n[Step 3] Username step...")
        await cdp.screenshot("/home/ubuntu/AutoSignUp/screenshots/emu_cdp_username.png")
        
        # Check for "Use your existing email" button
        has_existing = await cdp.evaluate("""
            (function() {
                for (const b of document.querySelectorAll('button')) {
                    if (b.textContent.includes('existing email')) return true;
                }
                return false;
            })()
        """)
        
        if has_existing:
            print("  Clicking 'Use your existing email'...")
            await cdp.evaluate("""
                (function() {
                    for (const b of document.querySelectorAll('button')) {
                        if (b.textContent.includes('existing email')) { b.click(); break; }
                    }
                })()
            """)
            await asyncio.sleep(4)
        else:
            # Check for suggested usernames or custom username input
            text = await cdp.evaluate("document.body.innerText")
            print(f"  Page: {text[:500]}")
            
            # Try selecting "Create your own Gmail address" if available
            has_custom = await cdp.evaluate("""
                (function() {
                    for (const el of document.querySelectorAll('*')) {
                        if (el.textContent.includes('Create your own')) return true;
                    }
                    return false;
                })()
            """)
            
            if has_custom:
                await cdp.evaluate("""
                    (function() {
                        for (const el of document.querySelectorAll('div[role="radio"], label, span')) {
                            if (el.textContent.includes('Create your own')) { el.click(); break; }
                        }
                    })()
                """)
                await asyncio.sleep(1)
            
            # Fill username field if present
            username_input = await cdp.evaluate("document.querySelector('input[name=\"Username\"]') ? true : false")
            if username_input:
                # Generate a unique username
                import time
                username = f"david.carter.test.{int(time.time()) % 100000}"
                await cdp.evaluate(f"""
                    (function() {{
                        const el = document.querySelector('input[name="Username"]');
                        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                        setter.call(el, '{username}');
                        el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                        el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                    }})()
                """)
                print(f"  Entered username: {username}")
            
            # Click Next
            await cdp.evaluate("""
                (function() {
                    for (const b of document.querySelectorAll('button')) {
                        if (b.textContent.trim() === 'Next') { b.click(); break; }
                    }
                })()
            """)
            await asyncio.sleep(5)
        
        url = await cdp.evaluate("window.location.href")
        text = await cdp.evaluate("document.body.innerText")
        print(f"After username: {url}")
        print(f"Text: {text[:300]}")
    
    # Handle email entry for existing email path
    if "Username" in (await cdp.evaluate("document.body.innerText")) and await cdp.evaluate("document.querySelector('input[name=\"Username\"]') ? true : false"):
        print("\n[Step 3b] Entering email...")
        await cdp.evaluate(f"""
            (function() {{
                const el = document.querySelector('input[name="Username"]');
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                setter.call(el, '{CONFIG["email"]}');
                el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                el.dispatchEvent(new Event('change', {{ bubbles: true }}));
            }})()
        """)
        await cdp.evaluate("""
            (function() {
                for (const b of document.querySelectorAll('button')) {
                    if (b.textContent.trim() === 'Next') { b.click(); break; }
                }
            })()
        """)
        await asyncio.sleep(5)
        url = await cdp.evaluate("window.location.href")
        text = await cdp.evaluate("document.body.innerText")
        print(f"After email entry: {url}")
    
    # Email verification
    url = await cdp.evaluate("window.location.href")
    text = await cdp.evaluate("document.body.innerText")
    if "verifyemail" in url.lower() or "verify your email" in text.lower():
        print("\n[Step 4] Email verification...")
        await cdp.screenshot("/home/ubuntu/AutoSignUp/screenshots/emu_cdp_verify.png")
        code = await get_code_from_outlook_via_playwright()
        if code:
            print(f"  Code: {code}")
            await cdp.evaluate(f"""
                (function() {{
                    const el = document.querySelector('input[name="code"]');
                    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                    setter.call(el, '{code}');
                    el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                }})()
            """)
            await cdp.evaluate("""
                (function() {
                    for (const b of document.querySelectorAll('button')) {
                        if (b.textContent.trim() === 'Next') { b.click(); break; }
                    }
                })()
            """)
            await asyncio.sleep(5)
        else:
            print("  No code found!")

    # Password step
    url = await cdp.evaluate("window.location.href")
    text = await cdp.evaluate("document.body.innerText")
    if "password" in url.lower() or "strong password" in text.lower():
        print("\n[Step 5] Password...")
        await cdp.evaluate(f"""
            (function() {{
                const el = document.querySelector('input[name="Passwd"]');
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                setter.call(el, '{CONFIG["google_password"]}');
                el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                
                const el2 = document.querySelector('input[name="PasswdAgain"]');
                if (el2) {{
                    setter.call(el2, '{CONFIG["google_password"]}');
                    el2.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    el2.dispatchEvent(new Event('change', {{ bubbles: true }}));
                }}
            }})()
        """)
        await cdp.screenshot("/home/ubuntu/AutoSignUp/screenshots/emu_cdp_password.png")
        await cdp.evaluate("""
            (function() {
                for (const b of document.querySelectorAll('button')) {
                    if (b.textContent.trim() === 'Next') { b.click(); break; }
                }
            })()
        """)
        await asyncio.sleep(8)
    
    # Check final state
    url = await cdp.evaluate("window.location.href")
    text = await cdp.evaluate("document.body.innerText")
    print(f"\n[Final State]")
    print(f"URL: {url}")
    print(f"Text: {text[:600]}")
    await cdp.screenshot("/home/ubuntu/AutoSignUp/screenshots/emu_cdp_final.png")
    
    # List interactive elements
    buttons_text = await cdp.evaluate("""
        Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => t)
    """)
    inputs_info = await cdp.evaluate("""
        Array.from(document.querySelectorAll('input')).map(i => ({type: i.type, name: i.name}))
    """)
    print(f"Buttons: {buttons_text}")
    print(f"Inputs: {inputs_info}")
    
    # If phone verification, check for phone input
    if "phone" in url.lower() or "phone" in text.lower():
        print("\n[Phone verification page detected]")
        phone_inputs = await cdp.evaluate("""
            Array.from(document.querySelectorAll('input[type="tel"], input[name="phoneNumber"], input[name="phone"]')).length
        """)
        print(f"Phone number inputs: {phone_inputs}")
        
        # Check for "Add phone number" with actual input field
        all_inputs = await cdp.evaluate("""
            Array.from(document.querySelectorAll('input')).map(i => ({type: i.type, name: i.name, id: i.id, placeholder: i.placeholder}))
        """)
        print(f"All inputs: {all_inputs}")
    
    await cdp.close()

asyncio.run(main())
