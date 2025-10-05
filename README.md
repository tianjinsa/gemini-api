# Gemini API 代理服务器

> **增强型 Gemini API 代理服务器**，支持请求缓存、对话追踪、安全防护、实时监控仪表盘及 IP 别名管理系统。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D14.0.0-green.svg)](https://nodejs.org/)
[![Vue 3](https://img.shields.io/badge/vue-3.4.38-brightgreen.svg)](https://vuejs.org/)

---

## 📖 目录

- [特性概览](#特性概览)
- [快速开始](#快速开始)
- [核心功能](#核心功能)
  - [智能对话管理](#智能对话管理)
  - [安全防护体系](#安全防护体系)
  - [可视化仪表盘](#可视化仪表盘)
  - [IP 别名与密钥系统](#ip-别名与密钥系统)
- [架构设计](#架构设计)
- [配置说明](#配置说明)
- [API 文档](#api-文档)
- [开发指南](#开发指南)
- [常见问题](#常见问题)
- [License](#license)

---

## ✨ 特性概览

### 🚀 核心能力

- **智能对话追踪**：自动识别并合并连续对话，支持链式哈希防重复
- **持久化存储**：基于 SQLite 的高效消息存储，支持懒加载与分页
- **安全防护**：IP 封禁、速率限制、防火墙级别攻击检测
- **实时监控**：Vue 3 仪表盘，实时统计流量、消息、Token 使用情况
- **隐私优化**：敏感数据不落盘，错误详情懒加载

### 🎨 用户体验

- **三面板层叠布局**：响应式设计，支持桌面/移动端自适应
- **Prompt Token 明细**：显示不同模态（TEXT/IMAGE/AUDIO）的 Token 分布
- **错误状态高亮**：模型错误时，消息气泡全局红色主题
- **附件预览**：支持文本、图片附件的即时预览
- **Markdown 渲染**：集成 GitHub 暗色主题，代码块一键复制

### 🔒 安全特性

- **IP 别名系统**：通过密钥验证的 IP 别名，支持友好显示
- **多重防护**：限流 + IP 封禁 + 持续攻击监测
- **JWT 认证**：仪表盘访问令牌保护
- **请求净化**：自动清理请求体中的敏感字段

---

## 🚀 快速开始

### 前置要求

- **Node.js** ≥ 14.0.0
- **npm** 或 **yarn**

### 安装与启动

#### 1️⃣ 克隆项目

```bash
git clone https://github.com/tianjinsa/gemini-api.git
cd gemini-api
```

#### 2️⃣ 安装后端依赖

```bash
cd server
npm install
```

#### 3️⃣ 配置环境变量（可选）

创建 `server/.env` 文件：

```env
# 服务端口
PORT=3000

# Dashboard 访问密码（未设置则无需认证）
DASHBOARD_PASSWORD=your_secure_password

# Dashboard 令牌密钥（生成 JWT 使用）
DASHBOARD_TOKEN_SECRET=your_jwt_secret

# IP 别名密钥（用于 IP 别名验证）
DASHBOARD_IP_ALIAS_SECRET=your_alias_secret

# 速率限制配置
RATE_LIMIT_MAX_REQUESTS=10
RATE_LIMIT_WINDOW_MS=60000

# 防火墙配置
FIREWALL_BLOCK_THRESHOLD=20
FIREWALL_BLOCK_WINDOW_MS=300000
```

#### 4️⃣ 启动后端服务

```bash
npm start
```

服务将运行在 `http://localhost:3000`

#### 5️⃣ 构建前端仪表盘（可选）

```bash
cd ../dashboard-app
npm install
npm run build
```

构建产物将自动输出到 `frontend`，后端服务会自动托管静态文件。

#### 6️⃣ 访问仪表盘

打开浏览器访问：`http://localhost:3000/dashboard`

---

## 🎯 核心功能

### 智能对话管理

#### 🔗 对话链式哈希

系统通过计算请求消息的链式哈希值（忽略推理内容）自动识别对话上下文：

- **新对话检测**：根据历史消息数量和哈希值判断是否为新话题
- **前缀匹配**：当请求消息 N-1 条与已存储话题的哈希值匹配时，自动追加新消息
- **重复提交过滤**：完全相同的请求将被识别为重复提交

**哈希计算公式：**

```
初始哈希 = SHA1(systemInstruction)
每条消息哈希 = SHA1(前一哈希 + SHA1(角色:文本:附件哈希))
```

#### 💾 数据持久化策略

- **用户消息**：完整保存请求 URL、请求头、请求体（包含历史上下文）
- **模型消息**：仅保存元数据（状态码、Token 统计、模型信息、错误摘要）
- **懒加载设计**：
  - 请求体/请求头按需加载
  - 错误详情对象按需获取
  - 附件内容分块读取

#### 📊 Token 统计增强

支持展示 `promptTokensDetails`，显示不同输入模态的 Token 分布：

```json
{
  "promptTokensDetails": [
    { "modality": "TEXT", "tokenCount": 22 },
    { "modality": "IMAGE", "tokenCount": 258 }
  ]
}
```

前端自动归一化并在 Token 统计区块展示明细列表。

---

### 安全防护体系

#### 🛡️ 三层防护机制

**1. IP 封禁（IPBlocker）**

- 默认封禁时长：7 天
- 支持手动封禁/解封
- 持久化存储：`data/blocked_ips.json`
- 自动过期解封

**2. 速率限制（RateLimiter）**

- 默认配置：10 次/分钟
- 滑动时间窗口算法
- 可疑 IP 标记与增强限流
- 429 状态码响应 + `Retry-After` 头部

**3. 防火墙监测**

- 检测持续攻击行为
- 阈值默认：5 分钟内 20 次被拒绝请求
- 记录到日志，建议配合 fail2ban 使用

#### 🔐 IP 别名系统

通过自定义请求头实现友好 IP 显示：

```bash
curl -H "name: Alice" \
     -H "namekey: your_alias_secret" \
     https://your-proxy.com/v1beta/models/gemini-2.0-flash:generateContent
```

- 密钥验证通过后，日志和仪表盘显示 `Alice (1.2.3.4)` 而非原始 IP
- 别名使用统计自动记录
- 支持仪表盘管理：查看别名使用情况、删除别名

**数据库表结构：**

```sql
CREATE TABLE alias_keys (
  alias_name TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  first_used_at INTEGER,
  usage_count INTEGER DEFAULT 0
);
```

---

### 可视化仪表盘

#### 🎨 三面板层叠布局

**技术实现：**

- 基于 Vue 3 + Pinia 状态管理
- 响应式布局系统（`src/composables/panelLayout.ts`）
- 自适应断点：960px（桌面/移动切换）

**面板结构：**

1. **IP 列表面板**（左）
   - 实时流量统计
   - 请求次数排序
   - IP 封禁管理
   - 别名密钥管理

2. **话题列表面板**（中）
   - 对话主题浏览
   - 消息数量统计
   - 话题哈希展示
   - 时间线排序

3. **消息详情面板**（右）
   - 用户/模型消息展示
   - Token 统计明细
   - 错误详情懒加载
   - 附件预览支持

**交互特性：**

- 聚焦面板自动展开，非聚焦面板折叠为标题栏
- 过滤/排序浮层：桌面端鼠标悬停触发，移动端点击触发
- 消息截断：列表中仅显示前 45 行，点击"查看全部"弹窗展示完整内容
- Markdown 渲染：GitHub 暗色主题 + 代码块复制按钮

#### 📈 实时统计数据

**全局统计 (Stats Header):**

- 总请求数
- 入站/出站流量（KB 单位）
- 最后全局消息时间
- 服务启动时间

**增量更新 (Delta API):**

- 轮询间隔：3 秒
- 仅传输变化的 IP 和话题数据
- 前端状态增量合并，减少带宽占用

**数据格式示例：**

```json
{
  "since": 1728123456789,
  "lGMsgAt": 1728124000000,
  "chgIPs": [
    {
      "ip": "1.2.3.4",
      "ipUpdAt": 1728124000000,
      "reqs": 5,
      "inTfc": 2048,
      "outTfc": 8192
    }
  ],
  "chgTop": [
    {
      "ip": "1.2.3.4",
      "tid": "abc123",
      "ctAt": 1728120000000,
      "upAt": 1728124000000,
      "msgCnt": 4,
      "inBytes": 1024,
      "outBytes": 4096,
    }
  ]
}
```

---

### IP 别名与密钥系统

#### 📝 系统说明

**设计目标：**

- 为多用户共享同一代理提供身份标识
- 避免直接暴露 IP 地址
- 简化日志和统计的用户识别

**工作流程：**

1. 管理员设置 `DASHBOARD_IP_ALIAS_SECRET` 环境变量
2. 用户请求时携带自定义头部：

   ```
   name: user_alias
   namekey: your_secret
   ```

3. 代理验证密钥后记录别名使用
4. 日志和仪表盘显示别名而非 IP
5. 数据库持久化别名统计信息

**API 端点：**

- `GET /dashboard/api/aliasKeys` - 获取所有别名
- `POST /dashboard/api/deleteAliasKey` - 删除指定别名

**数据示例：**

```json
{
  "aliasKeys": [
    {
      "aliasName": "Alice",
      "ctAt": 1728120000000,
      "upAt": 1728124000000,
      "firstUsedAt": 1728120000000,
      "usageCount": 42
    }
  ]
}
```

---

## 🏗️ 架构设计

### 项目结构

```
gemini-api/
├── server/                    # Node.js 后端服务
│   ├── server.js              # 主入口文件
│   ├── src/
│   │   ├── api/               # Dashboard API
│   │   │   ├── dashboardAPI.js
│   │   │   ├── dashboardHandler.js
│   │   │   └── responseMapper.js
│   │   ├── proxy/             # 代理核心
│   │   │   ├── geminiProxy.js
│   │   │   └── messageProcessor.js
│   │   ├── security/          # 安全模块
│   │   │   ├── index.js
│   │   │   ├── ipBlocker.js
│   │   │   └── rateLimiter.js
│   │   ├── storage/           # 数据存储
│   │   │   └── index.js
│   │   └── utils/             # 工具函数
│   │       ├── dataExtractor.js
│   │       ├── helpers.js
│   │       └── logger.js
│   ├── data/                  # 数据目录
│   │   └── database.db        # SQLite 数据库
│   └── package.json
│
├── dashboard-app/             # Vue 3 仪表盘前端
│   ├── src/
│   │   ├── App.vue            # 根组件
│   │   ├── main.ts            # 应用入口
│   │   ├── api/               # API 客户端
│   │   │   ├── dashboard.ts
│   │   │   └── httpClient.ts
│   │   ├── components/        # UI 组件
│   │   │   ├── MessageCard.vue
│   │   │   ├── IpListPanel.vue
│   │   │   ├── TopicListPanel.vue
│   │   │   ├── MessagePanel.vue
│   │   │   ├── BanManager.vue
│   │   │   ├── AliasManager.vue
│   │   │   └── ...
│   │   ├── composables/       # 组合式函数
│   │   │   ├── panelLayout.ts
│   │   │   ├── relativeTime.ts
│   │   │   └── overlayDismiss.ts
│   │   ├── stores/            # Pinia 状态管理
│   │   │   ├── dashboard.ts
│   │   │   ├── ui.ts
│   │   │   └── controlOverlay.ts
│   │   ├── types/             # TypeScript 类型
│   │   │   ├── api.ts
│   │   │   └── index.ts
│   │   └── styles/            # 全局样式
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── frontend/                  # 构建产物输出目录
│
├── packages/                  # 内部包
│   └── layered-card-layout/  # 层叠布局组件库
│
└── README.md
```

### 技术栈

**后端：**

- **Runtime**: Node.js ≥ 14.0.0
- **数据库**: better-sqlite3 (SQLite)
- **认证**: jsonwebtoken (JWT)
- **HTTP 代理**: 原生 Node.js `http` 模块

**前端：**

- **框架**: Vue 3.4.38 (Composition API)
- **状态管理**: Pinia 2.1.7
- **构建工具**: Vite 7.1.7
- **TypeScript**: 5.5.4
- **工具库**: @vueuse/core, dayjs, nanoid

---

## ⚙️ 配置说明

### 环境变量设置

#### 方式一：使用 `.env` 文件（推荐）

在 `server` 目录下创建 `.env` 文件：

```bash
cd server
touch .env  # Linux/macOS
# 或
echo. > .env  # Windows
```

然后编辑 `.env` 文件，添加以下配置：

```env
# ====== 基础配置 ======
# 服务监听端口
PORT=3000

# ====== Dashboard 认证 ======
# Dashboard 访问密码（强烈建议设置，留空则无需认证）
DASHBOARD_PASSWORD=your_secure_password_here

# JWT 令牌签名密钥（用于生成登录令牌，建议使用强随机字符串）
DASHBOARD_TOKEN_SECRET=your_random_secret_key_at_least_32_chars

# ====== IP 别名系统 ======
# IP 别名验证密钥（用户请求时需提供此密钥才能使用别名）
DASHBOARD_IP_ALIAS_SECRET=your_alias_secret_key

# ====== 安全防护配置 ======
# 速率限制：时间窗口内允许的最大请求数
RATE_LIMIT_MAX_REQUESTS=10

# 速率限制：时间窗口大小（毫秒），默认 60000 = 1分钟
RATE_LIMIT_WINDOW_MS=60000

# 防火墙：触发封禁建议的失败请求阈值
FIREWALL_BLOCK_THRESHOLD=20

# 防火墙：监测时间窗口（毫秒），默认 300000 = 5分钟
FIREWALL_BLOCK_WINDOW_MS=300000
```

#### 方式二：命令行参数

```bash
# Linux/macOS
PORT=8080 DASHBOARD_PASSWORD=mypass123 node server.js

# Windows PowerShell
$env:PORT="8080"; $env:DASHBOARD_PASSWORD="mypass123"; node server.js

# Windows CMD
set PORT=8080 && set DASHBOARD_PASSWORD=mypass123 && node server.js
```

#### 方式三：系统环境变量

**Linux/macOS:**

```bash
# 临时设置（当前会话有效）
export PORT=3000
export DASHBOARD_PASSWORD=your_password

# 永久设置（添加到 ~/.bashrc 或 ~/.zshrc）
echo 'export DASHBOARD_PASSWORD=your_password' >> ~/.bashrc
source ~/.bashrc
```

**Windows:**

```powershell
# 临时设置（当前会话有效）
$env:PORT = "3000"
$env:DASHBOARD_PASSWORD = "your_password"

# 永久设置（系统环境变量）
[System.Environment]::SetEnvironmentVariable("DASHBOARD_PASSWORD", "your_password", "User")
```

### 环境变量详解

| 变量名 | 默认值 | 说明 | 示例值 |
|--------|--------|------|--------|
| `PORT` | `3000` | 服务监听端口 | `8080` |
| `DASHBOARD_PASSWORD` | 无 | 仪表盘访问密码<br>⚠️ **未设置则无需认证** | `MySecurePass123!` |
| `DASHBOARD_TOKEN_SECRET` | 无 | JWT 签名密钥<br>建议至少 32 字符 | `a1b2c3d4e5f6...` |
| `DASHBOARD_IP_ALIAS_SECRET` | 无 | IP 别名验证密钥<br>用户需提供此密钥才能使用别名功能 | `alias_secret_key` |
| `DASHBOARD_CDN_BASE` | 无 | 前端静态资源 CDN 地址<br>用于加速前端资源加载 | `https://cdn.example.com` |
| `DASHBOARD_DIST_DIR` | 自动检测 | 前端构建产物目录路径<br>默认为 `../frontend` | `/path/to/custom/dist` |
| `DASHBOARD_ASSETS_VERSION` | 无 | 前端资源版本标识<br>用于缓存更新控制 | `v1.0.0` |
| `RATE_LIMIT_MAX_REQUESTS` | `10` | 速率限制：最大请求数<br>每个时间窗口内允许的请求次数 | `50` |
| `RATE_LIMIT_WINDOW_MS` | `60000` | 速率限制：时间窗口（毫秒）<br>`60000` = 1分钟 | `120000` (2分钟) |
| `FIREWALL_BLOCK_THRESHOLD` | `20` | 防火墙：触发阈值<br>监测窗口内失败请求达到此值触发警告 | `50` |
| `FIREWALL_BLOCK_WINDOW_MS` | `300000` | 防火墙：监测窗口（毫秒）<br>`300000` = 5分钟 | `600000` (10分钟) |

### 配置建议

#### 🔒 生产环境

```env
PORT=3000
DASHBOARD_PASSWORD=use_a_strong_random_password_here
DASHBOARD_TOKEN_SECRET=use_at_least_32_random_characters
DASHBOARD_IP_ALIAS_SECRET=another_random_secret
RATE_LIMIT_MAX_REQUESTS=20
RATE_LIMIT_WINDOW_MS=60000
FIREWALL_BLOCK_THRESHOLD=30
FIREWALL_BLOCK_WINDOW_MS=300000
```

**安全提示：**

- ✅ 始终设置 `DASHBOARD_PASSWORD`
- ✅ 使用强随机字符串作为密钥（推荐使用密码生成器）
- ✅ 不要将 `.env` 文件提交到 Git 仓库
- ✅ 定期更换密钥和密码

#### 🧪 开发环境

```env
PORT=3000
# 可选：开发环境可以不设置密码
# DASHBOARD_PASSWORD=dev123
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000
```

#### 🚀 高流量场景

```env
PORT=3000
DASHBOARD_PASSWORD=your_password
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000
FIREWALL_BLOCK_THRESHOLD=100
FIREWALL_BLOCK_WINDOW_MS=600000
```

### 密钥生成示例

使用 Node.js 生成强随机密钥：

```bash
# 生成 32 字节随机密钥
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

输出示例：

```
a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2
```

### 前端 CDN 配置

#### 📦 静态资源加速

Dashboard 前端支持 CDN 加速，通过环境变量配置 CDN 地址后，所有静态资源（JS/CSS/图片）将从 CDN 加载。

#### 配置步骤

**1. 构建前端资源**

```bash
cd dashboard-app
npm run build
```

构建产物输出到 `frontend/` 目录，包含：

- `index.html` - 入口页面
- `assets/` - JS/CSS/图片等静态资源

**2. 上传到 CDN**

将 `frontend/` 目录上传到您的 CDN 服务器，例如：

- 阿里云 OSS: `https://your-bucket.oss-cn-hangzhou.aliyuncs.com/dashboard/`
- 腾讯云 COS: `https://your-bucket.cos.ap-guangzhou.myqcloud.com/dashboard/`
- 七牛云: `https://cdn.example.com/dashboard/`
- Cloudflare: `https://cdn.yourdomain.com/dashboard/`

**3. 设置环境变量**

```env
# CDN 基础 URL（不包含 /assets/）
DASHBOARD_CDN_BASE=https://cdn.example.com/dashboard

# 可选：资源版本控制
DASHBOARD_ASSETS_VERSION=v1.0.0
```

**4. 重启服务**

```bash
cd ../server
npm start
```

#### 工作原理

服务器会在 HTML 中注入以下配置：

```javascript
window.OPENLIST_CONFIG = {
  cdn: "https://cdn.example.com/dashboard",
  version: "v1.0.0",
  generatedAt: "2025-10-05T12:34:56.789Z"
};
```

前端加载资源时会自动拼接：

- JS 文件: `https://cdn.example.com/dashboard/assets/index-abc123.js`
- CSS 文件: `https://cdn.example.com/dashboard/assets/index-def456.css`
- 图片: `https://cdn.example.com/dashboard/assets/logo-789xyz.svg`

#### 回退机制

如果未配置 `DASHBOARD_CDN_BASE`，系统将使用本地路径：

- 默认路径: `http://localhost:3000/dashboard-static/`
- 适合开发环境和小流量场景

#### CDN 可用性检测

服务启动时会主动请求 `${DASHBOARD_CDN_BASE}/index.html`（优先使用 `HEAD`，必要时回退到 `GET`）验证 CDN 是否可达：

- 检测成功：继续向前端注入 CDN 地址，并在日志中输出 `CDN 资源检查通过`
- 检测失败：记录警告并自动改用本地静态目录，避免前端加载失败

#### 自定义构建目录

如果前端构建产物位于自定义位置：

```env
# 指定自定义前端目录
DASHBOARD_DIST_DIR=/var/www/dashboard-dist
```

系统会从该目录加载 `index.html` 并托管静态资源。

#### CDN 缓存策略

系统为不同资源类型设置了缓存头：

| 资源类型 | 缓存策略 | 说明 |
|---------|---------|------|
| 哈希资源 (JS/CSS) | `Cache-Control: public, max-age=31536000, immutable` | 永久缓存（1年） |
| manifest.json | `Cache-Control: no-cache, no-store, must-revalidate` | 禁止缓存 |
| 入口 HTML | 动态生成 | 每次请求重新生成 |

#### 完整 CDN 配置示例

```env
# ====== 前端 CDN 配置 ======

# CDN 地址（阿里云 OSS 示例）
DASHBOARD_CDN_BASE=https://your-bucket.oss-cn-hangzhou.aliyuncs.com/gemini-dashboard

# 资源版本号（用于缓存刷新）
DASHBOARD_ASSETS_VERSION=20251005-001

# 自定义前端目录（可选）
# DASHBOARD_DIST_DIR=/opt/gemini/frontend
```

#### 版本更新流程

当前端代码更新时：

```bash
# 1. 构建新版本
cd dashboard-app
npm run build

# 2. 上传到 CDN（保持文件名中的哈希值）
aws s3 sync ../frontend/ s3://your-bucket/dashboard/ --cache-control "public, max-age=31536000, immutable"

# 3. 更新版本号
export DASHBOARD_ASSETS_VERSION=20251005-002

# 4. 重启服务
cd ../server
npm start
```

Vite 构建会自动为文件名添加哈希值（如 `index-abc123.js`），确保每次更新文件名都会改变，避免缓存问题。

### 数据库表结构

**topics（话题表）**

```sql
CREATE TABLE topics (
  topic_id TEXT PRIMARY KEY,
  ip TEXT NOT NULL,
  hash_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  message_count INTEGER DEFAULT 0,
  inbound_bytes INTEGER DEFAULT 0,
  outbound_bytes INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  historical INTEGER DEFAULT 0,
  topic_hash_no_reasoning TEXT,
  display_name TEXT
);
```

**messages（消息表）**

```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  ip TEXT NOT NULL,
  role TEXT NOT NULL,
  request_url TEXT,
  has_request_headers INTEGER DEFAULT 0,
  has_request_body INTEGER DEFAULT 0,
  meta TEXT,
  created_at INTEGER,
  FOREIGN KEY(topic_id) REFERENCES topics(topic_id) ON DELETE CASCADE
);
```

**message_metadata（消息元数据表）**

```sql
CREATE TABLE message_metadata (
  message_id TEXT PRIMARY KEY,
  request_headers TEXT,
  request_body TEXT,
  error_object TEXT,
  timestamp INTEGER,
  FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
);
```

**alias_keys（别名密钥表）**

```sql
CREATE TABLE alias_keys (
  alias_name TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  first_used_at INTEGER,
  usage_count INTEGER DEFAULT 0
);
```

---

## 📡 API 文档

### 健康检查

```http
GET /health.html
```

返回服务器健康状态页面。

---

### 仪表盘认证

#### 登录

```http
POST /dashboard/api/auth
Content-Type: application/json

{
  "password": "your_password"
}
```

**响应：**

```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "aDashkey": "your_password"
}
```

#### 验证令牌

```http
POST /dashboard/api/verify
Authorization: Bearer <token>
```

**响应：**

```json
{
  "valid": true,
  "aDashkey": "your_password"
}
```

---

### 统计数据

#### 轻量级统计

```http
GET /dashboard/api/lightStats
Authorization: Bearer <token>
```

**响应：**

```json
{
  "totReqs": 1234,
  "totInTfc": 5678,
  "totOutTfc": 12345,
  "ts": "2025-10-05T12:34:56.789Z",
  "sTime": 1728123456789,
  "lGMsgAt": 1728124000000
}
```

#### 完整统计

```http
GET /dashboard/api/fullStats
Authorization: Bearer <token>
```

**响应：** 包含所有 IP 的详细统计。

#### 增量更新

```http
GET /dashboard/api/globalDelta?since=1728123456789
Authorization: Bearer <token>
```

---

### 话题与消息

#### 获取话题列表

```http
GET /dashboard/api/topics?ip=1.2.3.4
Authorization: Bearer <token>
```

#### 获取话题消息

```http
GET /dashboard/api/topicMessages?topicId=abc123
Authorization: Bearer <token>
```

#### 获取消息详情

```http
GET /dashboard/api/message?id=msg-123
Authorization: Bearer <token>
```

#### 懒加载请求体

```http
GET /dashboard/api/requestBody?id=msg-123
Authorization: Bearer <token>
```

#### 懒加载错误详情

```http
GET /dashboard/api/modelError?id=msg-456
Authorization: Bearer <token>
```

**响应：**

```json
{
  "messageId": "msg-456",
  "hasError": true,
  "error": {
    "code": 400,
    "message": "Invalid request",
    "status": "INVALID_ARGUMENT"
  }
}
```

---

### 安全管理

#### 获取封禁 IP 列表

```http
GET /dashboard/api/blockedIPs
Authorization: Bearer <token>
```

#### 封禁 IP

```http
POST /dashboard/api/banIP
Authorization: Bearer <token>
Content-Type: application/json

{
  "ip": "1.2.3.4",
  "durationMs": 604800000,
  "reason": "abuse"
}
```

#### 解封 IP

```http
POST /dashboard/api/unbanIP
Authorization: Bearer <token>
Content-Type: application/json

{
  "ip": "1.2.3.4"
}
```

---

### 别名管理

#### 获取别名列表

```http
GET /dashboard/api/aliasKeys
Authorization: Bearer <token>
```

#### 删除别名

```http
POST /dashboard/api/deleteAliasKey
Authorization: Bearer <token>
Content-Type: application/json

{
  "aliasName": "Alice"
}
```

---

### Gemini API 代理

#### 代理请求

```http
POST /v1beta/models/gemini-2.0-flash:generateContent
Content-Type: application/json

{
  "contents": [
    {
      "role": "user",
      "parts": [{ "text": "Hello" }]
    }
  ]
}
```

所有 Gemini API 路径将被代理到 Google 服务器。

---

## 🛠️ 开发指南

### 本地开发

#### 后端热重载

```bash
cd server
npm install -g nodemon
nodemon server.js
```

#### 前端开发服务器

```bash
cd dashboard-app
npm run dev
```

访问 `http://localhost:5173`（Vite 默认端口）

#### 前端代理配置

`dashboard-app/vite.config.ts` 中已配置代理：

```typescript
server: {
  proxy: {
    '/dashboard/api': 'http://localhost:3000'
  }
}
```

### 构建生产版本

```bash
# 构建前端
cd dashboard-app
npm run build

# 前端产物自动输出到 frontend
# 后端服务自动托管静态文件

# 启动生产服务
cd ../server
npm start
```

### 类型检查

```bash
cd dashboard-app
npm run typecheck
```

### 测试

```bash
cd dashboard-app
npm run test
```

---

## 🐛 常见问题

### Q1: 仪表盘无法访问？

**A:** 检查以下几点：

1. 后端服务是否正常启动（`http://localhost:3000/health.html`）
2. 前端是否已构建（`frontend/index.html` 是否存在）
3. 如果设置了 `DASHBOARD_PASSWORD`，需先登录获取 token

### Q2: IP 别名不显示？

**A:** 确保：

1. 设置了 `DASHBOARD_IP_ALIAS_SECRET` 环境变量
2. 请求头 `namekey` 的值与环境变量一致
3. 请求头 `name` 已正确设置

### Q3: 数据库文件损坏？

**A:** 备份并删除 `server/data/database.db`，服务重启后会自动创建新数据库。

### Q4: 速率限制过于严格？

**A:** 调整环境变量：

```env
RATE_LIMIT_MAX_REQUESTS=50
RATE_LIMIT_WINDOW_MS=60000
```

### Q5: promptTokensDetails 不显示？

**A:** 该功能需要：

1. 后端版本 ≥ 2.0.0
2. Gemini API 返回 `usageMetadata.promptTokensDetails` 字段
3. 前端已更新到最新版本

---

## 📄 License

MIT License

Copyright (c) 2025 tianjinsa

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## 🙏 致谢

- [Google Gemini API](https://ai.google.dev/)
- [Vue.js](https://vuejs.org/)
- [Vite](https://vitejs.dev/)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)

---

## 📮 联系方式

- **项目仓库**: [https://github.com/tianjinsa/gemini-api](https://github.com/tianjinsa/gemini-api)
- **问题反馈**: [GitHub Issues](https://github.com/tianjinsa/gemini-api/issues)

---

**⭐ 如果觉得项目有帮助，欢迎 Star 支持！**
