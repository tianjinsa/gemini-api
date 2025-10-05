/**
 * 安全管理器
 * 整合限流、IP封禁等安全功能
 */

const RateLimiter = require('./rateLimiter');
const IPBlocker = require('./ipBlocker');
const logger = require('../utils/logger');

class SecurityManager {
  constructor(options = {}) {
    // 限流配置
    const rateLimitConfig = options.rateLimit || {};
    this.rateLimiter = new RateLimiter(
      rateLimitConfig.maxRequests || 10,
      rateLimitConfig.windowMs || 60000
    );

    // IP封禁配置
    this.ipBlocker = new IPBlocker(options.dataDir || './data');
    
    // 防火墙配置
    this.blockedIPAttempts = new Map();
    this.FIREWALL_BLOCK_THRESHOLD = options.firewallThreshold || 20;
    this.FIREWALL_BLOCK_WINDOW_MS = options.firewallWindowMs || 5 * 60 * 1000;

    // 定期清理过期数据
    setInterval(() => {
      this.rateLimiter.cleanup();
      this.cleanupFirewallAttempts();
    }, 5 * 60 * 1000); // 每5分钟清理一次
  }

  /**
   * 检查请求是否被允许
   */
  checkRequest(clientIP, path) {
    // 1. 检查IP是否被封禁
    if (this.ipBlocker.isBlocked(clientIP)) {
      this.ipBlocker.recordBlockedAttempt(clientIP);
      this.recordFirewallAttempt(clientIP);
      return { allowed: false, reason: 'ip_blocked' };
    }

    // 2. 检查限流
    if (!this.rateLimiter.isAllowed(clientIP)) {
      this.rateLimiter.recordSuspiciousRequest(clientIP);
      const isSuspicious = this.rateLimiter.isSuspicious(clientIP);
      const retryAfterSeconds = this.rateLimiter.getRetryAfterSeconds(clientIP);
      const retryAfter = isSuspicious ? 300 : (retryAfterSeconds || this.rateLimiter.getWindowSeconds());
      
      return {
        allowed: false,
        reason: 'rate_limited',
        retryAfter,
        suspicious: isSuspicious
      };
    }

    return { allowed: true };
  }

  /**
   * 处理无效路径访问
   */
  handleInvalidPath(clientIP, path) {
    logger.warn('无效路径访问，封禁IP', { IP: clientIP, path });
    this.ipBlocker.blockIP(clientIP, 'invalid_path');
  }

  /**
   * 记录防火墙级别的攻击尝试
   */
  recordFirewallAttempt(clientIP) {
    const now = Date.now();
    const attempts = this.blockedIPAttempts.get(clientIP) || [];
    const validAttempts = attempts.filter(time => now - time < this.FIREWALL_BLOCK_WINDOW_MS);
    validAttempts.push(now);
    this.blockedIPAttempts.set(clientIP, validAttempts);

    if (validAttempts.length >= this.FIREWALL_BLOCK_THRESHOLD) {
      logger.warn('检测到持续攻击，建议使用fail2ban等工具自动封禁IP', { clientIP });
      // 清除记录，防止重复报告
      this.blockedIPAttempts.delete(clientIP);
    }
  }

  /**
   * 清理过期的防火墙尝试记录
   */
  cleanupFirewallAttempts() {
    const now = Date.now();
    for (const [clientIP, attempts] of this.blockedIPAttempts.entries()) {
      const validAttempts = attempts.filter(time => now - time < this.FIREWALL_BLOCK_WINDOW_MS);
      if (validAttempts.length === 0) {
        this.blockedIPAttempts.delete(clientIP);
      } else {
        this.blockedIPAttempts.set(clientIP, validAttempts);
      }
    }
  }

  /**
   * 获取封禁的IP列表
   */
  getBlockedIPs() {
    return this.ipBlocker.getBlockedIPs();
  }

  /**
   * 手动封禁IP
   */
  blockIP(ip, reason, durationMs) {
    return this.ipBlocker.blockIP(ip, reason, durationMs);
  }

  /**
   * 解封IP
   */
  unblockIP(ip) {
    this.blockedIPAttempts.delete(ip);
    return this.ipBlocker.unblockIP(ip);
  }
}

module.exports = SecurityManager;
