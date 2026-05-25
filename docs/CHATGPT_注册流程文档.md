# ChatGPT 注册流程文档

> 参考项目: [GuJumpgate](https://github.com/FoundZiGu/GuJumpgate) (FoundZiGu/GuJumpgate)  
> 最后更新: 2026-05-25

---

## 一、注册流程概览

ChatGPT 账号注册通过 OpenAI 的认证系统完成，共 6 个主要步骤：

| 步骤 | URL 模式 | 内容 | 自动化状态 |
|------|----------|------|-----------|
| 1 | `chatgpt.com` | 打开官网，进入注册 | 可自动 |
| 2 | `auth.openai.com` / `auth0.openai.com` | 输入邮箱 | 可自动 |
| 3 | `auth.openai.com` | 填写密码 | 可自动 |
| 4 | `auth.openai.com` | 邮箱验证码 | 需手动或通过邮箱 API |
| 5 | `auth.openai.com` | 填写姓名和生日 | 可自动 |
| 6 | `chatgpt.com` | 注册完成，进入主页 | 自动检测 |

---

## 二、各步骤详细说明

### 步骤 1: 打开 ChatGPT 官网

- **入口 URL**: `https://chatgpt.com/`
- **备用 URL**: `https://chatgpt.com/auth/login?screen_hint=signup`
- **操作**: 点击 "Sign up" / "注册" 按钮
- **注册入口选择器** (参考 GuJumpgate):
  ```
  触发文本匹配: /免费注册|立即注册|注册|创建(?:账号|帐号|账户|帐户)|sign\s*up|register|create\s*account|get\s*started/i
  ```

### 步骤 2: 输入邮箱

- **URL**: `auth.openai.com` 或 `auth0.openai.com`
- **邮箱输入框选择器**:
  ```css
  input[name="email"]
  input[type="email"]
  input[autocomplete="email"]
  input[autocomplete="username"]
  input[id*="email"]
  input[placeholder*="email" i]
  ```
- **继续按钮**: `button:has-text("Continue")` 或 `button[type="submit"]`

### 步骤 3: 填写密码

- **密码输入框选择器**:
  ```css
  input[type="password"]
  input[name="password"]
  input[autocomplete="new-password"]
  ```
- **提交按钮**: `button:has-text("Continue")` 或 `button:has-text("Sign up")`

### 步骤 4: 邮箱验证码

OpenAI 会向注册邮箱发送 6 位数字验证码。

- **验证码输入框选择器** (参考 GuJumpgate):
  ```css
  input[name="code"]
  input[name="otp"]
  input[autocomplete="one-time-code"]
  input[type="text"][maxlength="6"]
  input[type="tel"][maxlength="6"]
  input[inputmode="numeric"]
  ```
- **分格输入**: 有时验证码会分成 6 个独立输入框 (`input[maxlength="1"]`)
- **验证码提取模式** (从邮件中):
  ```
  /(?:chatgpt\s+log-?in\s+code|enter\s+this\s+code)[^0-9]{0,24}(\d{6})/i
  /your\s+chatgpt\s+code\s+is\s+(\d{6})/i
  /(?:verification\s+code|code(?:\s+is)?)[^0-9]{0,16}(\d{6})/i
  ```

### 步骤 5: 填写姓名和生日

- **姓名输入框**:
  ```css
  input[name="name"]              /* 全名，单字段 */
  input[placeholder*="全名"]
  input[autocomplete="name"]
  ```
- **生日字段** (多种 UI 变体):
  - React Aria DateField: `[role="spinbutton"][data-type="year|month|day"]`
  - 隐藏输入框: `input[name="birthday"]`
  - 年龄字段: `input[name="age"]`

### 步骤 6: 完成注册

- 成功后页面跳转到 `chatgpt.com`（不含 `auth` 路径）
- 可能需要点击 "Okay" / "Continue" / "Next" 跳过引导页面

---

## 三、IP 检测与代理

### 数据中心 IP 问题

OpenAI 会检测注册请求的 IP 类型。数据中心 IP（如云服务器、VPS）通常会被拦截或触发额外验证。

### 住宅代理 (Residential Proxy)

使用住宅代理可以模拟真实用户的网络环境，降低被拦截概率。

**推荐服务（参考 GuJumpgate）：**

| 服务 | 说明 |
|------|------|
| [711Proxy](https://www.711proxy.com) | GuJumpgate 内置支持，100M+ 住宅 IP |

**711Proxy 配置示例**:
```
Host: global.rotgb.711proxy.com
Port: 10000
Protocol: HTTP
Username: user-region-US-session-randomstr-sessTime-30
Password: your-password
```

### 代理使用方式

1. **环境变量**:
   ```bash
   PROXY_SERVER=http://host:port PROXY_USERNAME=user PROXY_PASSWORD=pass npm run signup:chatgpt
   ```

2. **配置文件** (`config.chatgpt.json`):
   ```json
   {
     "proxy": {
       "server": "http://host:port",
       "username": "user",
       "password": "pass"
     }
   }
   ```

### IP 纯净度检测

注册前检查代理 IP 质量:
- [IPPure](https://ippure.com/) — IP 纯净度评分
- [IPData](https://ipdata.co/) — 风险标签和 ASN 信息
- [IP111](https://ip111.cn/) — 出口 IP 确认

---

## 四、与 GuJumpgate 的对比

| 特性 | GuJumpgate | 本项目 (AutoSignUp) |
|------|-----------|-------------------|
| 实现方式 | Chrome 扩展 (Content Script) | Node.js Playwright 脚本 |
| 邮箱服务 | Hotmail/iCloud/Cloudflare/QQ 等 | 任意邮箱（手动输入验证码） |
| 代理支持 | 内置 711Proxy + PAC 代理 | 环境变量或配置文件 |
| 付款功能 | 支持 PayPal/GoPay 自动激活 Plus | 仅注册免费账号 |
| 自动化程度 | 全自动（含验证码获取） | 半自动（需手动输入验证码） |
| 适用场景 | 批量注册 + 付费激活 | 无障碍辅助个人注册 |

---

## 五、已知限制

1. **验证码需手动输入**: 当前脚本不包含自动从邮箱获取验证码的功能
2. **IP 限制**: 数据中心 IP 大概率被拦截，需要住宅代理
3. **页面变化**: OpenAI 可能随时更新注册页面结构，需要更新选择器
4. **频率限制**: 同一 IP 短时间内多次注册可能触发限制
