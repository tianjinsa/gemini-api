/**
 * IP封禁管理器
 * 处理IP封禁、解封和持久化存储
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { DataPersistence } = require('../storage');

class IPBlocker {
  constructor(dataDir) {
    this.blockedIPs = new Map(); // ip -> 解封时间戳
    this.blockedIPMeta = new Map(); // ip -> { reason, blockedAt, unblockAt, blockedCount }
    this.BLOCK_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7天
    
    // 启动时加载持久化数据
    this.loadFromDisk();
  }

  /**
   * 检查IP是否被封禁
   */
  isBlocked(ip) {
    const unblockTime = this.blockedIPs.get(ip);
    if (!unblockTime) return false;
    
    if (Date.now() >= unblockTime) {
      // 封禁时间已过，自动解封
      this.unblockIP(ip);
      return false;
    }
    
    return true;
  }

  /**
   * 封禁IP
   */
  blockIP(ip, reason = 'manual', durationMs = null) {
    const duration = durationMs || this.BLOCK_DURATION_MS;
    const unblockAt = Date.now() + duration;
    
    this.blockedIPs.set(ip, unblockAt);
    this.blockedIPMeta.set(ip, {
      reason,
      blockedAt: Date.now(),
      unblockAt,
      blockedCount: 0
    });
    
    this.saveToDisk();
    
    logger.warn('IP已被封禁', {
      ip,
      reason,
      durationMs: duration,
      unblockAt: new Date(unblockAt).toISOString()
    });
    
    return { unblockAt, reason };
  }

  /**
   * 解封IP
   */
  unblockIP(ip) {
    const wasBlocked = this.blockedIPs.has(ip);
    this.blockedIPs.delete(ip);
    this.blockedIPMeta.delete(ip);
    
    if (wasBlocked) {
      this.saveToDisk();
      logger.info('IP已解封', { ip });
    }
    
    return wasBlocked;
  }

  /**
   * 记录被封禁IP的访问尝试
   */
  recordBlockedAttempt(ip) {
    const meta = this.blockedIPMeta.get(ip);
    if (meta) {
      meta.blockedCount = (meta.blockedCount || 0) + 1;
      this.saveToDisk();
    }
  }

  /**
   * 获取所有被封禁的IP列表
   */
  getBlockedIPs() {
    const now = Date.now();
    const result = [];
    
    for (const [ip, unblockAt] of this.blockedIPs.entries()) {
      const meta = this.blockedIPMeta.get(ip) || {};
      result.push({
        ip,
        reason: meta.reason || 'unknown',
        blockedAt: meta.blockedAt || null,
        unblockAt,
        remainingMs: unblockAt - now,
        blockedCount: meta.blockedCount || 0
      });
    }
    
    return result;
  }

  /**
   * 从磁盘加载封禁数据
   */
  loadFromDisk() {
    try {
      const raw = DataPersistence.loadData('blocked_ips.json');
      if (raw && Array.isArray(raw.list)) {
        const now = Date.now();
        raw.list.forEach(entry => {
          if (!entry || !entry.ip) return;
          
          // 跳过已过期的封禁
          if (entry.unblockAt && entry.unblockAt < now) return;
          
          this.blockedIPs.set(entry.ip, entry.unblockAt || (now + this.BLOCK_DURATION_MS));
          this.blockedIPMeta.set(entry.ip, {
            reason: entry.reason || 'unknown',
            blockedAt: entry.blockedAt || now,
            unblockAt: entry.unblockAt || this.blockedIPs.get(entry.ip),
            blockedCount: entry.blockedCount || 0
          });
        });
      }
    } catch (error) {
      logger.warn('加载封禁IP持久化文件失败', { error: error.message });
    }
  }

  /**
   * 保存封禁数据到磁盘
   */
  saveToDisk() {
    try {
      const list = Array.from(this.blockedIPs.keys()).map(ip => {
        const meta = this.blockedIPMeta.get(ip) || {};
        return {
          ip,
          reason: meta.reason || 'unknown',
          blockedAt: meta.blockedAt || Date.now(),
          unblockAt: meta.unblockAt || this.blockedIPs.get(ip),
          blockedCount: meta.blockedCount || 0
        };
      });
      
      const data = { 
        updatedAt: Date.now(), 
        list 
      };
      
      DataPersistence.saveData('blocked_ips.json', data);
    } catch (error) {
      logger.warn('保存封禁IP持久化文件失败', { error: error.message });
    }
  }
}

module.exports = IPBlocker;
