# AutoSignUp - Google 账号自动注册工具

## 项目说明

本项目记录并自动化 Google 账号注册流程，专为无法使用鼠标/键盘的用户设计。  
提供 **Python (Playwright CDP)** 和 **Node.js (Playwright)** 两种实现。

## 当前状态

| 步骤 | 桌面模式 | 移动模式（推荐） |
|------|----------|-----------------|
| 1. 输入姓名 | 已自动化 | 已自动化 |
| 2. 生日/性别 | 已自动化 | 已自动化 |
| 3. 邮箱选择 | 已自动化 | 已自动化 |
| 4. 设置密码 | 已自动化 | 已自动化 |
| 5. 验证 | QR 码（需物理手机） | **SMS 短信验证** |

## 重要发现

### 移动设备模拟可绕过 QR 码验证（2026年5月验证）

**关键发现**：使用 Playwright 的移动设备模拟（如 Pixel 7）注册时，Google 会切换到 **SMS 短信验证**，而不是 QR 码扫描验证！

| 注册方式 | 验证类型 | 验证页面 URL |
|----------|----------|-------------|
| 桌面浏览器 | QR 码扫描 | `/signup/mophoneverification` 或 `/crossflowverification` |
| 移动设备模拟 | SMS 短信 | `/devicephoneverification/consent` |

SMS 短信验证可以通过虚拟号码服务（如 sms-activate.org、5sim.net）接收，不需要物理手机。

### 触发 QR 码验证的因素

根据调研，以下因素会增加被要求 QR 码验证的概率：
- 可疑 IP 地址（数据中心IP、VPN、被标记的公共IP）
- 同一设备/网络多次注册
- 地理位置/时区/浏览器语言不匹配
- 无浏览历史和 cookies 的干净环境
- 虚拟机或模拟器特征被检测到

### 降低验证要求的方法

1. **使用移动设备模拟**（本项目默认方式）— 获得 SMS 验证而非 QR 码
2. **通过 YouTube 注册** — YouTube 的验证检查通常比 Gmail 宽松
3. **使用隐身模式** — 清洁的浏览器环境
4. **匹配 IP 地区的浏览器语言** — 如用美国 IP 则设置 English (US)
5. **提供恢复邮箱** — 有时可以增加出现 "Skip" 按钮的概率

### "Use existing email" 路径测试结果

- **路径**: 注册时选择 "Use your existing email" 而非创建新 Gmail
- **结果**: 邮箱验证码通过后，桌面模式仍需 QR 码验证
- **移动模式**: 可能获得 SMS 验证

---

## 注册流程概览

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
├── README.md                         # 本文件
├── package.json                      # Node.js 依赖
├── config.example.json               # Node.js 脚本配置示例
├── docs/
│   ├── GOOGLE_注册流程文档.md         # 完整注册流程文档
│   ├── FINDINGS.md                   # 探索发现和结论
│   └── registration-flow.md          # 详细流程文档（含选择器和URL信息）
├── scripts/
│   ├── google-signup.mjs             # Node.js Playwright 注册脚本（主脚本）
│   ├── cdp_mobile_register.py        # Python CDP 移动模式注册脚本（已验证可获得SMS验证）
│   ├── google_register.py            # Python CDP 桌面模式注册脚本
│   └── outlook_register.py           # Outlook 注册自动化脚本 (辅助)
├── skills/
│   └── SKILL_google_register.md      # 技能文档供复用
└── accounts/
    └── ACCOUNTS.md                   # 已创建的测试账号信息
```

---

## 使用方法

### 方式一: Node.js 移动模式（推荐）

```bash
# 安装依赖
npm install
npx playwright install chromium

# 配置信息
cp config.example.json config.json
# 编辑 config.json 填写你的信息

# 运行（移动模式，推荐 — 使用 SMS 验证）
npm run signup

# 运行（桌面模式 — 使用 QR 码验证）
MOBILE=false npm run signup

# 运行（无界面模式）
npm run signup:headless
```

### 方式二: Python CDP 移动模式（推荐 — 已验证可获得 SMS 验证）

```bash
pip install playwright
# 确保 Chrome 已启动并开启 CDP (端口 29229)
python scripts/cdp_mobile_register.py
```

此脚本连接到已运行的 Chrome 浏览器，创建 Pixel 7 移动模拟上下文，自动完成步骤 1-4 后到达 SMS 验证页面。

### 方式三: Python CDP 桌面模式

```bash
pip install playwright
python scripts/google_register.py \
  --first-name "David" \
  --last-name "Carter" \
  --email "your.existing.email@outlook.com" \
  --password "YourStrongPassword" \
  --use-existing-email
```

### 验证步骤说明

**移动模式（推荐）**：脚本到达验证页面时会提示使用虚拟号码服务接收 SMS 验证码。

**桌面模式**：脚本到达 QR 码验证页面时会暂停等待手动扫码。

---

## 注意事项

- Google 可能会根据 IP 地址、浏览器指纹等因素改变验证要求
- 请勿将 `config.json` 提交到版本控制（已在 `.gitignore` 中排除）
- 本工具仅供个人辅助使用，请遵守 Google 服务条款
- 移动模式使用 Playwright 的 `devices["Pixel 7"]` 配置进行设备模拟

## 建议的虚拟号码服务

如需使用 SMS 验证，以下服务可接收验证码（仅供参考）：
- [sms-activate.org](https://sms-activate.org)
- [5sim.net](https://5sim.net)
- [onlinesim.io](https://onlinesim.io)

## 建议的下一步

1. **尝试虚拟号码服务**: 配合移动模式脚本完成完整注册
2. **联系 Google 无障碍支持**: https://support.google.com/accounts/troubleshooter/2402620
3. **请他人协助验证**: 验证不会绑定手机号到新账号
4. **考虑 Google Workspace**: 企业版可能有不同的验证流程

## License

MIT
