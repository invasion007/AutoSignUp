"""
ChatGPT Plus 订阅自动化脚本 (Python CDP 版本)

通过 CDP 连接已打开的 Chrome 浏览器，自动完成 ChatGPT Plus 订阅流程。
适用于已经在浏览器中登录了 ChatGPT 的情况。

用法:
    python scripts/chatgpt_plus_subscribe.py
    python scripts/chatgpt_plus_subscribe.py --cdp-url http://localhost:29229
    python scripts/chatgpt_plus_subscribe.py --config config.json

前提:
    - Chrome 浏览器已开启 CDP (远程调试)
    - 已在浏览器中登录 ChatGPT
    - config.json 中包含 payment 支付信息

参考项目:
    - zxyyang/plus_gopay_gptp-plus
    - DanOps-1/Gpt-Agreement-Payment
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("请先安装 playwright:")
    print("  pip install playwright")
    sys.exit(1)


PROJECT_ROOT = Path(__file__).resolve().parent.parent


def load_config(config_path: str) -> dict:
    """加载配置文件"""
    path = Path(config_path)
    if not path.exists():
        print(f"未找到配置文件: {config_path}")
        print("请先复制 config.example.json 并填写信息：")
        print("   cp config.example.json config.json")
        sys.exit(1)

    with open(path, encoding="utf-8") as f:
        config = json.load(f)

    if "payment" not in config:
        print("config.json 中缺少 payment（支付信息）配置。")
        print("请参考 config.example.json 添加 payment 字段。")
        sys.exit(1)

    return config


def log(step: int, message: str) -> None:
    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] 步骤 {step}: {message}")


def log_info(message: str) -> None:
    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] ℹ️  {message}")


def save_screenshot(page, name: str) -> str:
    screenshot_dir = PROJECT_ROOT / "screenshots"
    screenshot_dir.mkdir(exist_ok=True)
    path = screenshot_dir / f"{name}-{int(time.time())}.png"
    try:
        page.screenshot(path=str(path), full_page=True)
        log_info(f"截图已保存: {path}")
    except Exception:
        log_info(f"截图失败: {name}")
    return str(path)


def safe_fill(page, selector: str, text: str, timeout: int = 5000) -> bool:
    """安全填写输入框"""
    try:
        el = page.wait_for_selector(selector, state="visible", timeout=timeout)
        if el:
            el.click(click_count=3)
            page.keyboard.press("Backspace")
            page.type(selector, text, delay=50)
            return True
    except Exception:
        pass
    return False


def safe_click(page, selector: str, timeout: int = 5000) -> bool:
    """安全点击元素"""
    try:
        el = page.wait_for_selector(selector, state="visible", timeout=timeout)
        if el:
            el.click()
            return True
    except Exception:
        pass
    return False


# ---------------------------------------------------------------------------
# 步骤实现
# ---------------------------------------------------------------------------


def check_login(page) -> bool:
    """检查 ChatGPT 是否已登录"""
    log(1, "检查 ChatGPT 登录状态...")

    page.goto("https://chatgpt.com", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(3000)

    url = page.url
    if "auth" in url or "login" in url:
        log(1, "未登录 ChatGPT！请先在浏览器中登录。")
        return False

    log(1, "已登录 ChatGPT")
    return True


def navigate_to_upgrade(page) -> bool:
    """导航到升级页面"""
    log(2, "导航到 ChatGPT Plus 升级页面...")

    # 方式1: 直接访问定价页面
    page.goto("https://chatgpt.com/#pricing", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(3000)

    # 查找 Plus 升级按钮
    plus_selectors = [
        'button:has-text("Get Plus")',
        'button:has-text("Upgrade to Plus")',
        'button:has-text("Subscribe to Plus")',
        'a:has-text("Get Plus")',
        'a:has-text("Upgrade to Plus")',
    ]

    for sel in plus_selectors:
        try:
            el = page.locator(sel).first
            if el.is_visible(timeout=2000):
                log_info(f"找到按钮: {sel}")
                return True
        except Exception:
            continue

    # 方式2: 通过侧边栏
    log_info("尝试通过侧边栏查找升级选项...")
    profile_selectors = [
        'button[aria-label="User menu"]',
        'button[data-testid="profile-button"]',
        'img[alt="User"]',
    ]

    for sel in profile_selectors:
        if safe_click(page, sel, timeout=3000):
            page.wait_for_timeout(1000)
            break

    upgrade_selectors = [
        'a:has-text("Upgrade")',
        'button:has-text("Upgrade")',
        'a:has-text("My plan")',
    ]

    for sel in upgrade_selectors:
        if safe_click(page, sel, timeout=3000):
            page.wait_for_timeout(3000)
            return True

    # 方式3: 设置页面
    log_info("尝试通过设置页面...")
    page.goto("https://chatgpt.com/settings", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(2000)

    sub_selectors = [
        'a:has-text("Subscription")',
        'a:has-text("Manage subscription")',
        'a:has-text("Upgrade")',
    ]

    for sel in sub_selectors:
        if safe_click(page, sel, timeout=5000):
            page.wait_for_timeout(3000)
            return True

    save_screenshot(page, "upgrade-page")
    return False


def select_plus_plan(page) -> bool:
    """选择 Plus 计划并进入 Stripe Checkout"""
    log(3, "选择 Plus 计划...")

    selectors = [
        'button:has-text("Get Plus")',
        'button:has-text("Upgrade to Plus")',
        'button:has-text("Subscribe to Plus")',
        'button:has-text("Upgrade")',
        'a:has-text("Get Plus")',
        'a:has-text("Upgrade to Plus")',
    ]

    for sel in selectors:
        try:
            el = page.locator(sel).first
            if el.is_visible(timeout=2000):
                log_info(f"点击: {sel}")
                el.click()
                page.wait_for_timeout(5000)

                url = page.url
                if "pay.openai.com" in url or "checkout.stripe.com" in url:
                    log(3, "已进入 Stripe Checkout 页面！")
                    return True
                break
        except Exception:
            continue

    # 等待 Stripe 页面
    page.wait_for_timeout(3000)
    url = page.url
    if "pay.openai.com" in url or "checkout.stripe.com" in url:
        return True

    try:
        page.wait_for_url(
            lambda u: "pay.openai.com" in u or "checkout.stripe.com" in u,
            timeout=30000,
        )
        return True
    except Exception:
        log_info("未自动跳转到 Stripe Checkout")
        save_screenshot(page, "checkout-issue")
        return False


def fill_stripe_checkout(page, payment: dict) -> bool:
    """填写 Stripe Checkout 支付信息"""
    log(4, "填写 Stripe Checkout 支付信息...")
    page.wait_for_timeout(3000)
    save_screenshot(page, "stripe-checkout")

    url = page.url
    log_info(f"Stripe Checkout URL: {url}")

    # 邮箱
    if payment.get("email"):
        if safe_fill(page, '#email, input[name="email"]', payment["email"]):
            log_info(f"已填写邮箱: {payment['email']}")

    # 卡号
    card_filled = safe_fill(
        page,
        '#cardNumber, input[name="cardNumber"], input[autocomplete="cc-number"]',
        payment["cardNumber"],
    )

    if not card_filled:
        log_info("尝试通过 Stripe iframe 填写卡号...")
        for frame in page.frames:
            frame_url = frame.url
            if "stripe.com" in frame_url:
                try:
                    card_input = frame.locator(
                        'input[name="cardnumber"], input[name="cardNumber"]'
                    ).first
                    if card_input.is_visible(timeout=3000):
                        card_input.fill(payment["cardNumber"])
                        card_filled = True
                        log_info("通过 iframe 填写了卡号")
                        break
                except Exception:
                    continue

    if card_filled:
        log_info("已填写卡号")
    else:
        log_info("无法自动填写卡号，请手动输入")

    # 有效期
    if safe_fill(
        page,
        '#cardExpiry, input[name="cardExpiry"], input[autocomplete="cc-exp"]',
        payment["expiry"],
    ):
        log_info("已填写有效期")

    # CVC
    if safe_fill(
        page,
        '#cardCvc, input[name="cardCvc"], input[autocomplete="cc-csc"]',
        payment["cvc"],
    ):
        log_info("已填写 CVC")

    # 持卡人姓名
    if payment.get("cardholderName"):
        if safe_fill(
            page,
            '#billingName, input[name="billingName"], input[autocomplete="cc-name"]',
            payment["cardholderName"],
        ):
            log_info(f"已填写持卡人姓名: {payment['cardholderName']}")

    # 国家
    if payment.get("country"):
        try:
            sel = page.locator(
                '#billingCountry, select[name="billingCountry"]'
            ).first
            if sel.is_visible(timeout=3000):
                sel.select_option(label=payment["country"])
                log_info(f"已选择国家: {payment['country']}")
        except Exception:
            pass

    # 邮编
    if payment.get("postalCode"):
        if safe_fill(
            page,
            '#billingPostalCode, input[name="billingPostalCode"], input[autocomplete="postal-code"]',
            payment["postalCode"],
        ):
            log_info(f"已填写邮编: {payment['postalCode']}")

    save_screenshot(page, "stripe-filled")
    log(4, "支付信息填写完成")
    return card_filled


def submit_subscription(page, auto_submit: bool = False) -> bool:
    """提交订阅"""
    log(5, "准备提交订阅...")

    if not auto_submit:
        print()
        print("╔══════════════════════════════════════════════════╗")
        print("║        请检查支付信息是否正确                       ║")
        print("║        30 秒后脚本将自动提交                       ║")
        print("║        或设置 --auto-submit 跳过等待              ║")
        print("╚══════════════════════════════════════════════════╝")
        print()
        time.sleep(30)

    submit_selectors = [
        'button:has-text("Subscribe")',
        'button:has-text("Pay")',
        'button:has-text("Start subscription")',
        'button[type="submit"]',
        ".SubmitButton",
    ]

    for sel in submit_selectors:
        if safe_click(page, sel, timeout=3000):
            log(5, f"已点击提交按钮")
            page.wait_for_timeout(10000)
            save_screenshot(page, "after-submit")
            return True

    log_info("未找到提交按钮，请手动点击提交")
    save_screenshot(page, "no-submit-button")
    return False


def verify_subscription(page) -> bool:
    """验证订阅结果"""
    log(6, "验证订阅结果...")
    page.wait_for_timeout(5000)

    url = page.url
    log_info(f"当前 URL: {url}")

    if "chatgpt.com" in url:
        log_info("已返回 ChatGPT 页面")

    if "success" in url or "thank" in url:
        log(6, "支付成功！")
        return True

    save_screenshot(page, "verify-result")
    log_info("请手动确认订阅是否成功")
    return False


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description="ChatGPT Plus 订阅自动化 (CDP)")
    parser.add_argument(
        "--cdp-url",
        default="http://localhost:29229",
        help="Chrome CDP 远程调试地址 (默认: http://localhost:29229)",
    )
    parser.add_argument(
        "--config",
        default=str(PROJECT_ROOT / "config.json"),
        help="配置文件路径 (默认: config.json)",
    )
    parser.add_argument(
        "--auto-submit",
        action="store_true",
        help="跳过确认直接提交支付",
    )
    args = parser.parse_args()

    config = load_config(args.config)
    payment = config["payment"]

    print("╔══════════════════════════════════════════════════╗")
    print("║       ChatGPT Plus 订阅自动化工具 (CDP)           ║")
    print("╚══════════════════════════════════════════════════╝")
    print()
    print(f"CDP 地址: {args.cdp_url}")
    print(f"配置文件: {args.config}")
    print(f"自动提交: {'是' if args.auto_submit else '否'}")
    print()

    with sync_playwright() as p:
        log(0, f"连接浏览器: {args.cdp_url}")
        browser = p.chromium.connect_over_cdp(args.cdp_url)

        contexts = browser.contexts
        context = contexts[0] if contexts else browser.new_context()
        pages = context.pages
        page = pages[0] if pages else context.new_page()

        try:
            # 检查登录状态
            if not check_login(page):
                print()
                print("请先在浏览器中登录 ChatGPT，然后重新运行此脚本。")
                print("或使用 Node.js 版本（支持自动登录）:")
                print("  node scripts/chatgpt-plus-subscribe.mjs")
                sys.exit(1)

            # 导航到升级页面
            navigate_to_upgrade(page)

            # 选择 Plus 计划
            if not select_plus_plan(page):
                print()
                print("无法进入 Stripe Checkout。可能的原因：")
                print("  1. 账号已经是 Plus 会员")
                print("  2. 页面结构已变化")
                print("  3. 需要额外验证")
                save_screenshot(page, "checkout-failed")
                sys.exit(1)

            # 填写支付信息
            fill_stripe_checkout(page, payment)

            # 提交订阅
            submitted = submit_subscription(page, auto_submit=args.auto_submit)

            # 验证结果
            if submitted:
                verify_subscription(page)

            print()
            print("═══════════════════════════════════════════════════")
            print("  流程结束。请检查浏览器确认订阅状态。")
            print("═══════════════════════════════════════════════════")
            print()

        except Exception as e:
            print(f"\n订阅过程中出错: {e}")
            save_screenshot(page, "error")
            raise


if __name__ == "__main__":
    main()
