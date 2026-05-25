"""
Google 账号注册自动化脚本 (Playwright + CDP)

使用方法:
1. 确保 Chrome 浏览器已经在运行，且开启了 CDP 调试端口 (默认 localhost:29229)
2. 安装依赖: pip install playwright
3. 运行: python google_register.py --first-name "名" --last-name "姓" --email "邮箱名" --password "密码"

注意: 
- 注册流程中有 QR 码验证步骤，需要用户手动扫码完成
- 脚本会在验证步骤暂停并等待用户完成验证
- 验证完成后脚本会自动继续后续步骤
"""

import argparse
import asyncio
import sys
import time
from playwright.async_api import async_playwright


# ============= 注册流程步骤 =============
# Step 1: 输入姓名 (First name, Last name)
#   URL: accounts.google.com/lifecycle/steps/signup/name
#   字段: firstName (必填), lastName (可选)
#
# Step 2: 基本信息 - 生日和性别
#   URL: accounts.google.com/lifecycle/steps/signup/birthdaygender
#   字段: Month (下拉框), Day (数字), Year (数字), Gender (下拉框)
#   Gender 选项: Female, Male, Rather not say, Custom
#
# Step 3: 创建邮箱地址
#   URL: accounts.google.com/lifecycle/steps/signup/username
#   选项: 推荐邮箱(单选), 自定义邮箱(单选+输入框), 使用现有邮箱(按钮)
#
# Step 4: 创建密码
#   URL: accounts.google.com/lifecycle/steps/signup/password
#   字段: Password, Confirm (确认密码)
#   复选框: Show password
#
# Step 5: 验证身份 (QR 码 / 手机验证)
#   URL: accounts.google.com/lifecycle/steps/signup/mophoneverification/initial
#   需要用手机扫描 QR 码 - 此步骤需要人工干预
#
# Step 6: (验证后) 添加恢复邮箱 (可选)
# Step 7: (验证后) 同意条款
# =========================================


async def register_google_account(
    first_name: str,
    last_name: str,
    email: str,
    password: str,
    birth_month: str = "January",
    birth_day: str = "15",
    birth_year: str = "1990",
    gender: str = "Rather not say",
    cdp_url: str = "http://localhost:29229",
):
    """
    自动执行 Google 账号注册流程 (直到 QR 码验证步骤暂停)
    
    Args:
        first_name: 名
        last_name: 姓
        email: 想要的 Gmail 用户名 (不含 @gmail.com)
        password: 密码 (至少8位,包含字母数字符号)
        birth_month: 出生月份 (英文: January-December)
        birth_day: 出生日
        birth_year: 出生年份
        gender: 性别 (Female/Male/Rather not say/Custom)
        cdp_url: Chrome DevTools Protocol 端口地址
    """
    async with async_playwright() as p:
        # 连接到已运行的 Chrome 浏览器
        print(f"[INFO] 正在连接到 Chrome CDP: {cdp_url}")
        browser = await p.chromium.connect_over_cdp(cdp_url)
        
        # 获取默认上下文和页面
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else await context.new_page()
        
        # ===== Step 1: 导航到注册页面并输入姓名 =====
        print("[Step 1/5] 正在导航到 Google 注册页面...")
        await page.goto("https://accounts.google.com/signup")
        await page.wait_for_selector('input[name="firstName"]', timeout=15000)
        
        print(f"[Step 1/5] 输入姓名: {first_name} {last_name}")
        await page.fill('input[name="firstName"]', first_name)
        if last_name:
            await page.fill('input[name="lastName"]', last_name)
        
        # 点击 Next
        await page.click('button:has-text("Next")')
        await page.wait_for_url("**/birthdaygender**", timeout=10000)
        print("[Step 1/5] ✓ 姓名已填写")
        
        # ===== Step 2: 填写生日和性别 =====
        print(f"[Step 2/5] 填写生日: {birth_month} {birth_day}, {birth_year}")
        
        # 选择月份 — 使用 JS 点击 section 内的下拉框，避免误击 footer 语言选择器
        await page.evaluate("""() => {
            const section = document.querySelector('section');
            const dropdowns = section.querySelectorAll('div[aria-expanded]');
            if (dropdowns[0]) dropdowns[0].click();
        }""")
        await asyncio.sleep(1)
        await page.evaluate(f"""(month) => {{
            const items = document.querySelectorAll('li');
            for (const li of items) {{
                if (li.textContent.trim() === month) {{ li.click(); break; }}
            }}
        }}""", birth_month)
        await asyncio.sleep(0.5)
        
        # 填写日期和年份
        await page.fill('input[name="day"]', birth_day)
        await page.fill('input[name="year"]', birth_year)
        
        # 选择性别 — 使用 JS 点击 section 内的第二个下拉框
        print(f"[Step 2/5] 选择性别: {gender}")
        await page.evaluate("""() => {
            const section = document.querySelector('section');
            const dropdowns = section.querySelectorAll('div[aria-expanded]');
            if (dropdowns.length >= 2) dropdowns[1].click();
        }""")
        await asyncio.sleep(1)
        await page.evaluate(f"""(gender) => {{
            const items = document.querySelectorAll('li');
            for (const li of items) {{
                if (li.textContent.trim() === gender) {{ li.click(); break; }}
            }}
        }}""", gender)
        await asyncio.sleep(0.5)
        
        # 点击 Next
        await page.click('button:has-text("Next")')
        await page.wait_for_url("**/username**", timeout=10000)
        print("[Step 2/5] ✓ 生日和性别已填写")
        
        # ===== Step 3: 选择/创建邮箱地址 =====
        print(f"[Step 3/5] 创建邮箱地址: {email}@gmail.com")
        
        # 点击 "Create your own Gmail address"
        await page.click('div:has-text("Create your own Gmail address")')
        await page.wait_for_selector('input[name="Username"]', timeout=5000)
        
        # 输入自定义邮箱名
        await page.fill('input[name="Username"]', email)
        
        # 点击 Next
        await page.click('button:has-text("Next")')
        await page.wait_for_url("**/password**", timeout=10000)
        print("[Step 3/5] ✓ 邮箱地址已创建")
        
        # ===== Step 4: 创建密码 =====
        print("[Step 4/5] 设置密码...")
        
        await page.fill('input[name="Passwd"]', password)
        await page.fill('input[name="PasswdAgain"]', password)
        
        # 点击 Next
        await page.click('button:has-text("Next")')
        print("[Step 4/5] ✓ 密码已设置")
        
        # ===== Step 5: 等待 QR 码验证 =====
        # 等待验证页面加载
        await page.wait_for_url("**/mophoneverification/**", timeout=15000)
        print("")
        print("=" * 60)
        print("[Step 5/5] ⚠️  需要手动验证!")
        print("=" * 60)
        print("")
        print("请用手机扫描屏幕上的 QR 码完成验证。")
        print("步骤:")
        print("  1. 打开手机相机 App")
        print("  2. 扫描屏幕上的 QR 码")
        print("  3. 点击链接并完成手机上的验证步骤")
        print("  4. 验证完成后，此页面会自动跳转")
        print("")
        print("正在等待验证完成...")
        print("(超时时间: 5 分钟)")
        print("")
        
        # 等待页面离开验证页面 (最长等待5分钟)
        try:
            await page.wait_for_url(
                lambda url: "mophoneverification" not in url,
                timeout=300000  # 5 minutes
            )
            print("[Step 5/5] ✓ 验证完成!")
            
            # 验证后可能有额外步骤 (恢复邮箱、条款等)
            await handle_post_verification(page)
            
        except Exception as e:
            print(f"[ERROR] 验证超时或出错: {e}")
            print("请手动完成剩余注册步骤。")
            return False
        
        print("")
        print("=" * 60)
        print("🎉 Google 账号注册流程完成!")
        print(f"   邮箱: {email}@gmail.com")
        print("=" * 60)
        return True


async def handle_post_verification(page):
    """处理验证完成后的额外步骤"""
    await asyncio.sleep(2)
    
    current_url = page.url
    
    # 可能的步骤: 添加恢复邮箱
    if "recovery" in current_url.lower():
        print("[后续步骤] 跳过添加恢复邮箱...")
        skip_btn = page.locator('button:has-text("Skip")')
        if await skip_btn.count() > 0:
            await skip_btn.click()
            await asyncio.sleep(2)
    
    # 可能的步骤: 同意条款
    current_url = page.url
    if "tos" in current_url.lower() or "terms" in current_url.lower():
        print("[后续步骤] 同意服务条款...")
        agree_btn = page.locator('button:has-text("I agree")')
        if await agree_btn.count() > 0:
            await agree_btn.click()
            await asyncio.sleep(2)


def main():
    parser = argparse.ArgumentParser(
        description="Google 账号注册自动化脚本 (无障碍辅助工具)"
    )
    parser.add_argument("--first-name", required=True, help="名 (First name)")
    parser.add_argument("--last-name", default="", help="姓 (Last name, 可选)")
    parser.add_argument("--email", required=True, help="Gmail 用户名 (不含 @gmail.com)")
    parser.add_argument("--password", required=True, help="密码 (至少8位,包含字母数字符号)")
    parser.add_argument("--birth-month", default="January", help="出生月份 (英文)")
    parser.add_argument("--birth-day", default="15", help="出生日")
    parser.add_argument("--birth-year", default="1990", help="出生年份")
    parser.add_argument("--gender", default="Rather not say", 
                       choices=["Female", "Male", "Rather not say", "Custom"],
                       help="性别")
    parser.add_argument("--cdp-url", default="http://localhost:29229",
                       help="Chrome DevTools Protocol URL")
    
    args = parser.parse_args()
    
    success = asyncio.run(register_google_account(
        first_name=args.first_name,
        last_name=args.last_name,
        email=args.email,
        password=args.password,
        birth_month=args.birth_month,
        birth_day=args.birth_day,
        birth_year=args.birth_year,
        gender=args.gender,
        cdp_url=args.cdp_url,
    ))
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
