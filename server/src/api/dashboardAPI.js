/**
 * Dashboard API处理器
 * 提供管理接口功能
 */

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { readRequestBody } = require('../utils/helpers');
const {
  listTopics,
  loadTopic,
  deleteTopics,
  deleteIP,
  loadIndex,
  MessageFiles,
  AttachmentFiles,
  getAllIPMappings,
  deleteIPMapping,
  getAllAliasKeys,
  deleteAliasKey,
  getMessageMetadata
} = require('../storage');
const {
  mapStatsResponse,
  mapIpStats,
  mapTopicsResponse,
  mapTopicMessagesResponse,
  mapMessageDetailResponse,
  mapGlobalDeltaResponse,
  mapAliasKeysResponse
} = require('./responseMapper');

class DashboardAPI {
  constructor(securityManager, messageProcessor) {
    this.securityManager = securityManager;
    this.messageProcessor = messageProcessor;
    this.jwtSecret = process.env.DASHBOARD_JWT_SECRET || 'change_me';
  }

  /**
   * 处理Dashboard API请求
   */
  async handleDashboardAPI(req, res, url) {
    try {
      // token获取接口
      if (url.pathname === '/dashboard/api/token') {
        return this.handleTokenRequest(req, res, url);
      }

      // JWT验证
      if (!this.verifyJWT(req, url)) {
        res.writeHead(401, { 'Content-Type': 'application/json;charset=UTF-8' });
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }

      const routes = {
        GET: {
          '/dashboard/api/lightStats': () => this.handleLightStats(req, res),
          '/dashboard/api/fullStats': () => this.handleFullStats(req, res),
          '/dashboard/api/globalDelta': () => this.handleGlobalDelta(req, res, url),
          '/dashboard/api/iptopics': () => this.handleIPTopics(req, res, url),
          '/dashboard/api/topic': () => this.handleTopic(req, res, url),
          '/dashboard/api/messageRequestBody': () => this.handleMessageRequestBody(req, res, url),
          '/dashboard/api/messageRequestHeaders': () => this.handleMessageRequestHeaders(req, res, url),
          '/dashboard/api/modelError': () => this.handleModelError(req, res, url),
          '/dashboard/api/blockedIPs': () => this.handleBlockedIPs(req, res),
          '/dashboard/api/aliasKeys': () => this.handleAliasKeys(req, res)
        },
        POST: {
          '/dashboard/api/deleteTopics': () => this.handleDeleteTopics(req, res),
          '/dashboard/api/deleteIP': () => this.handleDeleteIP(req, res),
          '/dashboard/api/banIP': () => this.handleBanIP(req, res),
          '/dashboard/api/unbanIP': () => this.handleUnbanIP(req, res),
          '/dashboard/api/deleteAliasKey': () => this.handleDeleteAliasKey(req, res)
        }
      };

      const handler = routes[req.method]?.[url.pathname];
      if (handler) {
        await handler();
        return;
      }

      const allowedMethods = Object.entries(routes)
        .filter(([method, mapping]) => mapping[url.pathname])
        .map(([method]) => method);

      if (allowedMethods.length > 0) {
        res.writeHead(405, { Allow: allowedMethods.join(', ') });
        res.end('Method Not Allowed');
        return;
      }

      res.writeHead(404);
      res.end('not found');

    } catch (error) {
      logger.net.error('Dashboard API错误', { error: error.message });
      res.writeHead(500, { 'Content-Type': 'application/json;charset=UTF-8' });
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
  }

  /**
   * 处理token请求
   */
  handleTokenRequest(req, res, url) {
    const password = url.searchParams.get('pwd') || '';
    const expected = process.env.HEALTH_CHECK_PASSWORD || '';
    
    if (!expected || password !== expected) {
      res.writeHead(401);
      res.end('unauthorized');
      return;
    }

    const token = jwt.sign(
      { sub: 'admin', iat: Math.floor(Date.now() / 1000) },
      this.jwtSecret,
      { expiresIn: '12h' }
    );

    res.writeHead(200, { 'Content-Type': 'application/json;charset=UTF-8' });
    res.end(JSON.stringify({ token, expiresIn: '12h' }));
  }

  /**
   * 验证JWT
   */
  verifyJWT(req, url) {
    let token = (req.headers['x-dashboard-token'] || '').toString();
    if (!token) {
      token = url.searchParams.get('token') || '';
    }

    try {
      jwt.verify(token, this.jwtSecret);
      return true;
    } catch (error) {
      logger.net.warn('Dashboard API JWT验证失败', { error: error.message });
      return false;
    }
  }

  /**
   * 构建IP统计数据
   */
  buildIPStats(stats, index, ipMappings) {
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
      
      // 添加真实IP列表（如果存在映射）
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
      
      // 优化：如果两个时间戳相同，只发送一个字段
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
   * 处理话题列表请求
   */
  handleIPTopics(req, res, url) {
    const ip = url.searchParams.get('ip');
    if (!ip) {
      res.writeHead(400);
      res.end('missing ip');
      return;
    }

    const topics = listTopics(ip);
    const payload = mapTopicsResponse(topics);

    res.writeHead(200, { 'Content-Type': 'application/json;charset=UTF-8' });
    res.end(JSON.stringify(payload));
  }

  /**
   * 处理轻量统计请求
   */
  handleLightStats(req, res) {
    const stats = this.messageProcessor.getStats();
    const startTime = Date.now() - (process.uptime() * 1000);

    const payload = mapStatsResponse(stats, {
      timestamp: new Date().toISOString(),
      startTime,
      lastGlobalMessageAt: stats.lastGlobalMessageAt
    });

    res.writeHead(200, { 'Content-Type': 'application/json;charset=UTF-8' });
    res.end(JSON.stringify(payload));
  }

  /**
   * 处理完整统计请求 - 精简返回结构
   */
  handleFullStats(req, res) {
    const stats = this.messageProcessor.getStats();
    const index = loadIndex().topics || {};
    const ipMappings = getAllIPMappings() || [];
    
    const ipStatsArray = this.buildIPStats(stats, index, ipMappings);

    const startTime = Date.now() - (process.uptime() * 1000);
    const baseStats = mapStatsResponse(stats, {
      timestamp: new Date().toISOString(),
      startTime,
      lastGlobalMessageAt: stats.lastGlobalMessageAt
    });

    res.writeHead(200, { 'Content-Type': 'application/json;charset=UTF-8' });
    res.end(JSON.stringify({
      ...baseStats,
      ipStats: mapIpStats(ipStatsArray)
    }));
  }

  /**
   * 处理全局增量请求
   */
  handleGlobalDelta(req, res, url) {
    const since = parseInt(url.searchParams.get('since') || '0', 10);
    const index = loadIndex().topics || {};
    const stats = this.messageProcessor.getStats();
    const ipMappings = getAllIPMappings() || [];
    
    const changedIPs = [];
    const changedTopics = [];

    for (const ip of Object.keys(index)) {
      const topics = index[ip] || [];
      let ipUpdatedAt = 0;
      
      for (const topic of topics) {
        if (topic.status !== 'completed') continue;
        const ts = topic.updatedAt || topic.createdAt || 0;
        if (ts > ipUpdatedAt) ipUpdatedAt = ts;
      }
      
      if (ipUpdatedAt <= since) continue;

      const ipData = {
        ip,
        ipUpdatedAt,
        requests: stats.requestsPerIP.get(ip) || 0,
        incomingTraffic: stats.incomingTrafficPerIP.get(ip) || 0,
        outgoingTraffic: stats.outgoingTrafficPerIP.get(ip) || 0
      };
      
      // 添加真实IP列表（如果存在映射）
      const realIPs = [];
      if (Array.isArray(ipMappings)) {
        ipMappings.forEach(mapping => {
          if (mapping.display_ip === ip) {
            realIPs.push(mapping.real_ip);
          }
        });
      }
      if (realIPs.length > 0) {
        ipData.realIPs = realIPs;
      }
      
      changedIPs.push(ipData);

      topics.forEach(topic => {
        if (topic.status !== 'completed') return;
        const ts = topic.updatedAt || topic.createdAt || 0;
        if (ts > since) {
          changedTopics.push({
            ip,
            topicId: topic.topicId,
            updatedAt: topic.updatedAt,
            createdAt: topic.createdAt,
            messageCount: topic.messageCount,
            inboundBytes: topic.inboundBytes || 0,
            outboundBytes: topic.outboundBytes || 0,
            displayName: topic.displayName || null
          });
        }
      });
    }

    const payload = mapGlobalDeltaResponse({
      since,
      lastGlobalMessageAt: stats.lastGlobalMessageAt,
      changedIPs,
      changedTopics
    });

    res.writeHead(200, { 'Content-Type': 'application/json;charset=UTF-8' });
    res.end(JSON.stringify(payload));
  }

  /**
   * 处理话题最后更新时间请求
   */
  /**
   * 处理话题请求
   */
  handleTopic(req, res, url) {
    const ip = url.searchParams.get('ip');
    const topicId = url.searchParams.get('tid');
    const start = parseInt(url.searchParams.get('start') || '0', 10);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    
    if (!ip || !topicId) {
      res.writeHead(400);
      res.end('missing params');
      return;
    }

    const topic = loadTopic(ip, topicId);
    if (!topic) {
      logger.warn('Dashboard handleTopic: 话题加载失败', { ip, topicId });
      res.writeHead(404);
      res.end('topic not found');
      return;
    }

    logger.info('Dashboard handleTopic: 话题加载成功', { ip, topicId, messageCount: topic.messages.length });

    const slice = topic.messages.slice(start, start + limit);
    logger.info('Dashboard handleTopic: 返回消息切片', { start, limit, sliceCount: slice.length });

    const payload = mapTopicMessagesResponse({
      topicId: topic.topicId,
      ip,
      messages: slice,
      total: topic.messages.length,
      topicHashNoReasoning: topic.topicHashNoReasoning
    });

    res.writeHead(200, { 'Content-Type': 'application/json;charset=UTF-8' });
    res.end(JSON.stringify(payload));
  }

  /**
   * 根据消息ID定位上下文
   */
  findMessageContext(messageId) {
    const index = loadIndex().topics || {};
    for (const [ip, topics] of Object.entries(index)) {
      for (const topicMeta of topics) {
        const topic = loadTopic(ip, topicMeta.topicId);
        if (!topic) continue;
        const message = topic.messages.find(msg => msg.id === messageId);
        if (message) {
          return { ip, topic, message };
        }
      }
    }
    return null;
  }

  /**
   * 构建消息响应所需的核心数据
   */
  buildMessagePayload(messageId) {
    const context = this.findMessageContext(messageId);
    if (!context) {
      return null;
    }

    let text = MessageFiles.readMessageText(messageId);
    let contentSource = 'file';
    if (!text && context.message.meta && context.message.meta.inlineContent) {
      text = context.message.meta.inlineContent;
      contentSource = 'inline';
    }
    if (text === null || typeof text === 'undefined') {
      text = null;
      contentSource = 'missing';
    }

    const reasoning = MessageFiles.readMessageReasoning(messageId) || null;
    const attachments = Array.isArray(context.message.attachments) ? context.message.attachments : [];

    return {
      context,
  text,
  contentSource,
  hasText: text !== null,
      reasoning,
      attachments
    };
  }

  getMessageRequestRecord(messageId) {
    const storage = require('../storage');
    const db = storage.db;

    let searchMessageId = messageId;
    if (messageId.includes('-h')) {
      const baseId = messageId.split('-h')[0];
      searchMessageId = `${baseId}-u`;
    }
    const baseIdValue = searchMessageId.replace(/-(u|m)$/, '');

    const messageRow = db.prepare(`
      SELECT request_body, request_headers, request_url, created_at
      FROM messages
      WHERE message_id = ?
    `).get(searchMessageId);

    return { messageRow, baseIdValue, searchMessageId };
  }

  handleMessageRequestBody(req, res, url) {
    const id = url.searchParams.get('id');
    if (!id) {
      res.writeHead(400);
      res.end('missing id');
      return;
    }

    try {
      const { messageRow, baseIdValue, searchMessageId } = this.getMessageRequestRecord(id);

      if (messageRow && messageRow.request_body) {
        let parsed = null;
        let rawFallback = null;
        try {
          parsed = JSON.parse(messageRow.request_body);
        } catch (parseError) {
          rawFallback = messageRow.request_body;
        }

        res.writeHead(200, { 'Content-Type': 'application/json;charset=UTF-8' });
        res.end(JSON.stringify({
          messageId: id,
          requestBody: parsed,
          rawRequestBody: rawFallback,
          ts: messageRow.created_at ? new Date(messageRow.created_at).toISOString() : null,
          source: 'messages.request_body',
          baseId: baseIdValue || null,
          requestUrl: messageRow.request_url || null
        }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json;charset=UTF-8' });
      res.end(JSON.stringify({
        error: 'Request body not found',
        messageId: id,
        searchedMessageId: searchMessageId
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json;charset=UTF-8' });
      res.end(JSON.stringify({
        error: 'Failed to retrieve request body',
        details: error.message,
        messageId: id
      }));
    }
  }

  handleMessageRequestHeaders(req, res, url) {
    const id = url.searchParams.get('id');
    if (!id) {
      res.writeHead(400);
      res.end('missing id');
      return;
    }

    try {
      const { messageRow, baseIdValue, searchMessageId } = this.getMessageRequestRecord(id);

      if (messageRow && messageRow.request_headers) {
        let headers = null;
        let rawFallback = null;
        try {
          headers = JSON.parse(messageRow.request_headers);
        } catch (parseError) {
          rawFallback = messageRow.request_headers;
        }

        res.writeHead(200, { 'Content-Type': 'application/json;charset=UTF-8' });
        res.end(JSON.stringify({
          messageId: id,
          requestHeaders: headers,
          rawRequestHeaders: rawFallback,
          ts: messageRow.created_at ? new Date(messageRow.created_at).toISOString() : null,
          source: 'messages.request_headers',
          baseId: baseIdValue || null,
          requestUrl: messageRow.request_url || null
        }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json;charset=UTF-8' });
      res.end(JSON.stringify({
        error: 'Request headers not found',
        messageId: id,
        searchedMessageId: searchMessageId
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json;charset=UTF-8' });
      res.end(JSON.stringify({
        error: 'Failed to retrieve request headers',
        details: error.message,
        messageId: id
      }));
    }
  }

  handleModelError(req, res, url) {
    const id = url.searchParams.get('id');
    if (!id) {
      res.writeHead(400);
      res.end('missing id');
      return;
    }

    try {
      const metadata = getMessageMetadata(id);
      if (!metadata) {
        res.writeHead(404, { 'Content-Type': 'application/json;charset=UTF-8' });
        res.end(JSON.stringify({
          messageId: id,
          hasError: false,
          error: null
        }));
        return;
      }

      const errorPayload = metadata && typeof metadata === 'object' ? metadata.error ?? null : null;

      res.writeHead(200, { 'Content-Type': 'application/json;charset=UTF-8' });
      res.end(JSON.stringify({
        messageId: id,
        hasError: !!errorPayload,
        error: errorPayload ?? null
      }));
    } catch (error) {
      logger.error('获取模型错误详情失败', { messageId: id, error: error.message });
      res.writeHead(500, { 'Content-Type': 'application/json;charset=UTF-8' });
      res.end(JSON.stringify({ error: 'Failed to load model error details', messageId: id }));
    }
  }

  /**
   * 处理删除话题请求
   */
  async handleDeleteTopics(req, res) {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method Not Allowed');
      return;
    }

    const body = await readRequestBody(req);
    const { ip, topicIds } = body || {};
    
    if (!ip || !Array.isArray(topicIds)) {
      res.writeHead(400);
      res.end('bad body');
      return;
    }

    // 删除话题
    const success = deleteTopics(ip, topicIds);
    
    // 检查是否删除了该IP的所有话题，如果是则删除IP映射
    if (success) {
      const remainingTopics = listTopics(ip);
      if (!remainingTopics || remainingTopics.length === 0) {
        // 如果该IP没有剩余话题，删除IP映射并清理统计缓存
        deleteIPMapping(ip);
        if (this.messageProcessor && typeof this.messageProcessor.clearIPStats === 'function') {
          this.messageProcessor.clearIPStats(ip);
        }
        logger.info('删除IP映射', { ip, reason: '所有话题已删除' });
      }
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json;charset=UTF-8' });
    res.end(JSON.stringify({ ok: success }));
  }

  /**
   * 处理删除整个IP数据的请求
   */
  async handleDeleteIP(req, res) {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method Not Allowed');
      return;
    }

    const body = await readRequestBody(req);
    const { ip } = body || {};

    if (!ip) {
      res.writeHead(400, { 'Content-Type': 'application/json;charset=UTF-8' });
      res.end(JSON.stringify({ error: 'missing ip' }));
      return;
    }

    const success = deleteIP(ip);
    if (success) {
      if (this.messageProcessor && typeof this.messageProcessor.clearIPStats === 'function') {
        this.messageProcessor.clearIPStats(ip);
      }
      logger.info('删除IP所有数据成功', { ip });
    } else {
      logger.warn('删除IP所有数据失败', { ip });
    }

    res.writeHead(200, { 'Content-Type': 'application/json;charset=UTF-8' });
    res.end(JSON.stringify({ ok: success }));
  }

  /**
   * 处理封禁IP请求
   */
  async handleBanIP(req, res) {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method Not Allowed');
      return;
    }

    const body = await readRequestBody(req);
    const { ip, durationMs, reason } = body || {};
    
    if (!ip) {
      res.writeHead(400);
      res.end('missing ip');
      return;
    }

    const duration = Math.min(
      Math.max(parseInt(durationMs || 7 * 24 * 3600 * 1000, 10) || 7 * 24 * 3600 * 1000, 60000),
      30 * 24 * 3600 * 1000
    );

    const result = this.securityManager.blockIP(ip, reason || 'manual', duration);
    res.writeHead(200, { 'Content-Type': 'application/json;charset=UTF-8' });
    res.end(JSON.stringify({ ok: true, unblockAt: result.unblockAt }));
  }

  /**
   * 处理解封IP请求
   */
  async handleUnbanIP(req, res) {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method Not Allowed');
      return;
    }

    const body = await readRequestBody(req);
    const { ip } = body || {};
    
    if (!ip) {
      res.writeHead(400);
      res.end('missing ip');
      return;
    }

    const success = this.securityManager.unblockIP(ip);
    res.writeHead(200, { 'Content-Type': 'application/json;charset=UTF-8' });
    res.end(JSON.stringify({ ok: success }));
  }

  /**
   * 处理获取封禁IP列表请求
   */
  handleBlockedIPs(req, res) {
    const blocked = this.securityManager.getBlockedIPs();
    const now = Date.now();
    
    res.writeHead(200, { 'Content-Type': 'application/json;charset=UTF-8' });
    res.end(JSON.stringify({ blocked, now }));
  }

  /**
   * 处理获取别名密钥列表请求
   */
  handleAliasKeys(req, res) {
    const aliasKeys = getAllAliasKeys();
    const payload = mapAliasKeysResponse(aliasKeys);

    res.writeHead(200, { 'Content-Type': 'application/json;charset=UTF-8' });
    res.end(JSON.stringify(payload));
  }

  /**
   * 处理删除别名密钥请求
   */
  async handleDeleteAliasKey(req, res) {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method Not Allowed');
      return;
    }

    const body = await readRequestBody(req);
    const { aliasName } = body || {};
    
    if (!aliasName) {
      res.writeHead(400);
      res.end('missing aliasName');
      return;
    }

    const success = deleteAliasKey(aliasName);
    res.writeHead(200, { 'Content-Type': 'application/json;charset=UTF-8' });
    res.end(JSON.stringify({ ok: success }));
  }
}

module.exports = DashboardAPI;
