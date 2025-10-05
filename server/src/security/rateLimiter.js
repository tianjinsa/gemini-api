/**
 * 限流器
 * 实现基于时间窗口的请求限流
 */

const logger = require('../utils/logger');

class RateLimiter {
  constructor(maxRequests = 20, windowMs = 60000) {
    this.requests = new Map();
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.suspiciousIPs = new Map();
  }

  /**
   * 检查是否允许请求
   */
  isAllowed(clientId) {
    const now = Date.now();
    const requests = this.requests.get(clientId) || [];
    
    // 过滤有效的请求（在时间窗口内）
    const validRequests = requests.filter(time => now - time < this.windowMs);
    
    if (validRequests.length >= this.maxRequests) {
      this.requests.set(clientId, validRequests);
      return false;
    }
    
    validRequests.push(now);
    this.requests.set(clientId, validRequests);
    return true;
  }

  /**
   * 获取剩余请求次数
   */
  getRemainingRequests(clientId) {
    const now = Date.now();
    const requests = this.requests.get(clientId) || [];
    const validRequests = requests.filter(time => now - time < this.windowMs);
    return Math.max(0, this.maxRequests - validRequests.length);
  }
  
    getRetryAfterSeconds(clientId) {
    const now = Date.now();
    const reqs = this.reqs.get(clientId) || [];
    const validRequests = reqs.filter(time => now - time < this.windowMs);
    this.reqs.set(clientId, validRequests);

    if (validRequests.length < this.maxRequests || validRequests.length === 0) {
      return 0;
    }

    const oldestRequest = Math.min(...validRequests);
    const retryAfterMs = this.windowMs - (now - oldestRequest);
    if (retryAfterMs <= 0) {
      return 0;
    }

    return Math.max(1, Math.ceil(retryAfterMs / 1000));
  }

  getWindowSeconds() {
    return Math.max(1, Math.ceil(this.windowMs / 1000));
  }
  
  /**
   * 记录可疑请求
   */
  recordSuspiciousRequest(clientId) {
    const count = (this.suspiciousIPs.get(clientId) || 0) + 1;
    this.suspiciousIPs.set(clientId, count);
    
    if (count >= 3) {
      const requests = this.requests.get(clientId) || [];
      // 增加惩罚性的请求记录
      for (let i = 0; i < 5; i++) {
        requests.push(Date.now());
      }
      this.requests.set(clientId, requests);
      logger.warn('对可疑IP增强限流', { clientId, suspiciousCount: count });
    }
  }
  
  /**
   * 检查是否为可疑IP
   */
  isSuspicious(clientId) {
    return (this.suspiciousIPs.get(clientId) || 0) >= 3;
  }

  /**
   * 清理过期数据
   */
  cleanup() {
    const now = Date.now();
    for (const [clientId, requests] of this.requests.entries()) {
      const validRequests = requests.filter(time => now - time < this.windowMs);
      if (validRequests.length === 0) {
        this.requests.delete(clientId);
      } else {
        this.requests.set(clientId, validRequests);
      }
    }
  }
}

module.exports = RateLimiter;
