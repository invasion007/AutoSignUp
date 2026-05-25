---
name: chatgpt-plus-subscription
description: ChatGPT Plus 订阅自动化流程（参考 GuJumpgate）。通过 API 创建 Checkout 会话，支持 PayPal（推荐）和信用卡两种支付方式。
---

# ChatGPT Plus 订阅自动化

## 核心方法（参考 GuJumpgate）

不通过 UI 导航，而是直接调用 API 创建 Checkout 会话：

```
1. GET /api/auth/session → accessToken
2. POST /backend-api/payments/checkout → checkout_session_id
3. 打开 https://chatgpt.com/checkout/{entity}/{session_id}
4. 在 Stripe 页面填写账单信息
5. 提交订阅
```

## 两种支付路径

### PayPal（推荐）

```bash
# Node.js
npm run subscribe          # 默认 PayPal + promo
npm run subscribe:cdp      # CDP 模式

# Python
python scripts/chatgpt_plus_subscribe.py
python scripts/chatgpt_plus_subscribe.py --cdp-url http://localhost:9222
```

Payload:
```json
{
  "entry_point": "all_plans_pricing_modal",
  "plan_name": "chatgptplusplan",
  "promo_campaign": { "promo_campaign_id": "plus-1-month-free" },
  "checkout_ui_mode": "hosted",
  "billing_details": { "country": "US", "currency": "USD" }
}
```

Checkout URL: `https://chatgpt.com/checkout/openai_ie/{session_id}`

### 信用卡

```bash
npm run subscribe:card
npm run subscribe:card:cdp
python scripts/chatgpt_plus_subscribe.py --payment card
```

Checkout URL: `https://chatgpt.com/checkout/openai_llc/{session_id}`

## 关键选择器（GuJumpgate）

```
提交: button[data-testid="submit-button"]
PayPal: [data-testid="paypal-accordion-item-button"]
地址: #billingAddressLine1, #billingLocality, #billingPostalCode
州: #billingAdministrativeArea (select)
国家: #billingCountry
姓名: #billingName
条款: #termsOfServiceConsentCheckbox
验证码: #ci-ciBasic-0 ~ #ci-ciBasic-5
```

## 配置

```json
{
  "payment": {
    "email": "your-email@gmail.com",
    "cardNumber": "4242424242424242",
    "expiry": "12/28",
    "cvc": "123",
    "cardholderName": "YOUR NAME",
    "billingAddress": {
      "address1": "Broadway",
      "city": "New York",
      "region": "New York",
      "postalCode": "10007"
    }
  }
}
```

## 参考

- [FoundZiGu/GuJumpgate](https://github.com/FoundZiGu/GuJumpgate) — Chrome 扩展，PayPal 全流程，100% 成功率
- [zxyyang/plus_gopay_gptp-plus](https://github.com/zxyyang/plus_gopay_gptp-plus) — PayPal 通道
- [DanOps-1/Gpt-Agreement-Payment](https://github.com/DanOps-1/Gpt-Agreement-Payment) — 协议重放
