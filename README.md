# AutoSignUp - 自动注册与订阅工具

## 项目说明

本项目记录并自动化账号注册和订阅流程，专为无法使用鼠标/键盘的用户设计。  
提供 **Python (Playwright CDP)** 和 **Node.js (Playwright)** 两种实现。

### 功能模块

| 模块 | 说明 | 状态 |
|------|------|------|
| Google 账号注册 | 自动化 Google 注册流程（移动模式 SMS 验证） | 已完成 |
| Outlook 邮箱注册 | 自动化 Outlook 注册流程（无需手机） | 已完成 |
| **ChatGPT Plus 订阅** | **自动化 ChatGPT Plus 升级/订阅（Stripe 支付）** | **新增** |

---

## ChatGPT Plus 订阅

> 参考 [FoundZiGu/GuJumpgate](https://github.com/FoundZiGu/GuJumpgate) 项目（2466 Star，100% 成功率）

### 核心方法

不通过 UI 导航，**直接调用 ChatGPT 后端 API** 创建 Stripe Checkout 会话：

```
1. GET /api/auth/session → accessToken
2. POST /backend-api/payments/checkout → checkout_session_id
3. 打开 https://chatgpt.com/checkout/{entity}/{session_id}
4. 在 Stripe 页面填写账单/支付信息
5. 提交订阅
```

### 两种支付路径

| 路径 | 支付方式 | Promo | 首月价格 | 需要 |
|------|----------|-------|---------|------|
| **PayPal（推荐）** | PayPal | plus-1-month-free | **$0** | PayPal 账号 + US 代理 |
| 信用卡 | Credit/Debit | 无 | $20 | 信用卡信息 |

### 使用方法

```bash
# 安装依赖
npm install
npx playwright install chromium

# 配置
cp config.example.json config.json

# PayPal 模式（推荐，含免费试用）
npm run subscribe                  # 标准模式
npm run subscribe:cdp              # CDP 连接已登录浏览器（推荐）

# 信用卡模式
npm run subscribe:card
npm run subscribe:card:cdp         # CDP + 信用卡

# 自动提交（跳过 30 秒确认等待）
npm run subscribe:auto

# Python CDP 版本
python scripts/chatgpt_plus_subscribe.py                  # PayPal
python scripts/chatgpt_plus_subscribe.py --payment card   # 信用卡
python scripts/chatgpt_plus_subscribe.py --auto-submit
```

### 配置说明

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

### 住宅 IP 代理（前提条件）

ChatGPT 需要**代理 + 干净浏览器指纹**才能访问（Cloudflare 同时检测 IP 和浏览器指纹）。

```bash
# 快速扫描 US SOCKS5 代理
npm run find-proxy                    # 默认 30 个
npm run find-proxy:all                # 全部

# 全球扫描（30 并发，含 HTTPS + ChatGPT 测试）
python scripts/fast_proxy_scan.py
```

**当前可用代理（2026-05-25 验证）：**
```
socks5://206.123.156.233:4227   # SAKURA Internet (Osaka, JP) — 最稳定
socks5://206.123.156.225:6868   # Newfold Digital (Jacksonville, FL)
```

**关键发现：** curl 返回 403 ≠ 不可用！403 是 Cloudflare JS 挑战，用 Playwright 新实例 + stealth 脚本可通过。  
详细的代理使用方法和 stealth 代码见 `HANDOVER.md` 第 9.4~9.5 节。

> **注意**: 免费代理不稳定，可能随时失效。稳定使用建议付费住宅代理。

### 参考项目

| 项目 | 说明 |
|------|------|
| **[FoundZiGu/GuJumpgate](https://github.com/FoundZiGu/GuJumpgate)** | **Chrome 扩展，PayPal 全流程自动化，100% 成功率** |
| [zxyyang/plus_gopay_gptp-plus](https://github.com/zxyyang/plus_gopay_gptp-plus) | PayPal 通道批量工具 |
| [DanOps-1/Gpt-Agreement-Payment](https://github.com/DanOps-1/Gpt-Agreement-Payment) | 协议端到端重放工具集 |

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

**移动设备模拟可绕过 QR 码验证（2026年5月验证）**

使用 Playwright 的移动设备模拟（Pixel 7）注册时，Google 会切换到 **SMS 短信验证**。SMS 验证码可以通过虚拟号码服务接收。

| 注册方式 | 验证类型 | 验证页面 URL |
|----------|----------|-------------|
| 桌面浏览器 | QR 码扫描 | `/signup/mophoneverification` 或 `/crossflowverification` |
| 移动设备模拟 | SMS 短信 | `/devicephoneverification/consent` |

### 使用方法

```bash
# 安装依赖
npm install
npx playwright install chromium

# 配置信息
cp config.example.json config.json
# 编辑 config.json 填写注册信息

# 运行（移动模式，推荐 — SMS 验证）
npm run signup

# 运行（桌面模式 — QR 码验证）
MOBILE=false npm run signup

# 运行（无界面模式）
npm run signup:headless
```

### Python 脚本 (CDP)

```bash
pip install playwright
python scripts/google_register.py \
  --first-name "David" \
  --last-name "Carter" \
  --email "your.existing.email@outlook.com" \
  --password "YourStrongPassword" \
  --use-existing-email
```

---

## 文件结构

```
AutoSignUp/
├── README.md                              # 本文件
├── HANDOVER.md                            # 交接文档
├── package.json                           # Node.js 依赖和脚本
├── config.example.json                    # 配置模板（含支付信息）
├── docs/
│   ├── GOOGLE_注册流程文档.md              # Google 注册流程文档
│   ├── CHATGPT_PLUS_订阅流程文档.md        # ChatGPT Plus 订阅流程文档
│   ├── FINDINGS.md                        # 探索发现和结论
│   └── registration-flow.md               # 详细流程文档
├── scripts/
│   ├── google-signup.mjs                  # Google 注册脚本 (Node.js)
│   ├── google_register.py                 # Google 注册脚本 (Python CDP)
│   ├── outlook_register.py                # Outlook 注册脚本 (Python)
│   ├── chatgpt-plus-subscribe.mjs         # ChatGPT Plus 订阅脚本 (Node.js)
│   ├── chatgpt_plus_subscribe.py          # ChatGPT Plus 订阅脚本 (Python CDP)
│   ├── find-residential-proxy.mjs         # 住宅 IP 代理发现工具（US SOCKS5）
│   └── fast_proxy_scan.py                # 全球代理扫描（30 并发，含 ChatGPT 测试）
├── skills/
│   ├── SKILL_google_register.md           # Google 注册技能文档
│   └── SKILL_chatgpt_plus_subscribe.md    # ChatGPT Plus 订阅技能文档
└── accounts/
    └── ACCOUNTS.md                        # 已创建的账号信息
```

---

## 注意事项

- 请勿将 `config.json` 提交到版本控制（已在 `.gitignore` 中排除）
- 本工具仅供个人辅助使用，请遵守相关服务条款
- 支付信息为敏感数据，请妥善保管
- 移动模式使用 Playwright 的 `devices["Pixel 7"]` 配置进行设备模拟
- 推荐使用 CDP 模式连接已登录的真实浏览器

## 建议的虚拟号码服务

如需使用 SMS 验证，以下服务可接收验证码（仅供参考）：
- [sms-activate.org](https://sms-activate.org)
- [5sim.net](https://5sim.net)
- [onlinesim.io](https://onlinesim.io)

## License

MIT
