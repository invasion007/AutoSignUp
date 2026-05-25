# ChatGPT Plus 订阅流程文档

> 本文档记录 ChatGPT Plus 订阅的完整自动化流程，供未来复用。

---

## 流程总览

```
登录 ChatGPT → 获取 accessToken → API 创建 Checkout → 打开支付页 → 填写账单 → 提交订阅
```

---

## 前置条件

1. **已注册的 ChatGPT 账号**（免费账号即可）
2. **支付方式**：PayPal 账号 或 信用卡/借记卡
3. **美国账单地址**（Stripe 支付要求）

---

## 步骤 1: 登录 ChatGPT

- **URL**: `https://chatgpt.com`
- **登录页**: Auth0 认证（邮箱 + 密码）

### 自动登录

脚本支持自动登录，需要在 `config.json` 中配置：

```json
{
  "chatgptLogin": {
    "email": "your-email@gmail.com",
    "password": "YourPassword"
  }
}
```

### CDP 模式（推荐）

使用 CDP 连接已打开的 Chrome 浏览器（手动登录后运行脚本）：

```bash
# 先在浏览器中登录 chatgpt.com
npm run subscribe:cdp
```

---

## 步骤 2: 获取 accessToken

通过内部 API 获取当前登录会话的 token：

```
GET https://chatgpt.com/api/auth/session
Response: { "accessToken": "eyJ...", "user": { ... } }
```

---

## 步骤 3: 创建 Checkout 会话

通过后端 API 创建 Stripe Checkout 会话：

```
POST https://chatgpt.com/backend-api/payments/checkout
Authorization: Bearer {accessToken}
Content-Type: application/json
```

### PayPal 模式（推荐）

```json
{
  "entry_point": "all_plans_pricing_modal",
  "plan_name": "chatgptplusplan",
  "promo_campaign": {
    "promo_campaign_id": "plus-1-month-free",
    "is_coupon_from_query_param": false
  },
  "checkout_ui_mode": "hosted",
  "billing_details": {
    "country": "US",
    "currency": "USD"
  }
}
```

**优势**: 包含 `plus-1-month-free` promo，首月 $0，之后 $20/月。

**响应**:
```json
{
  "checkout_session_id": "cs_xxx",
  ...
}
```

**Checkout URL**: `https://chatgpt.com/checkout/openai_ie/{session_id}`

### 信用卡模式

```json
{
  "entry_point": "all_plans_pricing_modal",
  "plan_name": "chatgptplusplan",
  "checkout_ui_mode": "custom",
  "billing_details": {
    "country": "US",
    "currency": "USD"
  }
}
```

**Checkout URL**: `https://chatgpt.com/checkout/openai_llc/{session_id}`

---

## 步骤 4: 填写账单信息

Checkout 页面由 Stripe 提供，包含以下字段：

### PayPal 模式

| 字段 | 选择器 | 说明 |
|------|--------|------|
| PayPal 选项 | `[data-testid="paypal-accordion-item-button"]` | 点击选择 PayPal |
| 国家 | `#billingCountry` | 选择 US |
| 地址 | `#billingAddressLine1` | 街道地址 |
| 城市 | `#billingLocality` | 城市名 |
| 州 | `#billingAdministrativeArea` | 下拉选择州 |
| 邮编 | `#billingPostalCode` | 5 位邮编 |
| 姓名 | `#billingName` | 持卡人姓名 |
| 服务条款 | `#termsOfServiceConsentCheckbox` | 勾选同意 |

### 信用卡模式

| 字段 | 选择器 | 说明 |
|------|--------|------|
| 邮箱 | `#email` | 账单邮箱 |
| 卡号 | `#cardNumber` 或 Stripe iframe | 16 位卡号 |
| 有效期 | `#cardExpiry` | MM/YY 格式 |
| CVC | `#cardCvc` | 3 位安全码 |
| 姓名 | `#billingName` | 持卡人姓名 |
| 国家 | `#billingCountry` | 选择 US |
| 邮编 | `#billingPostalCode` | 5 位邮编 |

---

## 步骤 5: 提交订阅

| 按钮选择器 | 说明 |
|-----------|------|
| `button[data-testid="submit-button"]` | 主提交按钮 |
| `button[data-testid="hosted-payment-submit-button"]` | Hosted 模式提交 |
| `button:has-text("Subscribe")` | 文字匹配 |

---

## 步骤 6: 验证结果

- **PayPal**: 跳转到 paypal.com 登录并确认支付，完成后自动返回 ChatGPT
- **信用卡**: 直接在 Stripe 页面完成支付

订阅成功后，ChatGPT 页面会显示 Plus 标识。

---

## 重要注意事项

1. **IP 地址**: 建议使用美国 IP，非美国 IP 可能导致支付失败
2. **promo 有效性**: `plus-1-month-free` promo 可能随时失效
3. **Stripe 验证码**: 部分情况下 Stripe 会要求验证码，需手动完成
4. **PayPal 账号**: PayPal 模式需要有美国 PayPal 账号或支持美元支付的 PayPal
5. **首月免费**: PayPal 模式使用 promo 首月 $0，之后自动续费 $20/月

---

## 参考项目

| 项目 | 说明 | 链接 |
|------|------|------|
| GuJumpgate | Chrome 扩展，PayPal 全流程自动化 | https://github.com/FoundZiGu/GuJumpgate |
| plus_gopay_gptp-plus | PayPal 通道批量工具 | https://github.com/zxyyang/plus_gopay_gptp-plus |
