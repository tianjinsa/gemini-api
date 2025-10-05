/**
 * Gemini API代理服务器 - 主入口
 * 重构后的模块化架构
 */

const http = require('http');
const logger = require('./src/utils/logger');
const { getClientIP } = require('./src/utils/helpers');
const SecurityManager = require('./src/security');
const MessageProcessor = require('./src/proxy/messageProcessor');
const GeminiProxyHandler = require('./src/proxy/geminiProxy');
const DashboardAPI = require('./src/api/dashboardAPI');
const DashboardHandler = require('./src/api/dashboardHandler');

class GeminiProxyServer {
  constructor() {
    this.port = process.env.PORT || 3000;
    this.dataDir = './data';
    
    // 初始化核心组件
    this.securityManager = new SecurityManager({
      dataDir: this.dataDir,
      rateLimit: {
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10', 10),
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10)
      },
      firewallThreshold: parseInt(process.env.FIREWALL_BLOCK_THRESHOLD || '20', 10),
      firewallWindowMs: parseInt(process.env.FIREWALL_BLOCK_WINDOW_MS || '300000', 10)
    });

    this.messageProcessor = new MessageProcessor(this.dataDir);
    this.proxyHandler = new GeminiProxyHandler(this.messageProcessor);
    this.dashboardAPI = new DashboardAPI(this.securityManager, this.messageProcessor);
    this.dashboardHandler = new DashboardHandler(this.messageProcessor);

    this.setupErrorHandlers();
  }

  /**
   * 设置错误处理器
   */
  setupErrorHandlers() {
    process.on('uncaughtException', (error) => {
      logger.error('未捕获的异常', {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        }
      });
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('未处理的Promise拒绝', {
        error: reason instanceof Error ? {
          name: reason.name,
          message: reason.message,
          stack: reason.stack
        } : reason
      });
    });
  }

  /**
   * 主请求处理器
   */
  async handleRequest(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const clientIP = getClientIP(req);
      const isLightStats = url.pathname === '/dashboard/api/lightStats';

      // 跳过轻量统计的日志记录，避免噪声
      if (!isLightStats) {
        const customName = req.headers['name'];
        const namekey = req.headers['namekey'];
        const expectedPassword = process.env.DASHBOARD_IP_ALIAS_SECRET;
        const displayInfo = (customName && namekey && expectedPassword && namekey === expectedPassword)
          ? `${customName} (${clientIP})`
          : clientIP;
        
        logger.net.info('收到请求', {
          IP: displayInfo,
          path: url.pathname + url.search,
          KB: ((req.headers['content-length'] || 0) / 1024).toFixed(3)
        });
      }

      // 1. 健康检查
      if (this.dashboardHandler.handleHealthCheck(req, res, url)) {
        return;
      }

      // 2. Dashboard页面
      if (this.dashboardHandler.handleDashboardStatic(req, res, url)) {
        return;
      }

      if (await this.dashboardHandler.handleDashboard(req, res, url)) {
        return;
      }

      // 4. Dashboard API
      if (url.pathname.startsWith('/dashboard/api/')) {
        await this.dashboardAPI.handleDashboardAPI(req, res, url);
        return;
      }

      // 5. 忽略favicon请求
      if (url.pathname === '/favicon.ico') {
        req.socket.destroy();
        return;
      }

      // 6. 安全检查
      const securityResult = this.securityManager.checkRequest(clientIP, url.pathname);
      if (!securityResult.allowed) {
        this.handleSecurityReject(res, securityResult, clientIP);
        return;
      }

      // 7. API代理请求
      if (this.isAPIRequest(url.pathname)) {
        await this.proxyHandler.handleAPIRequest(req, res, clientIP);
        return;
      }

      // 8. 无效路径 - 封禁IP
      this.securityManager.handleInvalidPath(clientIP, url.pathname);
      req.socket.destroy();

    } catch (error) {
      logger.error('请求处理程序错误', {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        }
      });

      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json;charset=UTF-8' });
        res.end(JSON.stringify({ error: 'Internal Server Error', status: 500 }));
      }
    }
  }

  /**
   * 处理安全拒绝
   */
  handleSecurityReject(res, securityResult, clientIP) {
    if (securityResult.reason === 'ip_blocked') {
      // IP被封禁，直接关闭连接
      logger.net.warn('阻止被封禁IP的请求', { clientIP });
      res.socket.destroy();
      return;
    }

    if (securityResult.reason === 'rate_limited') {
      const retryAfter = securityResult.retryAfter || 60;
      
      logger.net.warn('超出速率限制', {
        clientIP,
        suspicious: securityResult.suspicious,
        retryAfter
      });

      res.writeHead(429, {
        'Content-Type': 'application/json;charset=UTF-8',
        'Retry-After': retryAfter.toString()
      });
      res.end(JSON.stringify({ error: 'Too Many Requests', status: 429 }));
      return;
    }

    // 其他安全问题
    res.writeHead(403, { 'Content-Type': 'application/json;charset=UTF-8' });
    res.end(JSON.stringify({ error: 'Forbidden', status: 403 }));
  }

  /**
   * 判断是否为API请求
   */
  isAPIRequest(pathname) {
    return pathname.startsWith('/v1beta') || pathname.startsWith('/v1/');
  }

  /**
   * 启动服务器
   */
  start() {
    const server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    server.on('error', (error) => {
      logger.error('服务器错误', { error });
    });

    server.listen(this.port, () => {
      logger.info(`Gemini代理服务器启动成功`, {
        port: this.port,
        url: `http://localhost:${this.port}`,
        dashboard: `http://localhost:${this.port}/dashboard`,
        health: `http://localhost:${this.port}/health`
      });
    });

    return server;
  }
}

// 启动服务器
if (require.main === module) {
  const server = new GeminiProxyServer();
  server.start();
}

module.exports = GeminiProxyServer;
