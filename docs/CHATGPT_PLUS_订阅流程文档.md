# ChatGPT Plus 订阅流程文档

> 最后更新: 2026-05-25
> 参考项目: [FoundZiGu/GuJumpgate](https://github.com/FoundZiGu/GuJumpgate)

---

## 一、核心方法：API 直接创建 Checkout 会话

> 参考 GuJumpgate `content/plus-checkout.js` 的 `createPlusCheckoutSession` 函数

### 1.1 获取 accessToken

```javascript
// 在 chatgpt.com 页面内执行
const resp = await fetch('/api/auth/session', { credentials: 'include' });
const session = await resp.json();
const accessToken = session.accessToken;
```

### 1.2 创建 Checkout 会话

```javascript
const payload = {
  entry_point: 'all_plans_pricing_modal',
  plan_name: 'chatgptplusplan',
  promo_campaign: {
    promo_campaign_id: 'plus-1-month-free',  // 免费试用 promo
    is_coupon_from_query_param: false,
  },
  checkout_ui_mode: 'hosted',  // hosted = PayPal, custom = 信用卡
  billing_details: {
    country: 'US',
    currency: 'USD',
  },
};

const resp = await fetch('https://chatgpt.com/backend-api/payments/checkout', {
  method: 'POST',
  credentials: 'include',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

const data = await resp.json();
// data.checkout_session_id → 用于构建 Checkout URL
```

### 1.3 构建 Checkout URL

```
PayPal:  https://chatgpt.com/checkout/openai_ie/{checkout_session_id}
信用卡:  https://chatgpt.com/checkout/openai_llc/{checkout_session_id}
```

API 返回中可能包含 hosted checkout URL（`pay.openai.com` 或 `checkout.stripe.com`）。

---

## 二、两种支付路径

### 路径 A：PayPal（推荐）

| 步骤 | URL | 操作 |
|------|-----|------|
| 1 | `chatgpt.com` | 获取 accessToken |
| 2 | API 调用 | 创建 Checkout 会话（hosted 模式） |
| 3 | `chatgpt.com/checkout/openai_ie/{id}` | 打开 Checkout 页面 |
| 4 | Stripe 页面 | 选择 PayPal，填写 US 账单地址 |
| 5 | Stripe 页面 | 点击 Subscribe → 跳转 PayPal |
| 6 | `paypal.com` | PayPal 登录并确认支付 |
| 7 | `chatgpt.com` | 返回 ChatGPT，验证 Plus 状态 |

**优势**：
- `plus-1-month-free` promo → 首月 $0
- 不需要信用卡信息
- 成功率高（GuJumpgate 报告 100% 成功率）

**需要**：
- 已注册的 PayPal 账号（US）
- US 代理/VPN

### 路径 B：信用卡

| 步骤 | URL | 操作 |
|------|-----|------|
| 1 | `chatgpt.com` | 获取 accessToken |
| 2 | API 调用 | 创建 Checkout 会话（custom 模式） |
| 3 | `chatgpt.com/checkout/openai_llc/{id}` | 打开 Checkout 页面 |
| 4 | Stripe 页面 | 填写卡号/有效期/CVC/姓名 |
| 5 | Stripe 页面 | 点击 Subscribe |
| 6 | （可能需要 3DS 验证） | 银行验证 |
| 7 | `chatgpt.com` | 验证 Plus 状态 |

---

## 三、Stripe Checkout 关键选择器

> 参考 GuJumpgate `content/plus-checkout.js`

### 提交按钮

```
button[data-testid="submit-button"]
button[data-testid="hosted-payment-submit-button"]
button[data-atomic-wait-intent="Submit_Email"]
button.SubmitButton--complete
```

### PayPal 按钮

```
[data-testid="paypal-accordion-item-button"]
.paypal-accordion-item button
```

### 账单地址字段

```
#billingAddressLine1         → 街道地址
#billingLocality             → 城市
#billingPostalCode           → 邮编
#billingAdministrativeArea   → 州（select 下拉框）
#billingCountry              → 国家
#billingName                 → 持卡人姓名
```

### 服务条款

```
#termsOfServiceConsentCheckbox
```

### 验证码（6位）

```
#ci-ciBasic-0 到 #ci-ciBasic-5
```

---

## 四、US 地址种子（参考 GuJumpgate `data/address-sources.js`）

| 城市 | 地址 | 州 | 邮编 |
|------|------|-----|------|
| New York | Broadway | New York | 10007 |
| Los Angeles | Wilshire Blvd | California | 90017 |
| Chicago | Michigan Ave | Illinois | 60601 |

---

## 五、代理要求

参考 GuJumpgate 推荐的路径：

```
US 注册 + JP 拿长链接 + US 付款
```

| 阶段 | 代理要求 |
|------|---------|
| ChatGPT 登录 | US 代理 |
| 创建 Checkout | US 或 JP 代理 |
| Stripe 支付 | US 代理 |
| PayPal 登录 | US 代理 |

---

## 六、参考项目

| 项目 | 方法 | 链接 |
|------|------|------|
| **FoundZiGu/GuJumpgate** | Chrome 扩展，PayPal 全流程，100% 成功率 | [GitHub](https://github.com/FoundZiGu/GuJumpgate) |
| zxyyang/plus_gopay_gptp-plus | PayPal 通道批量工具 | [GitHub](https://github.com/zxyyang/plus_gopay_gptp-plus) |
| DanOps-1/Gpt-Agreement-Payment | Stripe 协议端到端重放 | [GitHub](https://github.com/DanOps-1/Gpt-Agreement-Payment) |

---

## 七、故障排除

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 创建 Checkout 失败 | accessToken 无效或过期 | 重新登录 ChatGPT |
| PayPal 按钮不显示 | 国家设置非 US | 确保 billing_details.country = "US" |
| 提交按钮 disabled | 表单未填完 | 检查必填字段 |
| Captcha 出现 | Stripe 检测到自动化 | 使用 CDP 模式连接真实浏览器 |
| 非零金额 | 账号无免费试用资格 | 使用新账号或去掉 promo_campaign |
| PayPal 跳滑块 | IP 不干净 | 更换 US 代理 |
| 验证码弹窗 | OpenAI 验证 | 需要手动输入或接码 |
