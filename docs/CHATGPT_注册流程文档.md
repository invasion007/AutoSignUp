# ChatGPT 注册流程文档

## 概述

使用免费住宅IP代理 + Outlook邮箱完成 ChatGPT 账号注册。

**已验证成功** (2026-05-25):
- 邮箱: david.carter.2490@outlook.com
- 代理: Cox Communications 98.182.147.97:4145 (SOCKS5)
- 结果: 注册成功，Free tier

## 关键发现

### 1. 必须使用住宅IP

ChatGPT 使用 Cloudflare 保护，**数据中心IP会被直接拦截**。

已测试失败的IP类型:
- AWS EC2 (54.201.200.193) → Cloudflare challenge 循环
- Webshare 免费代理 (ServerMania, Leaseweb 等) → 全部被拦截
- VPN 台湾节点 → 403 Forbidden

**只有住宅ISP的IP能通过** (Comcast, AT&T, Cox, Spectrum 等)。

### 2. 免费住宅代理来源

ProxyScrape API 提供免费的 SOCKS5 住宅代理列表:

```
https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000&country=US
```

获取后用 ip-api.com 验证是否为住宅IP:
```bash
curl -x socks5://<ip>:<port> http://ip-api.com/json
```

查看返回的 `isp` 字段，如果是 Cox, Comcast, AT&T, Spectrum 等家庭宽带运营商，就是住宅IP。

### 3. Playwright 配置要点

```javascript
// 必须: 使用 SOCKS5 代理
const browser = await chromium.launch({
  headless: false,
  proxy: { server: "socks5://<ip>:<port>" },
  args: [
    '--disable-blink-features=AutomationControlled',  // 隐藏自动化特征
    '--ignore-certificate-errors',                     // SOCKS5 TLS 兼容
    '--start-maximized'
  ]
});

// 必须: 忽略 HTTPS 错误 (SOCKS5 代理的 TLS 限制)
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...",
  viewport: null  // 使用完整窗口
});
```

## 注册流程 (6步)

### 步骤1: 打开 ChatGPT

访问 `https://chatgpt.com/` → 点击 "Sign up"

### 步骤2: 输入邮箱

在登录页输入 Outlook 邮箱地址 → 点击 "Continue" (注意不要点 "Continue with Google/Microsoft")

### 步骤3: 邮箱验证码

ChatGPT 会发送6位验证码到邮箱。
- 登录 Outlook (https://outlook.live.com/mail/) 查收
- 邮件发件人: ChatGPT
- 主题: "Your temporary ChatGPT verification code"
- 验证码有效期约5分钟，过期需重新请求

### 步骤4: 填写个人信息

- Full name: 姓名
- Age: 年龄 (需 ≥ 13)
- 点击 "Finish creating account"

### 步骤5: Passkey (跳过)

会提示创建 Passkey，点击 "Skip" 跳过。

### 步骤6: 完成

自动跳转到 ChatGPT 主页面，显示 "What are you working on?"。

## 快速使用

```bash
cd /home/ubuntu/AutoSignUp

# 1. 获取免费住宅代理
curl -s "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000&country=US" | head -20

# 2. 验证代理是住宅IP (查看 isp 字段)
curl -x socks5://<ip>:<port> http://ip-api.com/json

# 3. 运行注册脚本
PROXY=socks5://<ip>:<port> EMAIL=<your-outlook-email> node scripts/chatgpt-signup.mjs
```

## 注意事项

1. **免费代理不稳定** - 随时可能失效，需要从列表中重新选择
2. **验证码有时效** - 收到后尽快输入，约5分钟过期
3. **ChatGPT 无密码登录** - 注册后使用邮箱验证码登录 (每次都发新码)
4. **一个邮箱只能注册一个账号** - 不能重复注册
5. **SOCKS5 + Playwright** - 必须配置 `ignoreHTTPSErrors: true` 和 `--ignore-certificate-errors`
