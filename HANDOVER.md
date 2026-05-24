# 交接文档 — Google 账号自动注册项目

> 最后更新: 2026-05-24  
> 仓库: https://github.com/invasion007/AutoSignUp  
> 分支: `initial-setup`

---

## 一、项目背景

用户是一位残疾人士，无法使用鼠标和键盘，只能通过语音输入与系统交互。  
用户没有手机号码，需要注册 Google 账号但被手机验证阻挡。  
本项目目标是自动化 Google 注册流程，并找到绕过手机验证的方法。

---

## 二、核心发现（重要！）

### 发现 1：移动设备模拟可将 QR 码验证变为 SMS 短信验证

**这是本项目最重要的发现。**

| 注册方式 | 验证类型 | 验证页面 URL | 是否需要物理手机 |
|----------|----------|-------------|----------------|
| 桌面浏览器（Chrome） | QR 码扫描 | `/mophoneverification` 或 `/crossflowverification` | 是 |
| **移动设备模拟（Pixel 7）** | **SMS 短信** | `/devicephoneverification/consent` | **否（可用虚拟号码）** |

**实现方式：** 使用 Playwright 的 `devices["Pixel 7"]` 配置模拟移动设备，Google 会认为是从手机注册，因此提供 SMS 验证而非 QR 码。

**意义：** SMS 验证码可以通过虚拟号码服务接收，不需要物理手机。

### 发现 2：所有桌面路径都需要 QR 码

已测试的桌面注册路径：
- 标准路径（直接注册新 Gmail）→ QR 码
- YouTube 注册路径 → QR 码
- "Use existing email" 路径 → 邮箱验证通过后仍需 QR 码
- 隐身模式 → QR 码

### 发现 3：Outlook 邮箱注册不需要手机验证

Outlook 注册流程只需要通过人机验证（按住按钮），完全不需要手机号码。  
已成功创建 Outlook 邮箱（详见 `accounts/ACCOUNTS.md`）。

### 发现 4：触发 QR 码验证的因素

根据调研，以下因素会增加 QR 码验证概率：
- 数据中心 IP / VPN / 被标记的 IP 地址
- 同一设备/网络多次注册
- 浏览器语言与 IP 地区不匹配
- 干净的浏览器环境（无历史、无 cookies）
- 虚拟机特征被检测到

---

## 三、已完成的工作

### 3.1 注册流程文档

| 文件 | 内容 |
|------|------|
| `docs/registration-flow.md` | 7 步注册流程的完整技术文档（URL、选择器、字段名） |
| `docs/FINDINGS.md` | 所有测试路径的发现与结论 |
| `docs/GOOGLE_注册流程文档.md` | 中文流程说明 |

### 3.2 自动化脚本

| 文件 | 语言 | 说明 |
|------|------|------|
| `scripts/google-signup.mjs` | Node.js | **主脚本**，支持移动模式（SMS验证）和桌面模式（QR验证） |
| `scripts/cdp_mobile_register.py` | Python | **CDP 移动模式脚本** — 已验证可成功获得 SMS 验证（2026-05-24） |
| `scripts/google_register.py` | Python | 通过 CDP 连接浏览器的桌面模式注册脚本 |
| `scripts/outlook_register.py` | Python | Outlook 邮箱注册脚本 |

### 3.3 配置与工具

| 文件 | 说明 |
|------|------|
| `config.example.json` | 注册信息配置模板 |
| `package.json` | Node.js 依赖和运行命令 |
| `.gitignore` | 排除敏感文件和依赖目录 |

### 3.4 已创建的账号

详见 `accounts/ACCOUNTS.md`：
- Outlook 邮箱: `david.carter.2490@outlook.com`（可用）
- Google 账号: 卡在验证步骤（未完成）

### 3.5 录屏文件

两段录屏记录了完整的测试过程（未包含在仓库中，需另行获取）：
1. 第一次测试：标准桌面注册流程 → 遇到 QR 码
2. 第二次测试：YouTube 路径 + 移动设备模拟 → 发现 SMS 验证

---

## 四、下一步操作指南

### 第 1 步：获取虚拟号码（优先）

推荐的虚拟号码服务（可接收 Google SMS 验证码）：

| 服务 | 网址 | 价格 | 说明 |
|------|------|------|------|
| sms-activate.org | https://sms-activate.org | ~$0.10-0.50 | 支持多国号码，可选择 Google 专用 |
| 5sim.net | https://5sim.net | ~$0.10-0.30 | 界面简洁 |
| onlinesim.io | https://onlinesim.io | ~$0.10-0.50 | 支持多种服务 |

**操作步骤：**
1. 注册虚拟号码服务账号
2. 充值（通常支持支付宝/微信/加密货币）
3. 选择 "Google" 服务 + 选择国家
4. 获取一个临时手机号码
5. 在注册脚本的 SMS 验证步骤使用该号码

### 第 2 步：运行移动模式注册脚本

```bash
# 1. 安装依赖
cd AutoSignUp
npm install
npx playwright install chromium

# 2. 创建配置文件
cp config.example.json config.json
# 编辑 config.json 填写注册信息

# 3. 运行脚本（默认移动模式）
npm run signup
# 脚本到达 SMS 验证步骤时会暂停
# 此时使用虚拟号码接收验证码并输入
```

### 第 3 步：完成注册后的安全措施

注册成功后建议：
1. 添加恢复邮箱（可使用已创建的 Outlook 邮箱）
2. 修改密码为更强的密码
3. 记录账号信息到 `accounts/ACCOUNTS.md`

### 备选方案

如果移动模式 + 虚拟号码仍然失败：

1. **联系 Google 无障碍支持**  
   https://support.google.com/accounts/troubleshooter/2402620  
   说明残疾人身份，请求替代验证方式

2. **请他人协助扫码**  
   QR 码验证不会将手机号绑定到新账号，让朋友帮忙扫一次即可

3. **考虑 Google Workspace**  
   企业版可能有不同的验证流程

4. **使用 Android 模拟器**  
   通过 Android 模拟器（如 Android Studio AVD）内的 Google Play 注册  
   模拟器内的注册流程通常更宽松

---

## 五、文件结构总览

```
AutoSignUp/
├── README.md                          # 项目说明和使用方法
├── HANDOVER.md                        # 本交接文档
├── package.json                       # Node.js 依赖 (playwright ^1.52.0)
├── config.example.json                # 注册信息配置模板
├── .gitignore                         # Git 忽略规则
│
├── scripts/
│   ├── google-signup.mjs              # [主脚本] Node.js 注册脚本（支持移动/桌面模式）
│   ├── google_register.py             # Python CDP 注册脚本
│   └── outlook_register.py            # Outlook 注册辅助脚本
│
├── docs/
│   ├── registration-flow.md           # 注册流程技术文档（URL + 选择器 + 字段）
│   ├── FINDINGS.md                    # 测试发现与结论
│   └── GOOGLE_注册流程文档.md          # 中文流程说明
│
├── skills/
│   └── SKILL_google_register.md       # 可复用的技能文档
│
└── accounts/
    └── ACCOUNTS.md                    # 已创建的账号信息
```

---

## 六、技术要点

### Node.js 脚本 (`google-signup.mjs`) 关键配置

```javascript
// 移动设备模拟 — 获得 SMS 验证
import { chromium, devices } from 'playwright';
const context = await browser.newContext({
  ...devices['Pixel 7'],
  locale: 'en-US',
});

// 桌面模式 — 会遇到 QR 码验证
const context = await browser.newContext({
  locale: 'en-US',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...',
});
```

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MOBILE` | `true` | 是否使用移动设备模拟 |
| `HEADLESS` | `false` | 是否无界面运行 |

### URL 模式（判断当前步骤）

| URL 片段 | 步骤 |
|----------|------|
| `/signup/name` | 输入姓名 |
| `/signup/birthdaygender` | 生日性别 |
| `/signup/username` | 选择用户名 |
| `/signup/password` | 设置密码 |
| `/devicephoneverification` | SMS 验证（移动模式） |
| `/mophoneverification` | QR 码验证（桌面模式） |
| `/crossflowverification` | QR 码验证（YouTube 路径） |

### Chrome CDP 连接（Python 脚本用）

```python
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp("http://localhost:29229")
```

---

## 七、已知限制

1. **虚拟号码可能被 Google 识别** — 部分虚拟号码段已被 Google 标记，可能需要多试几个号码
2. **IP 信誉影响** — 数据中心 IP 更容易触发严格验证
3. **Google 持续更新验证策略** — 本文档中的方法在 2026-05-24 验证有效，未来可能失效
4. **注册频率限制** — 同一 IP 短时间内多次注册会被阻止

---

## 八、修复记录（2026-05-24 第二次更新）

### Bug: 下拉框选择器误击 footer 语言选择器

**问题**：`google-signup.mjs` 和 `google_register.py` 中使用 `div[aria-expanded="false"]` 选择器选择性别下拉框时，会误击页面 footer 中的语言选择下拉框（也有 `aria-expanded` 属性），导致脚本超时失败。

**修复**：改为使用 `page.evaluate()` + `document.querySelector('section')` 限定在表单区域内查找下拉框，避免 footer 语言选择器干扰。

### 新增: CDP 移动模式脚本 (`cdp_mobile_register.py`)

**功能**：连接运行中的 Chrome 浏览器（CDP 端口 29229），创建 Pixel 7 移动设备模拟上下文，自动完成步骤 1-4，到达 SMS 验证页面。

**验证结果**：已成功运行并到达 `devicephoneverification/consent` 页面（SMS 验证），确认移动模拟方案有效。

---

*本文档为完整交接记录，包含所有已知信息和下一步操作指南。*
