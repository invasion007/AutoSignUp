---
name: chatgpt-plus-subscription
description: ChatGPT Plus 订阅自动化。通过 API 创建 Checkout 会话，支持 PayPal（推荐）和信用卡两种支付方式。
---

# ChatGPT Plus 订阅自动化

## 核心方法

直接调用 API 创建 Checkout 会话，不依赖 UI 导航：

```
1. 确认已登录 ChatGPT（或自动登录）
2. GET /api/auth/session → accessToken
3. POST /backend-api/payments/checkout → checkout_session_id
4. 打开 https://chatgpt.com/checkout/{entity}/{session_id}
5. 在 Stripe 页面填写账单信息
6. 提交订阅
```

## 两种支付路径

### PayPal（推荐 — 含首月免费 promo）

```bash
npm run subscribe          # PayPal 模式
npm run subscribe:cdp      # CDP 连接已打开的浏览器
```

API Payload:
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
```

Checkout URL: `https://chatgpt.com/checkout/openai_llc/{session_id}`

## 关键选择器

```
提交: button[data-testid="submit-button"]
PayPal: [data-testid="paypal-accordion-item-button"]
地址: #billingAddressLine1, #billingLocality, #billingPostalCode
州: #billingAdministrativeArea (select)
国家: #billingCountry
姓名: #billingName
条款: #termsOfServiceConsentCheckbox
```

## 配置 (config.json)

```json
{
  "chatgptLogin": {
    "email": "your-email@gmail.com",
    "password": "YourChatGPTPassword"
  },
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

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CDP` | `false` | CDP 连接模式 |
| `CDP_URL` | `http://localhost:29229` | CDP 端点 |
| `PAYMENT` | `paypal` | 支付方式 (paypal/card) |
| `HEADLESS` | `false` | 无界面模式 |
| `AUTO_SUBMIT` | `false` | 自动提交（跳过 30 秒确认） |

## 参考项目

- [FoundZiGu/GuJumpgate](https://github.com/FoundZiGu/GuJumpgate) — PayPal 全流程
- [zxyyang/plus_gopay_gptp-plus](https://github.com/zxyyang/plus_gopay_gptp-plus) — PayPal 通道
