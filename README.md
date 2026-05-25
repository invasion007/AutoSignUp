# AutoSignUp - Google/ChatGPT 账号自动注册工具

## 项目说明

本项目记录并自动化 Google 和 ChatGPT 账号注册流程，专为无法使用鼠标/键盘的用户设计。  
提供 **Python (Playwright CDP)** 和 **Node.js (Playwright)** 两种实现。

---

## ChatGPT 注册（新增）

### 注册流程

参考 [GuJumpgate](https://github.com/FoundZiGu/GuJumpgate) 项目实现。

| 步骤 | 页面 | 内容 | 自动化 |
|------|------|------|--------|
| 1 | chatgpt.com | 打开官网，点击注册 | 可自动 |
| 2 | auth.openai.com | 输入邮箱 | 可自动 |
| 3 | auth.openai.com | 填写密码 | 可自动 |
| 4 | auth.openai.com | 邮箱验证码 | 需手动输入验证码 |
| 5 | auth.openai.com | 填写姓名和生日 | 可自动 |
| 6 | chatgpt.com | 注册完成 | 自动等待 |

### 使用方法

```bash
# 安装依赖
npm install
npx playwright install chromium

# 配置 ChatGPT 注册信息
cp config.chatgpt.example.json config.chatgpt.json
# 编辑 config.chatgpt.json 填写你的邮箱、密码、姓名等

# 运行 ChatGPT 注册（标准模式）
npm run signup:chatgpt

# 无界面模式
npm run signup:chatgpt:headless

# CDP 模式（连接已打开的 Chrome）
npm run signup:chatgpt:cdp
```

### 代理支持（解决数据中心 IP 被拦截问题）

**问题**：使用数据中心 IP 注册时，ChatGPT/OpenAI 会检测到非住宅 IP 并可能拦截注册。

**解决方案**：使用住宅代理 (Residential Proxy)。

```bash
# 通过环境变量设置代理
PROXY_SERVER=http://proxy-host:port \
PROXY_USERNAME=your-username \
PROXY_PASSWORD=your-password \
npm run signup:chatgpt

# 或在 config.chatgpt.json 中配置
# "proxy": { "server": "http://host:port", "username": "user", "password": "pass" }
```

### 推荐的住宅代理服务

| 服务 | 网址 | 最低价格 | 说明 |
|------|------|----------|------|
| 711Proxy | https://www.711proxy.com | $0.03/IP 或 $3/GB | GuJumpgate 推荐，100M+ 住宅 IP |
| Bright Data | https://brightdata.com | 按用量 | 大型代理服务商 |
| Smartproxy | https://smartproxy.com | 按用量 | 住宅 IP 池 |

> **711Proxy 使用方法**（参考 GuJumpgate）：
> 1. 注册 711Proxy 账号: https://www.711proxy.com
> 2. 购买住宅代理套餐（Residential Proxies-GB 或 Residential Proxies-IP）
> 3. 获取代理信息（Host、Port、Username、Password）
> 4. 配置代理，例:
>    ```
>    Host: global.rotgb.711proxy.com
>    Port: 10000
>    ```
> 5. 在 Username 中可以指定地区: `user-region-US-session-xxxx-sessTime-30`

### IP 纯净度检查

注册前建议检查代理 IP 质量：
- [IPPure](https://ippure.com/) — 检查 IP 纯净度、代理识别
- [IPData](https://ipdata.co/) — 查看 IP 风险标签
- [IP111](https://ip111.cn/) — 确认出口 IP

---

## Google 注册

### 当前状态

| 步骤 | 桌面模式 | 移动模式（推荐） |
|------|----------|-----------------|
| 1. 输入姓名 | 已自动化 | 已自动化 |
| 2. 生日/性别 | 已自动化 | 已自动化 |
| 3. 邮箱选择 | 已自动化 | 已自动化 |
| 4. 设置密码 | 已自动化 | 已自动化 |
| 5. 验证 | QR 码（需物理手机） | **SMS 短信验证** |

### 重要发现

#### 移动设备模拟可绕过 QR 码验证（2026年5月验证）

**关键发现**：使用 Playwright 的移动设备模拟（如 Pixel 7）注册时，Google 会切换到 **SMS 短信验证**，而不是 QR 码扫描验证！

| 注册方式 | 验证类型 | 验证页面 URL |
|----------|----------|-------------|
| 桌面浏览器 | QR 码扫描 | `/signup/mophoneverification` 或 `/crossflowverification` |
| 移动设备模拟 | SMS 短信 | `/devicephoneverification/consent` |

SMS 短信验证可以通过虚拟号码服务（如 sms-activate.org、5sim.net）接收，不需要物理手机。

#### 触发 QR 码验证的因素

- 可疑 IP 地址（数据中心IP、VPN、被标记的公共IP）
- 同一设备/网络多次注册
- 地理位置/时区/浏览器语言不匹配
- 无浏览历史和 cookies 的干净环境
- 虚拟机或模拟器特征被检测到

#### 降低验证要求的方法

1. **使用移动设备模拟**（本项目默认方式）— 获得 SMS 验证而非 QR 码
2. **通过 YouTube 注册** — YouTube 的验证检查通常比 Gmail 宽松
3. **使用隐身模式** — 清洁的浏览器环境
4. **匹配 IP 地区的浏览器语言** — 如用美国 IP 则设置 English (US)
5. **提供恢复邮箱** — 有时可以增加出现 "Skip" 按钮的概率

### Google 注册使用方法

```bash
# 配置信息
cp config.example.json config.json
# 编辑 config.json

# 运行（移动模式，推荐 — 使用 SMS 验证）
npm run signup

# 运行（桌面模式 — 使用 QR 码验证）
MOBILE=false npm run signup

# 运行（无界面模式）
npm run signup:headless
```

### Python 脚本 (通过 CDP 连接已打开的 Chrome)

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

## 注册流程概览

### Google 注册流程

| 步骤 | 页面 | 内容 | 自动化 |
|------|------|------|--------|
| 1 | `/signup/name` | 输入姓名 | 可自动 |
| 2 | `/signup/birthdaygender` | 选择生日和性别 | 可自动 |
| 3 | `/signup/username` | 选择用户名 | 可自动 |
| 4 | `/signup/password` | 设置密码 | 可自动 |
| 5 | `/devicephoneverification` | SMS 短信验证（移动模式） | 需虚拟号码 |
| 5 | `/mophoneverification` | QR 码验证（桌面模式） | 需手动 |
| 6 | （验证后）| 添加恢复邮箱（可选） | 可自动 |
| 7 | （验证后）| 同意服务条款 | 可自动 |

---

## 文件结构

```
AutoSignUp/
├── README.md                          # 本文件
├── HANDOVER.md                        # 交接文档
├── package.json                       # Node.js 依赖
├── config.example.json                # Google 注册配置示例
├── config.chatgpt.example.json        # ChatGPT 注册配置示例
├── docs/
│   ├── GOOGLE_注册流程文档.md          # Google 完整注册流程文档
│   ├── FINDINGS.md                    # 探索发现和结论
│   ├── registration-flow.md           # 详细流程文档（含选择器和URL信息）
│   └── CHATGPT_注册流程文档.md         # ChatGPT 注册流程文档
├── scripts/
│   ├── google_register.py             # Python Google 注册自动化脚本 (CDP)
│   ├── outlook_register.py            # Outlook 注册自动化脚本 (辅助)
│   ├── google-signup.mjs              # Node.js Google 注册脚本
│   └── chatgpt-signup.mjs             # Node.js ChatGPT 注册脚本（新增）
├── skills/
│   └── SKILL_google_register.md       # Google 注册技能文档
└── accounts/
    └── ACCOUNTS.md                    # 已创建的测试账号信息
```

---

## 虚拟号码服务

如需使用 SMS 验证，以下服务可接收验证码（仅供参考）：
- [sms-activate.org](https://sms-activate.org)
- [5sim.net](https://5sim.net)
- [onlinesim.io](https://onlinesim.io)

## 注意事项

- Google/ChatGPT 可能会根据 IP 地址、浏览器指纹等因素改变验证要求
- 请勿将 `config.json` 或 `config.chatgpt.json` 提交到版本控制（已在 `.gitignore` 中排除）
- 本工具仅供个人辅助使用，请遵守相关服务条款
- 移动模式使用 Playwright 的 `devices["Pixel 7"]` 配置进行设备模拟
- **使用住宅代理** 可显著降低被 IP 检测拦截的概率

## License

MIT
