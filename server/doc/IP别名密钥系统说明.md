# IP别名密钥系统说明

## 功能概述

新的IP别名密钥系统允许用户为每个别名设置独立的密钥。系统的工作原理如下：

1. **首次使用**：当用户首次使用某个别名时，系统会将用户提供的密钥作为该别名的固定密码
2. **后续使用**：之后每次使用该别名时，都需要提供相同的密钥进行验证
3. **密钥存储**：所有别名和对应的密钥哈希值都存储在数据库的独立表中

## 数据库结构

新增了 `ip_alias_keys` 表：

```sql
CREATE TABLE ip_alias_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alias_name TEXT UNIQUE NOT NULL,      -- 别名名称
  key_hash TEXT NOT NULL,               -- 密钥的SHA256哈希值
  created_at INTEGER NOT NULL,          -- 创建时间
  updated_at INTEGER NOT NULL,          -- 最后更新时间
  first_used_at INTEGER NOT NULL,       -- 首次使用时间
  usage_count INTEGER DEFAULT 0         -- 使用次数
);
```

## 使用方法

### 客户端请求头

客户端在发送请求时需要在HTTP头中包含：

```http
name: 你的别名
namekey: 你的密钥
```

### 示例

```bash
# 首次使用别名 "MyBot"，密钥为 "my-secret-key"
curl -X POST "https://your-server/v1/chat/completions" \
  -H "name: MyBot" \
  -H "namekey: my-secret-key" \
  -H "Content-Type: application/json" \
  -d '{...}'

# 后续使用相同别名，必须使用相同密钥
curl -X POST "https://your-server/v1/chat/completions" \
  -H "name: MyBot" \
  -H "namekey: my-secret-key" \  # 必须与首次相同
  -H "Content-Type: application/json" \
  -d '{...}'
```

## Dashboard管理界面

Dashboard中新增了"别名管理"功能：

1. **查看别名列表**：显示所有已注册的别名及其使用统计
2. **删除别名**：删除别名及其密钥，删除后该别名可以重新注册

### 访问方式

1. 进入Dashboard
2. 在IP列表区域点击"别名管理"按钮
3. 在弹出的管理界面中查看和管理所有别名

## 安全特性

1. **密钥哈希存储**：密钥使用SHA256哈希后存储，不会明文保存
2. **唯一性验证**：每个别名只能对应一个密钥
3. **使用统计**：记录每个别名的使用次数和最后使用时间
4. **权限控制**：只有Dashboard管理员可以删除别名

## 日志记录

系统会记录以下事件：

- 创建新别名：`创建新的IP别名密钥`
- 验证成功：`IP别名密钥验证成功`
- 验证失败：`别名密钥验证失败`
- 删除别名：`别名密钥删除成功`

## 兼容性

- 如果不提供 `name` 和 `namekey` 头，系统会正常使用真实IP
- 如果只提供 `name` 而没有 `namekey`，系统会忽略别名设置
- 系统向后兼容，不影响现有的无别名请求

## 故障排除

### 常见问题

1. **密钥验证失败**
   - 检查密钥是否与首次注册时相同
   - 确保没有额外的空格或特殊字符

2. **别名创建失败**
   - 检查别名名称是否已被使用
   - 确保提供了有效的密钥

3. **Dashboard中看不到别名**
   - 确保至少使用过一次该别名
   - 检查Dashboard的JWT token是否有效

### 管理员操作

如需重置某个别名的密钥，管理员可以：

1. 在Dashboard的别名管理界面中删除该别名
2. 用户下次使用时会自动创建新的密钥绑定

## 迁移说明

从旧版本升级到新版本时：

1. 数据库会自动创建 `ip_alias_keys` 表
2. 现有的IP映射不受影响
3. 旧的全局别名密钥（`DASHBOARD_IP_ALIAS_SECRET`）将被忽略
