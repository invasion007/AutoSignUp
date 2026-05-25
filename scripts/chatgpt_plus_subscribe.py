#!/usr/bin/env python3
"""
ChatGPT Plus 订阅自动化脚本（Python CDP 版本）

参考 FoundZiGu/GuJumpgate 项目的方法，通过 ChatGPT 后端 API 创建
Stripe Checkout 会话，然后自动填写账单信息并提交订阅。

两种订阅路径：
  路径 A（推荐）：API 创建 Checkout → PayPal 支付（含免费试用 promo）
  路径 B：API 创建 Checkout → 信用卡支付

用法:
  python scripts/chatgpt_plus_subscribe.py                        # 默认 PayPal
  python scripts/chatgpt_plus_subscribe.py --payment card         # 信用卡
  python scripts/chatgpt_plus_subscribe.py --auto-submit          # 跳过确认
  python scripts/chatgpt_plus_subscribe.py --cdp-url http://localhost:9222

参考项目:
  - FoundZiGu/GuJumpgate（浏览器扩展，PayPal 通道全流程自动化）
  - zxyyang/plus_gopay_gptp-plus（PayPal 通道批量工具）
  - DanOps-1/Gpt-Agreement-Payment（协议重放工具集）
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------------------
# 常量（参考 GuJumpgate plus-checkout.js）
# ---------------------------------------------------------------------------

CHECKOUT_API_URL = "https://chatgpt.com/backend-api/payments/checkout"

CHECKOUT_PAYLOAD_PAYPAL = {
    "entry_point": "all_plans_pricing_modal",
    "plan_name": "chatgptplusplan",
    "promo_campaign": {
        "promo_campaign_id": "plus-1-month-free",
        "is_coupon_from_query_param": False,
    },
    "checkout_ui_mode": "hosted",
    "billing_details": {
        "country": "US",
        "currency": "USD",
    },
}

CHECKOUT_PAYLOAD_CARD = {
    "entry_point": "all_plans_pricing_modal",
    "plan_name": "chatgptplusplan",
    "checkout_ui_mode": "custom",
    "billing_details": {
        "country": "US",
        "currency": "USD",
    },
}

US_ADDRESS = {
    "address1": "Broadway",
    "city": "New York",
    "region": "New York",
    "postalCode": "10007",
}


# ---------------------------------------------------------------------------
# 工具
# ---------------------------------------------------------------------------

def log(step, message):
    t = time.strftime("%H:%M:%S")
    print(f"[{t}] 步骤 {step}: {message}")


def log_info(message):
    t = time.strftime("%H:%M:%S")
    print(f"[{t}] ℹ️  {message}")


def save_screenshot(page, name):
    d = PROJECT_ROOT / "screenshots"
    d.mkdir(exist_ok=True)
    path = d / f"{name}-{int(time.time())}.png"
    try:
        page.screenshot(path=str(path), full_page=True)
        log_info(f"截图已保存: {path}")
    except Exception:
        pass
    return path


def safe_type(page, selector, text, *, timeout=10000, clear=True):
    try:
        page.wait_for_selector(selector, state="visible", timeout=timeout)
        if clear:
            page.click(selector, click_count=3)
            page.keyboard.press("Backspace")
        page.type(selector, text, delay=50)
        return True
    except Exception:
        return False


def load_config(config_path=None):
    path = Path(config_path) if config_path else PROJECT_ROOT / "config.json"
    if not path.exists():
        print("未找到 config.json，请先复制 config.example.json 并填写信息")
        sys.exit(1)
    return json.loads(path.read_text("utf-8"))


# ---------------------------------------------------------------------------
# 步骤 1: 连接浏览器 (CDP)
# ---------------------------------------------------------------------------

def connect_browser(pw, cdp_url):
    log(0, f"通过 CDP 连接浏览器: {cdp_url}")
    browser = pw.chromium.connect_over_cdp(cdp_url)
    contexts = browser.contexts
    ctx = contexts[0] if contexts else browser.new_context()
    pages = ctx.pages
    page = pages[0] if pages else ctx.new_page()
    return browser, ctx, page


# ---------------------------------------------------------------------------
# 步骤 2: 获取 accessToken
# ---------------------------------------------------------------------------

def get_access_token(page):
    log(1, "获取 ChatGPT 登录会话...")

    page.goto("https://chatgpt.com", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(3000)

    url = page.url
    if "auth" in url or "login" in url:
        raise RuntimeError("未登录 ChatGPT！请先在浏览器中登录。")

    log(1, "已登录，正在获取 accessToken...")

    session = page.evaluate("""async () => {
        const resp = await fetch('/api/auth/session', { credentials: 'include' });
        return resp.json();
    }""")

    token = (session or {}).get("accessToken", "")
    if not token:
        raise RuntimeError("无法获取 accessToken")

    log_info("accessToken 获取成功")
    return token


# ---------------------------------------------------------------------------
# 步骤 3: 通过 API 创建 Checkout 会话（核心 — 参考 GuJumpgate）
# ---------------------------------------------------------------------------

def create_checkout_session(page, access_token, payment_method):
    log(2, f"通过 API 创建 Checkout 会话 ({payment_method})...")

    payload = CHECKOUT_PAYLOAD_PAYPAL if payment_method == "paypal" else CHECKOUT_PAYLOAD_CARD

    result = page.evaluate("""async ({ url, token, body }) => {
        const resp = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: {
                Authorization: 'Bearer ' + token,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        const data = await resp.json().catch(() => ({}));
        return { ok: resp.ok, status: resp.status, data };
    }""", {"url": CHECKOUT_API_URL, "token": access_token, "body": payload})

    if not result["ok"] or not result["data"].get("checkout_session_id"):
        detail = result["data"].get("detail") or result["data"].get("message") or f"HTTP {result['status']}"
        raise RuntimeError(f"创建 Checkout 会话失败：{detail}")

    session_id = result["data"]["checkout_session_id"]
    entity = "openai_ie" if payment_method == "paypal" else "openai_llc"
    checkout_url = f"https://chatgpt.com/checkout/{entity}/{session_id}"

    # 查找 hosted checkout URL
    hosted_url = ""
    def find_url(obj):
        nonlocal hosted_url
        if hosted_url:
            return
        if isinstance(obj, dict):
            for v in obj.values():
                if isinstance(v, str) and ("pay.openai.com" in v or "checkout.stripe.com" in v):
                    hosted_url = v
                    return
                find_url(v)
        elif isinstance(obj, list):
            for item in obj:
                find_url(item)
    find_url(result["data"])

    log(2, "Checkout 会话创建成功！")
    log_info(f"Session ID: {session_id}")
    log_info(f"Checkout URL: {checkout_url}")
    if hosted_url:
        log_info(f"Hosted URL: {hosted_url}")

    return {
        "session_id": session_id,
        "checkout_url": checkout_url,
        "hosted_url": hosted_url,
        "entity": entity,
    }


# ---------------------------------------------------------------------------
# 步骤 4: 打开 Checkout 页面
# ---------------------------------------------------------------------------

def open_checkout_page(page, checkout_info, payment_method):
    log(3, "打开 Checkout 页面...")

    target = (checkout_info["hosted_url"] or checkout_info["checkout_url"]) \
        if payment_method == "paypal" else checkout_info["checkout_url"]

    log_info(f"导航到: {target}")
    page.goto(target, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(5000)
    save_screenshot(page, "checkout-page")


# ---------------------------------------------------------------------------
# 步骤 5A: PayPal 支付流程
# ---------------------------------------------------------------------------

def handle_paypal_checkout(page, config):
    log(4, "PayPal 支付流程...")

    # 选择 PayPal
    paypal_selectors = [
        '[data-testid="paypal-accordion-item-button"]',
        '.paypal-accordion-item button',
    ]
    paypal_selected = False
    for sel in paypal_selectors:
        try:
            el = page.locator(sel).first
            if el.is_visible(timeout=3000):
                el.click()
                page.wait_for_timeout(1000)
                el.click()
                paypal_selected = True
                log_info(f"已选择 PayPal: {sel}")
                break
        except Exception:
            continue

    page.wait_for_timeout(3000)

    # 账单地址
    addr = (config.get("payment") or {}).get("billingAddress") or US_ADDRESS
    select_country_us(page)

    safe_type(page, '#billingAddressLine1', addr.get("address1", "Broadway"), timeout=5000)
    safe_type(page, '#billingLocality', addr.get("city", "New York"), timeout=3000)
    safe_type(page, '#billingPostalCode', addr.get("postalCode", "10007"), timeout=3000)

    # 州
    state_val = addr.get("region", "New York")
    try:
        sel = page.locator('#billingAdministrativeArea').first
        if sel.is_visible(timeout=3000):
            sel.select_option(label=state_val)
            log_info(f"已选择州: {state_val}")
    except Exception:
        safe_type(page, 'input[name="billingAdministrativeArea"]', state_val, timeout=3000)

    # 姓名
    name = (config.get("payment") or {}).get("cardholderName", "")
    if name:
        fill_full_name(page, name)

    # 服务条款
    check_terms(page)

    page.wait_for_timeout(2000)
    save_screenshot(page, "paypal-billing-filled")
    log(4, "PayPal 账单信息填写完成")


# ---------------------------------------------------------------------------
# 步骤 5B: 信用卡支付流程
# ---------------------------------------------------------------------------

def handle_card_checkout(page, config):
    log(4, "信用卡支付流程...")

    payment = config.get("payment", {})

    if payment.get("email"):
        if safe_type(page, '#email', payment["email"], timeout=5000):
            log_info(f"已填写邮箱: {payment['email']}")

    if payment.get("cardNumber"):
        if safe_type(page, '#cardNumber', payment["cardNumber"], timeout=5000):
            log_info("已填写卡号")

    if payment.get("expiry"):
        if safe_type(page, '#cardExpiry', payment["expiry"], timeout=3000):
            log_info("已填写有效期")

    if payment.get("cvc"):
        if safe_type(page, '#cardCvc', payment["cvc"], timeout=3000):
            log_info("已填写 CVC")

    if payment.get("cardholderName"):
        fill_full_name(page, payment["cardholderName"])

    select_country_us(page)

    if payment.get("postalCode"):
        safe_type(page, '#billingPostalCode', payment["postalCode"], timeout=3000)

    check_terms(page)
    save_screenshot(page, "card-billing-filled")
    log(4, "信用卡信息填写完成")


# ---------------------------------------------------------------------------
# 步骤 6: 提交订阅
# ---------------------------------------------------------------------------

def submit_subscription(page, auto_submit):
    log(5, "提交订阅...")

    if not auto_submit:
        print()
        print("╔══════════════════════════════════════════════════╗")
        print("║   请检查页面上的支付信息是否正确                    ║")
        print("║   30 秒后自动提交                                ║")
        print("╚══════════════════════════════════════════════════╝")
        print()
        time.sleep(30)

    submit_selectors = [
        'button[data-testid="submit-button"]',
        'button[data-testid="hosted-payment-submit-button"]',
        'button.SubmitButton--complete',
        'button:has-text("Subscribe")',
        'button:has-text("Pay")',
        'button:has-text("Start subscription")',
        'button:has-text("Next")',
        'button:has-text("Continue")',
        'button[type="submit"]',
    ]

    for sel in submit_selectors:
        try:
            btn = page.locator(sel).first
            if btn.is_visible(timeout=2000) and btn.is_enabled():
                log_info(f"点击提交: {sel}")
                btn.click()
                log(5, "已提交订阅！")
                page.wait_for_timeout(10000)
                save_screenshot(page, "after-submit")
                return True
        except Exception:
            continue

    log_info("未找到提交按钮，请手动提交")
    save_screenshot(page, "no-submit-button")
    return False


# ---------------------------------------------------------------------------
# 辅助
# ---------------------------------------------------------------------------

def select_country_us(page):
    for sel in ['#billingCountry', 'select[name="billingCountry"]']:
        try:
            el = page.locator(sel).first
            if el.is_visible(timeout=3000):
                el.select_option("US")
                log_info("已选择国家: US")
                return True
        except Exception:
            continue
    return False


def fill_full_name(page, name):
    for sel in ['#billingName', 'input[name="billingName"]']:
        if safe_type(page, sel, name, timeout=3000):
            log_info(f"已填写姓名: {name}")
            return True
    return False


def check_terms(page):
    try:
        cb = page.locator('#termsOfServiceConsentCheckbox').first
        if cb.is_visible(timeout=3000) and not cb.is_checked():
            cb.click()
            log_info("已勾选服务条款")
    except Exception:
        pass


# ---------------------------------------------------------------------------
# 步骤 7: 验证结果
# ---------------------------------------------------------------------------

def verify_subscription(page):
    log(6, "验证订阅结果...")
    page.wait_for_timeout(5000)

    url = page.url
    log_info(f"当前 URL: {url}")

    if "paypal.com" in url:
        log_info("已跳转到 PayPal，请在 PayPal 中完成支付")
        return "paypal_redirect"
    if "success" in url or "thank" in url:
        log(6, "支付成功！")
        return "success"

    save_screenshot(page, "verify-result")
    return "unknown"


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="ChatGPT Plus 订阅自动化（GuJumpgate 方案）")
    parser.add_argument("--cdp-url", default="http://localhost:29229", help="CDP 地址")
    parser.add_argument("--config", default=None, help="配置文件路径")
    parser.add_argument("--payment", choices=["paypal", "card"], default="paypal", help="支付方式")
    parser.add_argument("--auto-submit", action="store_true", help="跳过确认等待")
    args = parser.parse_args()

    config = load_config(args.config)

    print("╔══════════════════════════════════════════════════╗")
    print("║    ChatGPT Plus 订阅自动化（GuJumpgate 方案）      ║")
    print("╚══════════════════════════════════════════════════╝")
    print()
    print(f"CDP 地址: {args.cdp_url}")
    print(f"支付方式: {'PayPal（含免费试用 promo）' if args.payment == 'paypal' else '信用卡'}")
    print(f"自动提交: {'是' if args.auto_submit else '否（等待30秒确认）'}")
    print()

    if args.payment == "paypal":
        print(">>> PayPal 模式：使用 plus-1-month-free promo 获得免费试用")
        print(">>> 首月 $0，之后 $20/月（可随时取消）")
        print()

    with sync_playwright() as pw:
        browser, ctx, page = connect_browser(pw, args.cdp_url)

        try:
            token = get_access_token(page)
            checkout_info = create_checkout_session(page, token, args.payment)
            open_checkout_page(page, checkout_info, args.payment)

            if args.payment == "paypal":
                handle_paypal_checkout(page, config)
            else:
                handle_card_checkout(page, config)

            submitted = submit_subscription(page, args.auto_submit)

            if submitted:
                result = verify_subscription(page)
                if result == "paypal_redirect":
                    log_info("等待 PayPal 支付完成...")
                    try:
                        page.wait_for_url(lambda u: "paypal.com" not in u, timeout=600000)
                        verify_subscription(page)
                    except Exception:
                        log_info("PayPal 支付超时，请手动完成")

            print()
            print("═══════════════════════════════════════════════════")
            print("  流程结束。请检查浏览器确认订阅状态。")
            print("═══════════════════════════════════════════════════")

        except Exception as e:
            print(f"\n订阅过程中出错: {e}")
            save_screenshot(page, "error")
            sys.exit(1)


if __name__ == "__main__":
    main()
