// 基于better-sqlite3的统一存储管理模块
// 将所有数据存储在SQLite数据库中，包括消息内容、附件、原始请求JSON等

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const logger = require('./utils/logger');

let Database = null;
const betterSqliteState = { attemptedRebuild: false };

function loadBetterSqlite3(){
  try {
    return require('better-sqlite3');
  } catch (error) {
    const message = error?.message || '';
    const bindingIssue = message.includes('Could not locate the bindings file');
    const napiMismatch = message.includes('was compiled against a different Node.js version') || message.includes('was compiled for');
    const moduleMissing = error.code === 'MODULE_NOT_FOUND';
    const moduleInstalled = fs.existsSync(path.join(__dirname, '..', 'node_modules', 'better-sqlite3'));
    if (moduleMissing && !moduleInstalled) {
      const installCommand = `${process.platform === 'win32' ? 'npm.cmd' : 'npm'} install`;
      const installError = new Error(`未检测到 better-sqlite3 依赖，请先在项目根目录执行：${installCommand}`);
      installError.cause = error;
      throw installError;
    }
    if (!betterSqliteState.attemptedRebuild && (bindingIssue || napiMismatch || (moduleMissing && moduleInstalled))) {
      betterSqliteState.attemptedRebuild = true;
      logger.warn('better-sqlite3 原生模块缺失，尝试自动重建', { message }, '数据库');
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const rebuild = spawnSync(npmCmd, ['rebuild', 'better-sqlite3', '--build-from-source'], {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
        env: process.env
      });
      if (rebuild.status === 0) {
        logger.info('better-sqlite3 自动重建完成，重新加载模块', {}, '数据库');
        return require('better-sqlite3');
      }
      logger.error('better-sqlite3 自动重建失败', { status: rebuild.status, error: rebuild.error?.message }, '数据库');
      const manualCommand = `${npmCmd} rebuild better-sqlite3 --build-from-source`;
      const friendlyError = new Error(`better-sqlite3 原生扩展缺失且自动重建失败，请在项目根目录执行：${manualCommand}`);
      friendlyError.cause = error;
      throw friendlyError;
    }
    throw error;
  }
}

Database = loadBetterSqlite3();

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'database.db');

// 确保数据目录存在
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 创建数据库连接
let db;
try {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');  // 启用WAL模式提升并发性能
  db.pragma('synchronous = NORMAL'); // 平衡性能和安全性
  db.pragma('cache_size = 10000');   // 增加缓存大小
} catch (error) {
  logger.error('数据库连接失败', { error: error.message }, '数据库');
  throw error;
}

/**
 * 数据库表结构初始化
 */
function initializeDatabase() {
  try {
    // 创建topics表
    db.exec(`
      CREATE TABLE IF NOT EXISTS topics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        topic_id TEXT UNIQUE NOT NULL,
        ip TEXT NOT NULL,
        hash_key TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        message_count INTEGER DEFAULT 0,
        inbound_bytes INTEGER DEFAULT 0,
        outbound_bytes INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
  conversation_hash TEXT,
  topic_hash_no_reasoning TEXT,
        display_name TEXT
      )
    `);

    // 创建messages表 - 用户消息存储请求信息,模型消息为空(只记录id和元信息)
    db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT UNIQUE NOT NULL,
        topic_id TEXT NOT NULL,
        role TEXT NOT NULL,
        request_url TEXT,
        request_headers TEXT,
        request_body TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (topic_id) REFERENCES topics(topic_id) ON DELETE CASCADE
      )
    `);

    // message_contents表已废弃 - 不再保存消息正文和思考内容
    // attachments表已废弃 - 不再保存附件
    // original_requests表已废弃 - 请求信息现在直接存储在messages表中

    // 创建message_metadata表
    db.exec(`
      CREATE TABLE IF NOT EXISTS message_metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT UNIQUE NOT NULL,
        metadata_json TEXT NOT NULL,
        FOREIGN KEY (message_id) REFERENCES messages(message_id) ON DELETE CASCADE
      )
    `);

    // 创建general_data表 - 通用数据存储
    db.exec(`
      CREATE TABLE IF NOT EXISTS general_data (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // 创建IP映射表
    db.exec(`
      CREATE TABLE IF NOT EXISTS ip_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        display_ip TEXT NOT NULL,
        real_ip TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(display_ip, real_ip)
      )
    `);

    // 创建IP别名密钥表
    db.exec(`
      CREATE TABLE IF NOT EXISTS ip_alias_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alias_name TEXT UNIQUE NOT NULL,
        key_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        first_used_at INTEGER NOT NULL,
        usage_count INTEGER DEFAULT 0
      )
    `);

    // 创建索引
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_topics_ip ON topics(ip);
      CREATE INDEX IF NOT EXISTS idx_topics_hash_key ON topics(hash_key);
      CREATE INDEX IF NOT EXISTS idx_topics_updated_at ON topics(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_topic ON messages(topic_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_metadata_message ON message_metadata(message_id);
      CREATE INDEX IF NOT EXISTS idx_ip_mappings_display ON ip_mappings(display_ip);
      CREATE INDEX IF NOT EXISTS idx_alias_keys_name ON ip_alias_keys(alias_name);
    `);

    // 数据库迁移：为现有的topics表添加system_instruction_text字段
    const safeAddColumn = (table, column, type, description) => {
      try {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
        logger.info(`数据库迁移：成功添加${description}字段`, {}, '数据库');
      } catch (error) {
        if (!error.message.includes('duplicate column name')) {
          logger.warn('数据库迁移警告', { table, column, error: error.message }, '数据库');
        }
      }
    };

    safeAddColumn('topics', 'topic_hash_no_reasoning', 'TEXT', 'topic_hash_no_reasoning');
    safeAddColumn('topics', 'display_name', 'TEXT', 'display_name');
    safeAddColumn('topics', 'inbound_bytes', 'INTEGER DEFAULT 0', 'inbound_bytes');
    safeAddColumn('topics', 'outbound_bytes', 'INTEGER DEFAULT 0', 'outbound_bytes');
    safeAddColumn('messages', 'request_url', 'TEXT', 'messages.request_url');
    safeAddColumn('messages', 'request_headers', 'TEXT', 'messages.request_headers');
    safeAddColumn('messages', 'request_body', 'TEXT', 'messages.request_body');

    logger.info('数据库初始化完成', {}, '数据库');
  } catch (error) {
    logger.error('数据库初始化失败', { error: error.message }, '数据库');
    throw error;
  }
}

// 初始化数据库
initializeDatabase();

// 准备SQL语句以提升性能
const preparedStatements = {
  // Topics相关
  insertTopic: db.prepare(`
    INSERT INTO topics (topic_id, ip, hash_key, created_at, updated_at, message_count, inbound_bytes, outbound_bytes, status, conversation_hash, topic_hash_no_reasoning, display_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  
  updateTopic: db.prepare(`
    UPDATE topics SET updated_at = ?, message_count = ?, inbound_bytes = ?, outbound_bytes = ?, status = ?, conversation_hash = ?, display_name = ?
    WHERE topic_id = ?
  `),
  
  selectTopicsByIP: db.prepare(`
    SELECT * FROM topics WHERE ip = ? ORDER BY updated_at DESC
  `),
  
  selectTopic: db.prepare(`
    SELECT * FROM topics WHERE ip = ? AND topic_id = ?
  `),
  
  selectTopicByHashKey: db.prepare(`
    SELECT * FROM topics WHERE ip = ? AND hash_key = ?
  `),

  updateTopicDisplayName: db.prepare(`
    UPDATE topics SET display_name = ? WHERE ip = ? AND topic_id = ?
  `),
  
  deleteTopics: db.prepare(`
    DELETE FROM topics WHERE ip = ? AND topic_id = ?
  `),

  deleteTopicsByIP: db.prepare(`
    DELETE FROM topics WHERE ip = ?
  `),

  // Messages相关 - 用户消息保存请求信息,模型消息为空
  insertMessage: db.prepare(`
    INSERT INTO messages (message_id, topic_id, role, request_url, request_headers, request_body, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  
  selectMessagesByTopic: db.prepare(`
    SELECT * FROM messages WHERE topic_id = ? ORDER BY created_at ASC
  `),
  
  deleteMessage: db.prepare(`
    DELETE FROM messages WHERE message_id = ?
  `),

  // Message metadata相关
  insertMessageMetadata: db.prepare(`
    INSERT OR REPLACE INTO message_metadata (message_id, metadata_json)
    VALUES (?, ?)
  `),
  
  selectMessageMetadata: db.prepare(`
    SELECT metadata_json FROM message_metadata WHERE message_id = ?
  `),

  // IP映射相关
  insertIPMapping: db.prepare(`
    INSERT OR REPLACE INTO ip_mappings (display_ip, real_ip, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `),
  
  selectIPMappingsByDisplay: db.prepare(`
    SELECT real_ip, updated_at FROM ip_mappings WHERE display_ip = ? ORDER BY updated_at DESC
  `),
  
  selectAllIPMappings: db.prepare(`
    SELECT display_ip, real_ip, updated_at FROM ip_mappings ORDER BY display_ip, updated_at DESC
  `),

  // IP别名密钥相关
  insertAliasKey: db.prepare(`
    INSERT INTO ip_alias_keys (alias_name, key_hash, created_at, updated_at, first_used_at, usage_count)
    VALUES (?, ?, ?, ?, ?, 1)
  `),
  
  selectAliasKey: db.prepare(`
    SELECT key_hash, first_used_at, usage_count FROM ip_alias_keys WHERE alias_name = ?
  `),
  
  updateAliasKeyUsage: db.prepare(`
    UPDATE ip_alias_keys SET updated_at = ?, usage_count = usage_count + 1 WHERE alias_name = ?
  `),
  
  selectAllAliasKeys: db.prepare(`
    SELECT alias_name, created_at, updated_at, first_used_at, usage_count FROM ip_alias_keys ORDER BY updated_at DESC
  `)
};

// 启动时刻的已有 topic 视为历史数据
const historicalTopicIds = new Set();
try {
  const allTopics = db.prepare('SELECT topic_id FROM topics').all();
  for (const topic of allTopics) {
    historicalTopicIds.add(topic.topic_id);
  }
} catch (error) {
  logger.warn('加载历史话题ID失败', { error: error.message });
}

/**
 * 加载索引（从数据库构建）
 */
function loadIndex() {
  try {
    const topics = {};
    const allTopics = db.prepare(`
      SELECT ip, topic_id, hash_key, created_at, updated_at, message_count, inbound_bytes, outbound_bytes, status, conversation_hash
      FROM topics
    `).all();

    for (const topic of allTopics) {
      if (!topics[topic.ip]) {
        topics[topic.ip] = [];
      }
      topics[topic.ip].push({
        topicId: topic.topic_id,
        hashKey: topic.hash_key,
        createdAt: topic.created_at,
        updatedAt: topic.updated_at,
        messageCount: topic.message_count,
        inboundBytes: topic.inbound_bytes || 0,
        outboundBytes: topic.outbound_bytes || 0,
        status: topic.status,
        conversationHash: topic.conversation_hash,
        displayName: topic.display_name || null
      });
    }

    return { topics, version: 2 }; // 版本2表示数据库版本
  } catch (error) {
    logger.warn('加载索引失败', { error: error.message });
    return { topics: {}, version: 2 };
  }
}

let indexCache = loadIndex();

/**
 * 加载话题详情
 */
function loadTopic(ip, topicId) {
  try {
    logger.debug('开始加载话题', { ip, topicId });
    const topic = preparedStatements.selectTopic.get(ip, topicId);
    if (!topic) {
      logger.warn('话题不存在', { ip, topicId });
      return null;
    }

    logger.debug('话题基础信息加载成功', { topicId: topic.topic_id, messageCount: topic.message_count });
    const messages = preparedStatements.selectMessagesByTopic.all(topicId);
    if (!messages) {
      logger.warn('消息列表为空', { topicId });
      return null;
    }

    logger.debug('消息列表加载成功', { topicId, messageCount: messages.length });

    // 构建完整的话题对象
    const result = {
      ip: topic.ip,
      topicId: topic.topic_id,
      createdAt: topic.created_at,
      updatedAt: topic.updated_at,
      status: topic.status,
      conversationHash: topic.conversation_hash,
  topicHashNoReasoning: topic.topic_hash_no_reasoning || null,
      inboundBytes: topic.inbound_bytes || 0,
      outboundBytes: topic.outbound_bytes || 0,
      messages: [],
      displayName: topic.display_name || null
    };

    // 加载每个消息的详细信息
    for (const msg of messages) {
      const messageObj = {
        id: msg.message_id,
        role: msg.role,
        requestUrl: msg.request_url || null,
        hasRequestBody: !!msg.request_body,
        hasRequestHeaders: !!msg.request_headers
      };

      // 加载消息元数据
      const metadataRow = preparedStatements.selectMessageMetadata.get(msg.message_id);
      if (metadataRow && metadataRow.metadata_json) {
        try {
          messageObj.meta = JSON.parse(metadataRow.metadata_json);
        } catch (error) {
          logger.warn('解析消息元数据失败', { messageId: msg.message_id, error: error.message });
          messageObj.meta = {};
        }
      } else {
        messageObj.meta = {};
      }

      result.messages.push(messageObj);
    }

    logger.debug('话题加载完成', { topicId: result.topicId, messageCount: result.messages.length });
    return result;
  } catch (error) {
    logger.error('加载话题失败', { ip, topicId, error: error.message, stack: error.stack });
    return null;
  }
}

/**
 * 列出话题
 */
function listTopics(ip, includeIncomplete = false) {
  try {
    const topics = preparedStatements.selectTopicsByIP.all(ip);
    if (!topics) return [];

    const result = topics
      .filter(t => includeIncomplete || t.status === 'completed')
      .map(t => ({
        topicId: t.topic_id,
        hashKey: t.hash_key,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        messageCount: t.message_count,
        inboundBytes: t.inbound_bytes || 0,
        outboundBytes: t.outbound_bytes || 0,
        status: t.status,
        conversationHash: t.conversation_hash,
        historical: historicalTopicIds.has(t.topic_id),
        displayName: t.display_name || null
      }));

    return result;
  } catch (error) {
    logger.warn('列出话题失败', { ip, error: error.message });
    return [];
  }
}

    // 在持久化请求体时对敏感字段统一脱敏，确保不会在数据库或缓存中泄露原始文本和附件内容。
const REQUEST_BODY_PLACEHOLDER = '<已去除具体内容>';
const SENSITIVE_TEXT_KEYS = new Set(['text', 'content', 'prompt', 'query']);
const ATTACHMENT_DATA_KEYS = new Set(['data', 'data64', 'b64_json', 'blob', 'base64', 'base64Data', 'binary', 'binaryData']);
const ATTACHMENT_PARENT_KEYS = new Set(['inlineData', 'inline_data', 'fileData', 'file_data', 'attachments', 'attachment', 'inlineFiles', 'inline_files', 'inlineImages', 'inline_images']);

function isBase64Like(value) {
  if (typeof value !== 'string' || value.length < 12) return false;
  const normalized = value.replace(/\s+/g, '');
  if (!normalized || normalized.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(normalized);
}

function sanitizeRequestBody(body) {
  if (body === null || body === undefined) {
    return body ?? null;
  }

  if (typeof body === 'string') {
    return REQUEST_BODY_PLACEHOLDER;
  }

  if (typeof body !== 'object') {
    return body;
  }

  const visited = new WeakSet();

  const cloneNode = (node, parentKey = '', grandparentKey = '') => {
    if (node === null || node === undefined) {
      return node ?? null;
    }

    const nodeType = typeof node;

    if (nodeType === 'string') {
      if (SENSITIVE_TEXT_KEYS.has(parentKey)) {
        return REQUEST_BODY_PLACEHOLDER;
      }
      if (ATTACHMENT_DATA_KEYS.has(parentKey)) {
        return REQUEST_BODY_PLACEHOLDER;
      }
      if (parentKey === 'uri' && ATTACHMENT_PARENT_KEYS.has(grandparentKey)) {
        return REQUEST_BODY_PLACEHOLDER;
      }
      if ((parentKey === 'data' || parentKey === 'fileUri' || parentKey === 'file_uri') && ATTACHMENT_PARENT_KEYS.has(grandparentKey)) {
        return REQUEST_BODY_PLACEHOLDER;
      }
      if (isBase64Like(node) && (parentKey === 'data' || ATTACHMENT_PARENT_KEYS.has(parentKey) || ATTACHMENT_PARENT_KEYS.has(grandparentKey))) {
        return REQUEST_BODY_PLACEHOLDER;
      }
      return node;
    }

    if (nodeType === 'number' || nodeType === 'boolean' || nodeType === 'bigint') {
      return node;
    }

    if (visited.has(node)) {
      return Array.isArray(node) ? [] : {};
    }
    visited.add(node);

    if (Array.isArray(node)) {
      return node.map(item => cloneNode(item, parentKey, grandparentKey));
    }

    const result = {};
    for (const [key, value] of Object.entries(node)) {
      if (SENSITIVE_TEXT_KEYS.has(key) && typeof value === 'string') {
        result[key] = REQUEST_BODY_PLACEHOLDER;
        continue;
      }
      if (ATTACHMENT_DATA_KEYS.has(key) && typeof value === 'string') {
        result[key] = REQUEST_BODY_PLACEHOLDER;
        continue;
      }
      result[key] = cloneNode(value, key, parentKey);
    }
    return result;
  };

  return cloneNode(body, '', '');
}

/**
 * 创建或追加消息
 * 重构后只保存哈希值和请求信息,不保存消息内容和附件
 */
function createOrAppendMessage(ip, contentHashKey, message, options = {}) {
  try {
    const transaction = db.transaction(() => {
      logger.debug('开始事务：创建或追加消息', { ip, contentHashKey, messageId: message.messageData?.id });
      
      // 查找现有话题
      let existing = preparedStatements.selectTopicByHashKey.get(ip, contentHashKey);
      let topic;

      if (!existing) {
        // 创建新话题
        const topicId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        
        preparedStatements.insertTopic.run(
          topicId,
          ip,
          contentHashKey,
          Date.now(),
          Date.now(),
          0,
          0,
          0,
          'pending',
          null,
          null, // topic_hash_no_reasoning: 初始为空
          null
        );
        logger.debug('创建新话题成功', { topicId });

        existing = preparedStatements.selectTopic.get(ip, topicId);
        topic = {
          ip,
          topicId,
          createdAt: existing.created_at,
          updatedAt: existing.updated_at,
          messages: [],
          status: 'pending',
          displayName: existing.display_name || null,
          inboundBytes: existing?.inbound_bytes || 0,
          outboundBytes: existing?.outbound_bytes || 0
        };
      } else {
        topic = loadTopic(ip, existing.topic_id);
        if (typeof topic.inboundBytes !== 'number') {
          topic.inboundBytes = existing?.inbound_bytes || 0;
        }
        if (typeof topic.outboundBytes !== 'number') {
          topic.outboundBytes = existing?.outbound_bytes || 0;
        }
      }

      if (!topic) throw new Error('无法加载话题');

      // 获取消息数据
      const messageData = message.messageData || message;

      if (Object.prototype.hasOwnProperty.call(messageData, 'requestBody')) {
        messageData.requestBody = sanitizeRequestBody(messageData.requestBody);
      }
      
      logger.debug('准备保存消息', { messageId: messageData.id, role: messageData.role });

      // 插入消息基础信息 - 用户消息保存请求信息,模型消息为空
      const existingMessage = db.prepare('SELECT message_id FROM messages WHERE message_id = ?').get(messageData.id);
      const isNewMessage = !existingMessage;
      if (isNewMessage) {
        preparedStatements.insertMessage.run(
          messageData.id,
          topic.topicId || existing.topic_id,
          messageData.role,
          messageData.requestUrl || null,
          messageData.requestHeaders ? JSON.stringify(messageData.requestHeaders) : null,
          messageData.requestBody ? JSON.stringify(messageData.requestBody) : null,
          messageData.meta ? messageData.meta.createdAt || Date.now() : Date.now()
        );
        logger.debug('消息保存成功', { messageId: messageData.id, role: messageData.role });
      } else {
        logger.debug('消息已存在', { messageId: messageData.id });
      }

      // 保存消息元数据
      if (messageData.meta) {
        preparedStatements.insertMessageMetadata.run(
          messageData.id,
          JSON.stringify(messageData.meta)
        );
      }

      // 添加消息到话题
      topic.messages.push(messageData);

      // 统一更新时间戳，确保话题更新时间与最新消息保持一致
      const messageUpdatedAt = Number(messageData?.meta?.createdAt);
      if (Number.isFinite(messageUpdatedAt)) {
        topic.updatedAt = messageUpdatedAt;
      } else {
        topic.updatedAt = Date.now();
      }
      if (!Number.isFinite(Number(topic.createdAt))) {
        topic.createdAt = topic.updatedAt;
      }

      const traffic = options?.traffic || null;
      if (isNewMessage && traffic) {
        const inboundDelta = Math.max(0, Number(traffic.inboundBytes) || 0);
        const outboundDelta = Math.max(0, Number(traffic.outboundBytes) || 0);
        if (inboundDelta > 0) {
          topic.inboundBytes = (topic.inboundBytes || 0) + inboundDelta;
        }
        if (outboundDelta > 0) {
          topic.outboundBytes = (topic.outboundBytes || 0) + outboundDelta;
        }
      }

      // 更新话题状态
      if (messageData.role === 'model') {
        topic.status = 'completed';
      }

      // 注意: 话题哈希由 updateTopicHash 方法单独更新,不在这里计算

      // 更新数据库中的话题信息(不更新哈希字段,由updateTopicHash单独处理)
      preparedStatements.updateTopic.run(
        topic.updatedAt || Date.now(),
        topic.messages.length,
        topic.inboundBytes || 0,
        topic.outboundBytes || 0,
        topic.status,
        null, // conversationHash已废弃,保留字段为null
        topic.displayName || existing.display_name || null,
        topic.topicId || existing.topic_id
      );

      return {
        topicMeta: {
          topicId: topic.topicId || existing.topic_id,
          hashKey: contentHashKey,
          ip,
          createdAt: topic.createdAt,
          updatedAt: topic.updatedAt,
          messageCount: topic.messages.length,
          inboundBytes: topic.inboundBytes || 0,
          outboundBytes: topic.outboundBytes || 0,
          status: topic.status,
          conversationHash: null
        },
        topic
      };
    });

    const result = transaction();
    
    // 更新缓存
    indexCache = loadIndex();
    
    return result;
  } catch (error) {
    logger.error('创建或追加消息失败', { error: error.message });
    return null;
  }
}

/**
 * 删除消息
 */
function deleteMessages(ip, topicId, messageIds) {
  try {
    const transaction = db.transaction(() => {
      for (const messageId of messageIds) {
        preparedStatements.deleteMessage.run(messageId);
      }

      // 更新话题的消息计数
      const topic = loadTopic(ip, topicId);
      if (topic) {
        preparedStatements.updateTopic.run(
          Date.now(),
          topic.messages.length,
          topic.inboundBytes || 0,
          topic.outboundBytes || 0,
          topic.status,
          null,
          topic.displayName || null,
          topicId
        );
      }
    });

    transaction();
    
    // 更新缓存
    indexCache = loadIndex();
    
    return true;
  } catch (error) {
    logger.warn('删除消息失败', { ip, topicId, messageIds, error: error.message });
    return false;
  }
}

/**
 * 删除话题
 */
function deleteTopics(ip, topicIds) {
  try {
    const transaction = db.transaction(() => {
      for (const topicId of topicIds) {
        preparedStatements.deleteTopics.run(ip, topicId);
      }
    });

    transaction();
    
    // 更新缓存
    indexCache = loadIndex();
    logger.info('话题删除成功', { ip, topicIds });
    return true;
  } catch (error) {
    logger.warn('删除话题失败', { ip, topicIds, error: error.message });
    return false;
  }
}

/**
 * 删除指定IP的所有数据
 */
function deleteIP(ip) {
  try {
    const transaction = db.transaction(() => {
      preparedStatements.deleteTopicsByIP.run(ip);
    });

    transaction();

    // 同步删除IP映射
    deleteIPMapping(ip);

    // 刷新索引缓存
    indexCache = loadIndex();
    logger.info('删除IP及相关数据成功', { ip });
    return true;
  } catch (error) {
    logger.warn('删除IP数据失败', { ip, error: error.message });
    return false;
  }
}

// 通用数据持久化操作
const DataPersistence = {
  // 保存通用JSON数据
  saveData: (fileName, data) => {
    try {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO general_data (key, value, updated_at) VALUES (?, ?, ?)
      `);
      
      stmt.run(fileName, JSON.stringify(data), Date.now());
      return true;
    } catch (error) {
      logger.warn('保存通用数据失败', { fileName, error: error.message });
      return false;
    }
  },

  // 读取通用JSON数据
  loadData: (fileName, defaultValue = null) => {
    try {
      const stmt = db.prepare(`SELECT value FROM general_data WHERE key = ?`);
      const result = stmt.get(fileName);
      
      if (result && result.value) {
        return JSON.parse(result.value);
      }
      return defaultValue;
    } catch (error) {
      logger.warn('读取通用数据失败', { fileName, error: error.message });
      return defaultValue;
    }
  }
};

/**
 * 保存IP映射
 */
function saveIPMapping(displayIP, realIP) {
  try {
    const now = Date.now();
    preparedStatements.insertIPMapping.run(displayIP, realIP, now, now);
    logger.debug('IP映射保存成功', { displayIP, realIP });
  } catch (error) {
    logger.error('保存IP映射失败', { displayIP, realIP, error: error.message });
  }
}

/**
 * 获取真实IP列表
 */
function getRealIPs(displayIP) {
  try {
    const results = preparedStatements.selectIPMappingsByDisplay.all(displayIP);
    return results.map(row => row.real_ip);
  } catch (error) {
    logger.error('获取真实IP列表失败', { displayIP, error: error.message });
    return [displayIP];
  }
}

/**
 * 获取最新的真实IP
 */
function getRealIP(displayIP) {
  try {
    const results = preparedStatements.selectIPMappingsByDisplay.all(displayIP);
    if (results && results.length > 0) {
      return results[0].real_ip; // 返回最新的
    }
    return displayIP;
  } catch (error) {
    logger.error('获取真实IP失败', { displayIP, error: error.message });
    return displayIP;
  }
}

/**
 * 获取所有IP映射
 */
function getAllIPMappings() {
  try {
    return preparedStatements.selectAllIPMappings.all();
  } catch (error) {
    logger.error('获取所有IP映射失败', { error: error.message });
    return [];
  }
}

/**
 * 删除IP映射
 */
function deleteIPMapping(displayIP) {
  try {
    const stmt = db.prepare('DELETE FROM ip_mappings WHERE display_ip = ?');
    const result = stmt.run(displayIP);
    logger.debug('IP映射删除成功', { displayIP, deletedRows: result.changes });
    return result.changes > 0;
  } catch (error) {
    logger.error('删除IP映射失败', { displayIP, error: error.message });
    return false;
  }
}

/**
 * 验证或创建IP别名密钥
 * 如果别名不存在，则创建新的别名-密钥对
 * 如果别名存在，则验证密钥是否匹配
 */
function validateOrCreateAliasKey(aliasName, providedKey) {
  try {
    const crypto = require('crypto');
    const keyHash = crypto.createHash('sha256').update(providedKey).digest('hex');
    
    // 查找现有的别名密钥
    const existing = preparedStatements.selectAliasKey.get(aliasName);
    
    if (!existing) {
      // 别名不存在，创建新的
      const now = Date.now();
      preparedStatements.insertAliasKey.run(
        aliasName,
        keyHash,
        now,
        now,
        now
      );
      logger.info('创建新的IP别名密钥', { aliasName });
      return { success: true, isNew: true };
    } else {
      // 别名存在，验证密钥
      if (existing.key_hash === keyHash) {
        // 密钥匹配，更新使用统计
        preparedStatements.updateAliasKeyUsage.run(Date.now(), aliasName);
        logger.debug('IP别名密钥验证成功', { aliasName, usageCount: existing.usage_count + 1 });
        return { success: true, isNew: false };
      } else {
        // 密钥不匹配
        logger.warn('IP别名密钥验证失败', { aliasName });
        return { success: false, isNew: false, reason: 'invalid_key' };
      }
    }
  } catch (error) {
    logger.error('验证或创建IP别名密钥失败', { aliasName, error: error.message });
    return { success: false, isNew: false, reason: 'internal_error' };
  }
}

/**
 * 获取所有别名密钥信息（不包含密钥哈希）
 */
function getAllAliasKeys() {
  try {
    const results = preparedStatements.selectAllAliasKeys.all();
    return results.map(row => ({
      aliasName: row.alias_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      firstUsedAt: row.first_used_at,
      usageCount: row.usage_count
    }));
  } catch (error) {
    logger.error('获取所有别名密钥失败', { error: error.message });
    return [];
  }
}

/**
 * 删除别名密钥
 */
function deleteAliasKey(aliasName) {
  try {
    const stmt = db.prepare('DELETE FROM ip_alias_keys WHERE alias_name = ?');
    const result = stmt.run(aliasName);
    logger.debug('别名密钥删除成功', { aliasName, deletedRows: result.changes });
    return result.changes > 0;
  } catch (error) {
    logger.error('删除别名密钥失败', { aliasName, error: error.message });
    return false;
  }
}

function updateMessageMetadata(messageId, updater) {
  try {
    const row = preparedStatements.selectMessageMetadata.get(messageId);
    let metadata = {};
    if (row && row.metadata_json) {
      try {
        metadata = JSON.parse(row.metadata_json) || {};
      } catch (error) {
        logger.warn('解析现有消息元数据失败，将使用空对象', { messageId, error: error.message });
      }
    }

    const nextMeta = typeof updater === 'function' ? updater({ ...metadata }) : { ...metadata, ...updater };
    preparedStatements.insertMessageMetadata.run(messageId, JSON.stringify(nextMeta));
    return nextMeta;
  } catch (error) {
    logger.warn('更新消息元数据失败', { messageId, error: error.message });
    return null;
  }
}

function getMessageMetadata(messageId) {
  try {
    const row = preparedStatements.selectMessageMetadata.get(messageId);
    if (!row || !row.metadata_json) {
      return null;
    }
    try {
      return JSON.parse(row.metadata_json) || {};
    } catch (error) {
      logger.warn('解析消息元数据失败', { messageId, error: error.message });
      return null;
    }
  } catch (error) {
    logger.warn('获取消息元数据失败', { messageId, error: error.message });
    return null;
  }
}

function setTopicDisplayName(ip, topicId, displayName) {
  try {
    const trimmed = typeof displayName === 'string' ? displayName.trim() : null;
    preparedStatements.updateTopicDisplayName.run(trimmed || null, ip, topicId);
    indexCache = loadIndex();
    return true;
  } catch (error) {
    logger.warn('更新话题显示名称失败', { ip, topicId, error: error.message });
    return false;
  }
}

// 导出模块
module.exports = {
  // 基础话题管理
  listTopics,
  loadTopic,
  createOrAppendMessage,
  deleteMessages,
  deleteTopics,
  deleteIP,
  loadIndex: () => indexCache,
  // 通用数据持久化操作
  DataPersistence,
  // 数据库特定功能
  db, // 暴露数据库连接以便高级操作
  preparedStatements, // 暴露预编译语句
  
  // IP映射功能
  saveIPMapping,
  getRealIP,
  getRealIPs,
  getAllIPMappings,
  deleteIPMapping,
  
  // IP别名密钥功能
  validateOrCreateAliasKey,
  getAllAliasKeys,
  deleteAliasKey,

  // 元数据和话题扩展操作
  updateMessageMetadata,
  getMessageMetadata,
  setTopicDisplayName
};
