# AutoSignUp - 自动注册 & 订阅工具

## 项目说明

本项目自动化 Google 账号注册和 **ChatGPT Plus 订阅**流程，专为无法使用鼠标/键盘的用户设计。  
使用 **Node.js (Playwright)** 实现，支持 CDP 连接已打开的浏览器。

## 功能概览

| 功能 | 脚本 | 状态 |
|------|------|------|
| Google 账号注册 | `google-signup.mjs` | 已完成（前4步自动化 + SMS验证） |
| ChatGPT 自动登录 | `chatgpt-login.mjs` | 已完成 |
| **ChatGPT Plus 订阅** | `chatgpt-plus-subscribe.mjs` | **新增** |

---

## ChatGPT Plus 订阅（新增）

### 核心方法

通过 ChatGPT 后端 API 创建 Stripe Checkout 会话，自动填写账单信息：

```
登录 → accessToken → POST /backend-api/payments/checkout → 打开 Checkout → 填写账单 → 提交
```

### 两种支付方式

| 方式 | 说明 | 命令 |
|------|------|------|
| **PayPal（推荐）** | 含 `plus-1-month-free` promo，首月 $0 | `npm run subscribe` |
| 信用卡 | 直接 Stripe 支付 | `npm run subscribe:card` |

### 快速开始

```bash
# 1. 安装依赖
npm install
npx playwright install chromium

# 2. 配置
cp config.example.json config.json
# 编辑 config.json，填写 chatgptLogin 和 payment 信息

# 3a. CDP 模式（推荐：先在浏览器登录 chatgpt.com）
npm run subscribe:cdp

# 3b. 独立浏览器模式（自动登录）
npm run subscribe

# 3c. 信用卡支付
npm run subscribe:card

# 3d. 自动提交（跳过 30 秒确认）
AUTO_SUBMIT=true npm run subscribe:cdp
```

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CDP` | `false` | CDP 连接模式（推荐 `true`） |
| `CDP_URL` | `http://localhost:29229` | CDP 端点 |
| `PAYMENT` | `paypal` | 支付方式 (`paypal` / `card`) |
| `HEADLESS` | `false` | 无界面模式 |
| `AUTO_SUBMIT` | `false` | 自动提交 |

---

## Google 账号注册

### 当前状态

| 步骤 | 桌面模式 | 移动模式（推荐） |
|------|----------|-----------------|
| 1. 输入姓名 | 已自动化 | 已自动化 |
| 2. 生日/性别 | 已自动化 | 已自动化 |
| 3. 邮箱选择 | 已自动化 | 已自动化 |
| 4. 设置密码 | 已自动化 | 已自动化 |
| 5. 验证 | QR 码（需物理手机） | **SMS 短信验证** |

### 重要发现

**移动设备模拟可绕过 QR 码验证**：使用 Playwright 的 `devices["Pixel 7"]` 注册时，Google 切换到 SMS 短信验证，可通过虚拟号码服务接收。

### 使用方法

```bash
# 移动模式（推荐 — SMS 验证）
npm run signup

# 桌面模式（QR 码验证）
MOBILE=false npm run signup
```

---

## ChatGPT 自动登录

```bash
# CDP 模式
npm run login:cdp

# 独立浏览器
npm run login
```

---

## 文件结构

```
AutoSignUp/
├── README.md                              # 本文件
├── HANDOVER.md                            # 交接文档
├── package.json                           # Node.js 依赖
├── config.example.json                    # 配置模板
├── scripts/
│   ├── google-signup.mjs                  # Google 注册脚本
│   ├── chatgpt-login.mjs                  # ChatGPT 登录脚本（新增）
│   ├── chatgpt-plus-subscribe.mjs         # ChatGPT Plus 订阅脚本（新增）
│   ├── google_register.py                 # Python 注册脚本 (CDP)
│   └── outlook_register.py                # Outlook 注册脚本
├── docs/
│   ├── CHATGPT_PLUS_订阅流程文档.md        # Plus 订阅流程文档（新增）
│   ├── GOOGLE_注册流程文档.md              # Google 注册流程文档
│   ├── FINDINGS.md                        # 探索发现
│   └── registration-flow.md               # 详细流程文档
├── skills/
│   ├── SKILL_google_register.md           # Google 注册技能
│   └── SKILL_chatgpt_plus_subscribe.md    # Plus 订阅技能（新增）
└── accounts/
    └── ACCOUNTS.md                        # 已创建的账号
```

---

## 配置说明

`config.json` 包含三部分：

```json
{
  "firstName": "...",
  "lastName": "...",
  "birthday": { "month": "January", "day": "15", "year": "1990" },
  "gender": "Rather not say",
  "username": "...",
  "password": "...",

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

---

## 注意事项

- 请勿将 `config.json` 提交到版本控制（已在 `.gitignore` 中排除）
- 本工具仅供个人无障碍辅助使用
- PayPal promo (`plus-1-month-free`) 可能随时失效
- 建议使用美国 IP 进行订阅操作
- Stripe 页面可能会出现验证码，需手动处理

## 参考项目

- [FoundZiGu/GuJumpgate](https://github.com/FoundZiGu/GuJumpgate) — ChatGPT Plus PayPal 全流程自动化
- [zxyyang/plus_gopay_gptp-plus](https://github.com/zxyyang/plus_gopay_gptp-plus) — PayPal 通道批量工具

## License

MIT
