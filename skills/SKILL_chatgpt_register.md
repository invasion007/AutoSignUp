# SKILL: ChatGPT 账号注册

## 概述

使用 Playwright 自动化 ChatGPT (OpenAI) 账号注册流程。参考 GuJumpgate 项目实现。

## 前提条件

1. 已安装 Node.js 和 npm
2. 有可用的邮箱（推荐 Outlook，不需要手机验证即可创建）
3. 推荐: 住宅代理 IP（数据中心 IP 可能被拦截）

## 操作步骤

### 1. 安装依赖

```bash
cd AutoSignUp
npm install
npx playwright install chromium
```

### 2. 创建配置

```bash
cp config.chatgpt.example.json config.chatgpt.json
```

编辑 `config.chatgpt.json`:
```json
{
  "email": "your-email@outlook.com",
  "password": "StrongPassword123!",
  "firstName": "Your",
  "lastName": "Name",
  "birthday": { "year": "1990", "month": "3", "day": "15" }
}
```

### 3. 运行注册脚本

```bash
# 标准模式（有浏览器界面）
npm run signup:chatgpt

# 使用代理
PROXY_SERVER=http://host:port npm run signup:chatgpt

# CDP 模式（连接已有浏览器调试端口）
npm run signup:chatgpt:cdp
```

### 4. 手动步骤

- 当脚本提示输入验证码时，查收邮件并输入 6 位验证码
- 如果遇到 CAPTCHA，需要在浏览器中手动完成

### 5. 验证注册成功

- 脚本完成后会显示注册状态
- 账号信息自动保存到 `accounts/ACCOUNTS.md`
- 可在 https://chatgpt.com 验证登录

## 注意事项

- 数据中心 IP 容易被检测拦截，建议使用 711Proxy 等住宅代理服务
- 同一邮箱只能注册一个 ChatGPT 账号
- 每次注册后建议等待一段时间再次注册（避免触发频率限制）
- 本工具仅供个人无障碍辅助使用
