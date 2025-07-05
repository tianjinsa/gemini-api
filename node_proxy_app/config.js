// config.js
// 请将下面的占位符替换为您的真实Cloudflare凭据

module.exports = {
  cloudflare: {
    // Cloudflare API 令牌，具有编辑防火墙规则的权限
    // 如何获取: 登录 Cloudflare -> 右上角"我的个人资料" -> "API 令牌" -> "创建令牌" -> 使用 "编辑区域防火墙" 模板
    apiToken: 'YOUR_CLOUDFLARE_API_TOKEN',

    // 您的网站在 Cloudflare 上的区域 ID
    // 如何获取: 登录 Cloudflare -> 选择您的网站 -> 在右侧的 "API" 部分找到 "区域 ID"
    zoneId: 'YOUR_CLOUDFLARE_ZONE_ID'
  },

  // Cloudflare Turnstile 配置
  // 如何获取: 登录 Cloudflare -> 左侧菜单选择 Turnstile -> 添加站点
  turnstile: {
    // Turnstile 站点密钥，这个是公开的，可以放在前端页面
    sitekey: '0x4AAAAAABjC3VU8gZL5Hntl',
    // Turnstile 密钥，这个是私有的，必须保存在后端
    secretKey: '0x4AAAAAABjC3eJ3ZaXyXP9o8fMojdPgRys'
  }
};
