---
name: chatgpt-plus-subscription
description: ChatGPT Plus 订阅自动化流程。支持通过 CDP 连接已登录浏览器或独立浏览器模式。使用 Playwright 自动完成 Stripe Checkout 支付。
---

# ChatGPT Plus 订阅自动化

## 流程概览

订阅 URL: `https://chatgpt.com/#pricing`
支付 URL: `https://pay.openai.com/c/pay/cs_*`

### 完整流程（7 步）

1. 确认已登录 ChatGPT → 自动检测
2. 导航到升级页面 → 自动
3. 选择 Plus 计划 → 自动
4. 进入 Stripe Checkout → 自动
5. 填写信用卡信息 → 自动
6. 提交支付 → 自动（可配置等待确认）
7. 验证订阅状态 → 自动

## 关键选择器

```
升级页面:
  button:has-text("Get Plus")
  button:has-text("Upgrade to Plus")
  button:has-text("Subscribe to Plus")
  a:has-text("Upgrade")

侧边栏/设置:
  button[aria-label="User menu"]
  a:has-text("My plan")

Stripe Checkout 支付表单:
  #email                           → 邮箱
  #cardNumber                      → 卡号
  #cardExpiry                      → 有效期 (MM/YY)
  #cardCvc                         → 安全码
  #billingName                     → 持卡人姓名
  #billingCountry                  → 国家
  #billingPostalCode               → 邮编

Stripe 提交按钮:
  button:has-text("Subscribe")
  button:has-text("Pay")
  button[type="submit"]
```

## URL 模式

- `chatgpt.com` → 主页（检查登录状态）
- `chatgpt.com/#pricing` → 定价页面
- `chatgpt.com/settings` → 设置（备选入口）
- `pay.openai.com/c/pay/cs_*` → Stripe Checkout
- `checkout.stripe.com/c/pay/cs_*` → Stripe Checkout（备选域名）

## 运行方式

### Node.js

```bash
# 标准模式（启动新浏览器）
npm run subscribe

# CDP 模式（连接已打开的 Chrome）
CDP=true npm run subscribe

# 无界面模式
HEADLESS=true npm run subscribe

# 自动提交（跳过 30 秒确认）
AUTO_SUBMIT=true npm run subscribe
```

### Python (CDP)

```bash
# 默认 CDP 连接
python scripts/chatgpt_plus_subscribe.py

# 指定 CDP 地址
python scripts/chatgpt_plus_subscribe.py --cdp-url http://localhost:9222

# 自动提交
python scripts/chatgpt_plus_subscribe.py --auto-submit
```

## 配置

在 config.json 中添加 payment 字段：

```json
{
  "payment": {
    "email": "your-email@gmail.com",
    "cardNumber": "4242424242424242",
    "expiry": "12/28",
    "cvc": "123",
    "cardholderName": "YOUR NAME",
    "country": "United States",
    "postalCode": "10001"
  }
}
```

## 注意

- 推荐使用 CDP 模式连接已登录的浏览器
- config.json 包含敏感支付信息，不要提交到版本控制
- Stripe 可能检测自动化行为，建议使用真实浏览器
- ChatGPT Plus 月费 $20（2026年5月）
- 如果账号已是 Plus 会员，升级按钮不会显示

## 参考

- [zxyyang/plus_gopay_gptp-plus](https://github.com/zxyyang/plus_gopay_gptp-plus) — PayPal 通道
- [DanOps-1/Gpt-Agreement-Payment](https://github.com/DanOps-1/Gpt-Agreement-Payment) — 协议重放
