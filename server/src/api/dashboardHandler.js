/**
 * Dashboard页面处理器
 * 处理仪表板页面和健康检查
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { loadIndex, getAllIPMappings } = require('../storage');
const { mapStatsResponse, mapIpStats } = require('./responseMapper');

const CDN_PROBE_TIMEOUT_MS = 5000;

function probeUrlAvailability(urlString, method = 'HEAD') {
  return new Promise((resolve, reject) => {
    const client = urlString.startsWith('https') ? https : http;
    const request = client.request(urlString, { method, timeout: CDN_PROBE_TIMEOUT_MS }, (res) => {
      const status = res.statusCode || 0;
      res.resume();

      if (status >= 200 && status < 400) {
        resolve();
        return;
      }

      if (method === 'HEAD' && status === 405) {
        probeUrlAvailability(urlString, 'GET').then(resolve).catch(reject);
        return;
      }

      reject(new Error(`Status code ${status}`));
    });

    request.on('timeout', () => {
      request.destroy(new Error('Request timed out'));
    });

    request.on('error', (error) => {
      reject(error);
    });

    request.end();
  });
}

class DashboardHandler {
  constructor(messageProcessor) {
    this.messageProcessor = messageProcessor;
    this.jwtSecret = process.env.DASHBOARD_JWT_SECRET || 'change_me';
    this.cdnConfiguredBase = (process.env.DASHBOARD_CDN_BASE || '').trim();
    this.cdnResolvedBase = this.cdnConfiguredBase
      ? this.cdnConfiguredBase.replace(/\/+$/, '')
      : '';
    this.dashboardDistDir = this.resolveDashboardDistDir();
    this.verifyCdnAvailability();
  }

  resolveDashboardDistDir() {
    const envOverride = process.env.DASHBOARD_DIST_DIR
      ? path.resolve(process.env.DASHBOARD_DIST_DIR)
      : null;
    const builtInDirs = [
      path.resolve(__dirname, '../../..', 'frontend'),
      path.resolve(__dirname, '../..', 'frontend'),
      path.resolve(__dirname, '../../..', 'dashboard-app', 'dist'),
      path.resolve(__dirname, '../..', 'dashboard-app', 'dist'),
      path.resolve(__dirname, '../..', 'dist')
    ];

    const candidates = [envOverride, ...builtInDirs].filter(Boolean);

    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
          if (envOverride && envOverride === candidate) {
            logger.info('使用自定义Dashboard静态目录', { dir: candidate });
          }
          return candidate;
        }
      } catch (error) {
        logger.warn('检查Dashboard静态目录失败', { candidate, error: error.message });
      }
    }

    const fallback = builtInDirs[0];
    const cdnBase = (process.env.DASHBOARD_CDN_BASE || '').trim();
    if (cdnBase) {
      logger.info('未检测到本地Dashboard静态目录，使用CDN提供资源', { cdnBase, fallback });
    } else {
      logger.warn('未找到可用的Dashboard静态目录，使用默认路径', { fallback });
    }
    return fallback;
  }

  /**
   * 处理健康检查请求
   */
  handleHealthCheck(req, res, url) {
    if (url.pathname === '/health' || url.pathname === '/healthz') {
      logger.info('轻量级健康检查请求');
      res.writeHead(200, { 'Content-Type': 'application/json;charset=UTF-8' });
      res.end(JSON.stringify({
        status: 'OK',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      }));
      return true;
    }
    return false;
  }

  /**
   * 处理Dashboard页面请求
   */
  async handleDashboard(req, res, url) {
    if (url.pathname !== '/dashboard' && url.pathname !== '/dashboard/') {
      return false;
    }

    try {
      // Basic Auth认证
      const password = process.env.HEALTH_CHECK_PASSWORD;
      if (password) {
        if (!this.verifyBasicAuth(req, password)) {
          logger.warn('Dashboard Basic Auth失败');
          res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Restricted Area"' });
          res.end('需要身份认证');
          return true;
        }
      }

      const htmlTemplate = this.loadDashboardTemplate();
      const serverData = this.buildServerData();
      const bootstrapScript = this.buildBootstrapScript(serverData, url);

      const finalHtml = htmlTemplate.replace(
        '//__SERVER_DATA__',
        bootstrapScript
      );

      res.writeHead(200, { 'Content-Type': 'text/html;charset=UTF-8' });
      res.end(finalHtml);
      return true;

    } catch (error) {
      logger.error('无法加载Dashboard', { error: error.message });
      res.writeHead(500, { 'Content-Type': 'application/json;charset=UTF-8' });
      res.end(JSON.stringify({ error: 'Internal Server Error: Cannot read dashboard template.' }));
      return true;
    }
  }

  handleDashboardStatic(req, res, url) {
    if (!url.pathname.startsWith('/dashboard-static/')) {
      return false;
    }

    const relative = url.pathname.replace('/dashboard-static/', '');
    if (!relative) {
      res.writeHead(404, { 'Content-Type': 'application/json;charset=UTF-8' });
      res.end(JSON.stringify({ error: 'Static asset not found' }));
      return true;
    }

    const sanitized = relative.split('?')[0].split('#')[0];
    const candidate = path.join(this.dashboardDistDir, sanitized);

    if (!candidate.startsWith(this.dashboardDistDir)) {
      res.writeHead(403, { 'Content-Type': 'application/json;charset=UTF-8' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return true;
    }

    if (!fs.existsSync(candidate) || fs.statSync(candidate).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'application/json;charset=UTF-8' });
      res.end(JSON.stringify({ error: 'Static asset not found' }));
      return true;
    }

    const ext = path.extname(candidate).toLowerCase();
    const headers = {
      'Content-Type': this.getMimeType(ext)
    };

    // 哈希资源允许长缓存，manifest保持短缓存
    if (ext === '.json' && candidate.endsWith('manifest.json')) {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    } else {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    }

    try {
      const stream = fs.createReadStream(candidate);
      res.writeHead(200, headers);
      stream.pipe(res);
      stream.on('error', (error) => {
        logger.error('读取Dashboard静态资源失败', { file: candidate, error: error.message });
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json;charset=UTF-8' });
        }
        res.end(JSON.stringify({ error: 'Failed to read static asset' }));
      });
    } catch (error) {
      logger.error('发送Dashboard静态资源失败', { file: candidate, error: error.message });
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json;charset=UTF-8' });
      }
      res.end(JSON.stringify({ error: 'Failed to stream static asset' }));
    }

    return true;
  }

  buildBootstrapScript(serverData, url) {
    const cdnEnv = this.cdnResolvedBase || '';
    const origin = `${url.protocol}//${url.host}`;
    const fallbackBase = (process.env.DASHBOARD_DEFAULT_STATIC_BASE || `${origin}/dashboard-static`).trim();
    const resolvedBase = (cdnEnv || fallbackBase).replace(/\/+$/, '');
    const configPayload = {
      cdn: resolvedBase,
      version: process.env.DASHBOARD_ASSETS_VERSION || null,
      generatedAt: new Date().toISOString()
    };

    return [
      `window.OPENLIST_CONFIG = Object.assign({}, window.OPENLIST_CONFIG || {}, ${JSON.stringify(configPayload)});`,
      'if (!window.OPENLIST_CONFIG.cdn) { window.OPENLIST_CONFIG.cdn = ""; }',
      'window.__dynamic_base__ = window.OPENLIST_CONFIG.cdn || "";',
      `window.__DASHBOARD_INIT__ = ${JSON.stringify(serverData)};`
    ].join('\n');
  }

  verifyCdnAvailability() {
    if (!this.cdnConfiguredBase) {
      return;
    }

    if (!/^https?:\/\//i.test(this.cdnConfiguredBase)) {
      logger.warn('DASHBOARD_CDN_BASE 不是有效的 HTTP/HTTPS 地址，已忽略 CDN 可用性检测', {
        cdnBase: this.cdnConfiguredBase
      });
      return;
    }

    const normalizedBase = this.cdnConfiguredBase.replace(/\/+$/, '');
    let indexUrl;
    try {
      indexUrl = new URL('index.html', `${normalizedBase}/`).toString();
    } catch (error) {
      logger.warn('解析 CDN 地址失败，已跳过可用性检测', {
        cdnBase: this.cdnConfiguredBase,
        error: error.message
      });
      return;
    }

    probeUrlAvailability(indexUrl)
      .then(() => {
        this.cdnResolvedBase = normalizedBase;
        logger.info('CDN 资源检查通过', { indexUrl });
      })
      .catch((error) => {
        this.cdnResolvedBase = '';
        logger.warn('CDN 资源检查失败，将继续使用本地回退路径', {
          indexUrl,
          error: error.message
        });
      });
  }

  getMimeType(ext) {
    switch (ext) {
      case '.js':
      case '.mjs':
        return 'application/javascript;charset=UTF-8';
      case '.css':
        return 'text/css;charset=UTF-8';
      case '.json':
        return 'application/json;charset=UTF-8';
      case '.svg':
        return 'image/svg+xml';
      case '.png':
        return 'image/png';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.webp':
        return 'image/webp';
      case '.map':
        return 'application/json;charset=UTF-8';
      default:
        return 'application/octet-stream';
    }
  }

  /**
   * 验证Basic Auth
   */
  verifyBasicAuth(req, expectedPassword) {
    const auth = { login: 'admin', password: expectedPassword };
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    
    return login === auth.login && password === auth.password;
  }

  /**
   * 加载Dashboard模板
   */
  loadDashboardTemplate() {
    const templatePath = path.join(__dirname, '../..', 'health.html');
    
    try {
      // 直接使用fs读取真实文件，因为这不是数据库中的虚拟文件
      if (!fs.existsSync(templatePath)) {
        throw new Error(`模板文件不存在: ${templatePath}`);
      }
      const content = fs.readFileSync(templatePath, 'utf8');
      if (!content) {
        throw new Error('模板文件内容为空');
      }
      return content;
    } catch (error) {
      logger.error('读取Dashboard模板文件失败', { templatePath, error: error.message });
      throw new Error('无法读取Dashboard模板文件');
    }
  }

  /**
   * 构建IP统计数据（复用 dashboardAPI 的逻辑）
   */
  buildIPStatsArray(stats, index, ipMappings) {
    const ipSet = new Set([...stats.requestsPerIP.keys(), ...Object.keys(index)]);
    
    return Array.from(ipSet.values()).map(ip => {
      let lastTopicUpdatedAt = null;
      const topics = index[ip] || [];
      
      for (const meta of topics) {
        if (meta && meta.updatedAt && meta.status === 'completed') {
          if (!lastTopicUpdatedAt || meta.updatedAt > lastTopicUpdatedAt) {
            lastTopicUpdatedAt = meta.updatedAt;
          }
        }
      }

      const lastModelRequestAt = stats.lastModelRequestAt.get(ip) || null;
      
      const result = {
        ip,
        requests: stats.requestsPerIP.get(ip) || 0,
        incomingTraffic: stats.incomingTrafficPerIP.get(ip) || 0,
        outgoingTraffic: stats.outgoingTrafficPerIP.get(ip) || 0
      };
      
      // 添加真实IP列表
      const realIPs = [];
      if (Array.isArray(ipMappings)) {
        ipMappings.forEach(mapping => {
          if (mapping.display_ip === ip) {
            realIPs.push(mapping.real_ip);
          }
        });
      }
      if (realIPs.length > 0) {
        result.realIPs = realIPs;
      }
      
      // 优化时间戳字段
      if (lastTopicUpdatedAt && lastModelRequestAt && lastTopicUpdatedAt === lastModelRequestAt) {
        result.lastTopicUpdatedAt = lastTopicUpdatedAt;
      } else {
        if (lastModelRequestAt) result.lastModelRequestAt = lastModelRequestAt;
        if (lastTopicUpdatedAt) result.lastTopicUpdatedAt = lastTopicUpdatedAt;
      }
      
      return result;
    });
  }

  /**
   * 构建服务器数据 - 精简版，只包含dashboard初次加载必需的数据
   */
  buildServerData() {
    const stats = this.messageProcessor.getStats();
    const index = loadIndex().topics || {};
    const ipMappings = getAllIPMappings() || [];
    
    // 使用公共方法构建IP统计
    const ipStatsArray = this.buildIPStatsArray(stats, index, ipMappings);

    // 生成自动Dashboard token
    let autoDashboardToken = null;
    try {
      autoDashboardToken = jwt.sign(
        { sub: 'admin', iat: Math.floor(Date.now() / 1000) },
        this.jwtSecret,
        { expiresIn: '2h' }
      );
    } catch {
      autoDashboardToken = null;
    }

    const startTime = Date.now() - (process.uptime() * 1000);
    const baseStats = mapStatsResponse(stats, {
      timestamp: new Date().toISOString(),
      startTime,
      lastGlobalMessageAt: stats.lastGlobalMessageAt
    });

    return {
      ...baseStats,
      ipStats: mapIpStats(ipStatsArray),
      aDashkey: autoDashboardToken
      // 移除了 requestLogsByIP 和 persistentIndex，这两个数据量大但dashboard不使用
    };
  }
}

module.exports = DashboardHandler;
