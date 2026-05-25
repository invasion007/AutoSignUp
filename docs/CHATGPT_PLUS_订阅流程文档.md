# ChatGPT Plus 订阅流程文档

> 更新日期: 2026-05-25

---

## 一、订阅流程概览

| 步骤 | 页面 / URL | 内容 | 自动化 |
|------|-----------|------|--------|
| 1 | `chatgpt.com` | 确认已登录 | 可自动 / CDP |
| 2 | `chatgpt.com/#pricing` | 导航到定价页面 | 可自动 |
| 3 | 点击 "Get Plus" | 选择 Plus 计划 | 可自动 |
| 4 | `pay.openai.com/c/pay/cs_*` | Stripe Checkout 支付页面 | 可自动 |
| 5 | Stripe Checkout | 填写信用卡信息 | 可自动 |
| 6 | 提交支付 | 确认并提交 | 可自动（默认等待确认） |
| 7 | 返回 ChatGPT | 验证 Plus 状态 | 可自动 |

---

## 二、详细步骤

### 步骤 1: 登录 ChatGPT

**前提条件：** 需要一个 ChatGPT 账号（可以是 Google 账号、Apple 账号、或邮箱密码注册的账号）。

| 方式 | 说明 |
|------|------|
| CDP 模式（推荐） | 先在浏览器中手动登录，脚本通过 CDP 连接已登录的浏览器 |
| 自动登录 | 在 config.json 中配置邮箱密码，脚本自动完成登录 |

**登录页面 URL**: `https://auth.openai.com/authorize`

### 步骤 2: 导航到升级页面

有三种方式到达升级页面：

1. **直接 URL**: `https://chatgpt.com/#pricing`
2. **侧边栏**: 点击头像/设置 → "Upgrade plan"
3. **设置页面**: `https://chatgpt.com/settings` → "Subscription"

### 步骤 3: 选择 Plus 计划

在定价页面中，有 Free / Go / Plus / Pro 等选项。  
点击 Plus 下方的 **"Get Plus"** 或 **"Upgrade to Plus"** 按钮。

**已知按钮选择器:**
```
button:has-text("Get Plus")
button:has-text("Upgrade to Plus")
button:has-text("Subscribe to Plus")
```

### 步骤 4: Stripe Checkout 页面

点击后浏览器跳转到 Stripe 托管的结账页面：
- URL 模式: `https://pay.openai.com/c/pay/cs_live_*`
- 或: `https://checkout.stripe.com/c/pay/cs_*`

### 步骤 5: 填写支付信息

Stripe Checkout 页面需要填写以下信息：

| 字段 | 选择器 | 说明 |
|------|--------|------|
| 邮箱 | `#email` | 可能已预填 |
| 卡号 | `#cardNumber` | 16 位信用卡号 |
| 有效期 | `#cardExpiry` | MM/YY 格式 |
| CVC | `#cardCvc` | 3-4 位安全码 |
| 持卡人姓名 | `#billingName` | 卡面姓名 |
| 国家 | `#billingCountry` | 下拉选择 |
| 邮编 | `#billingPostalCode` | 根据国家可能需要 |

**注意**: Stripe 的卡号输入有时在 iframe 内（Stripe Elements），有时直接在页面上（Stripe Checkout hosted page）。脚本会自动尝试两种方式。

### 步骤 6: 提交支付

点击页面底部的 **"Subscribe"** 按钮。

**已知按钮选择器:**
```
button:has-text("Subscribe")
button:has-text("Pay")
button:has-text("Start subscription")
button[type="submit"]
```

### 步骤 7: 验证订阅

支付成功后：
- 浏览器自动跳转回 `chatgpt.com`
- ChatGPT 界面应显示 Plus 标识
- 可在设置中确认订阅状态

---

## 三、支持的支付方式

| 支付方式 | 支持情况 | 说明 |
|----------|---------|------|
| 信用卡/借记卡 | ✅ 完全支持 | Visa, Mastercard, Amex 等 |
| PayPal | 部分支持 | 需要参考 plus_gopay 项目 |
| Google Pay | 未实现 | 需要额外处理 |
| Apple Pay | 未实现 | 需要 Safari + Apple 设备 |

---

## 四、注意事项

1. **支付安全**: config.json 中包含敏感的支付信息，已在 .gitignore 中排除，切勿提交到版本控制
2. **Stripe 反自动化**: Stripe 可能检测自动化行为。如遇问题，建议使用 CDP 模式手动辅助
3. **价格**: ChatGPT Plus 目前 $20/月（2026年5月）
4. **已有订阅**: 如果账号已是 Plus 会员，升级按钮将不会显示
5. **地区限制**: 某些地区可能无法订阅 Plus，或需要特定国家的支付方式

---

## 五、参考项目

| 项目 | 说明 | 链接 |
|------|------|------|
| zxyyang/plus_gopay_gptp-plus | ChatGPT Plus PayPal 通道自动化（批量工具） | [GitHub](https://github.com/zxyyang/plus_gopay_gptp-plus) |
| DanOps-1/Gpt-Agreement-Payment | 协议端到端重放工具集（研究向） | [GitHub](https://github.com/DanOps-1/Gpt-Agreement-Payment) |

---

## 六、故障排除

| 问题 | 解决方案 |
|------|---------|
| 找不到升级按钮 | 检查账号是否已经是 Plus；尝试直接访问 `chatgpt.com/#pricing` |
| 无法跳转到 Stripe | 可能需要禁用广告拦截器或浏览器扩展 |
| Stripe 页面卡号无法填写 | 尝试 CDP 模式，手动辅助填写 |
| 支付被拒绝 | 确认信用卡有效、余额充足、国际支付已开通 |
| 浏览器被检测为自动化 | 使用 CDP 连接真实浏览器，避免 headless 模式 |
