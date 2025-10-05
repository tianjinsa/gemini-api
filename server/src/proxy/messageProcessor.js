/**
 * 消息处理器
 * 负责处理和保存API对话数据
 */

const crypto = require('crypto');
const logger = require('../utils/logger');
const { generateId } = require('../utils/helpers');
const { createOrAppendMessage, loadTopic, loadIndex, db } = require('../storage');
const { hashBufferOrBase64, isReasoningPart } = require('../utils/dataExtractor');

class MessageProcessor {
  constructor(dataDir) {
    this.dataDir = dataDir;
    
    // 统计数据
    this.totalRequests = 0;
    this.requestsPerIP = new Map();
    this.totalIncomingTraffic = 0;
    this.totalOutgoingTraffic = 0;
    this.incomingTrafficPerIP = new Map();
    this.outgoingTrafficPerIP = new Map();
    this.requestLogsByIP = new Map();
    this.lastModelRequestAt = new Map();
    this.lastGlobalMessageAt = 0;

    this.initHistoricalIPs();
  }

  /**
   * 初始化历史IP信息
   */
  initHistoricalIPs() {
    try {
      const index = loadIndex().topics || {};
      for (const ip of Object.keys(index)) {
        const topics = index[ip] || [];
        let maxUpdate = 0;
        
        for (const meta of topics) {
          if (meta && meta.status === 'completed') {
            if (meta.updatedAt && meta.updatedAt > maxUpdate) {
              maxUpdate = meta.updatedAt;
            }
          }
        }
        
        if (maxUpdate) {
          this.lastModelRequestAt.set(ip, maxUpdate);
          if (maxUpdate > this.lastGlobalMessageAt) {
            this.lastGlobalMessageAt = maxUpdate;
          }
        }
      }
    } catch (error) {
      logger.warn('初始化历史IP信息失败', { error: error.message });
    }
  }

  /**
   * 记录传入流量
   */
  recordIncomingTraffic(clientIP, size) {
    this.totalRequests++;
    this.requestsPerIP.set(clientIP, (this.requestsPerIP.get(clientIP) || 0) + 1);
    this.totalIncomingTraffic += size;
    this.incomingTrafficPerIP.set(clientIP, (this.incomingTrafficPerIP.get(clientIP) || 0) + size);

    // 记录详细日志
    if (!this.requestLogsByIP.has(clientIP)) {
      this.requestLogsByIP.set(clientIP, []);
    }
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      incomingTraffic: size,
      outgoingTraffic: 0
    };
    
    this.requestLogsByIP.get(clientIP).push(logEntry);
  }

  /**
   * 记录传出流量
   */
  recordOutgoingTraffic(clientIP, size) {
    this.totalOutgoingTraffic += size;
    this.outgoingTrafficPerIP.set(clientIP, (this.outgoingTrafficPerIP.get(clientIP) || 0) + size);

    // 更新最后一个日志条目的传出流量
    const logs = this.requestLogsByIP.get(clientIP);
    if (logs && logs.length) {
      logs[logs.length - 1].outgoingTraffic = size;
    }
  }

  /**
   * 保存对话数据 - 重构后只保存请求信息和哈希值
   */
  saveConversation(data) {
    const {
      clientIP,
      realIP = clientIP,
      url,
      userJson,
      userExtracted,
      modelExtracted,
      proxyRes,
      modelJson,
      headers,
      incomingBytes = 0,
      outgoingBytes = 0
    } = data;
    try {
      if (clientIP && realIP && clientIP !== realIP) {
        this.saveIPMapping(clientIP, realIP);
      }

      const { hashKey, existingTopic, mode } = this.findOrCreateTopic(clientIP, userJson);
      const baseId = generateId();
      const nowTs = Date.now();
      
      // 准备消息数据
      const { pendingUserMessage, pendingModelMessage } = this.preparePendingMessages(
        userJson, userExtracted, modelExtracted, baseId, nowTs, url, proxyRes, modelJson, existingTopic, mode, realIP, headers
      );
      
      // 保存消息到数据库并更新话题哈希
      const saveResult = this.saveAllMessages(
        clientIP,
        hashKey,
        pendingUserMessage,
        pendingModelMessage,
        nowTs,
        userExtracted,
        modelExtracted,
        existingTopic,
        incomingBytes,
        outgoingBytes
      );

      if (saveResult && saveResult.updatedAt) {
        this.lastModelRequestAt.set(clientIP, saveResult.updatedAt);
        if (saveResult.updatedAt > this.lastGlobalMessageAt) {
          this.lastGlobalMessageAt = saveResult.updatedAt;
        }
      }

      // 不再需要调度后处理(AI分析和命名已移除)
    } catch (error) {
      logger.error('保存对话时出错', { error: error.message, stack: error.stack });
    }
  }

  /**
   * 查找或创建对话主题
   */
  findOrCreateTopic(clientIP, userJson) {
    let hashKey;
    let existingTopic = null;
    let mode = 'new';

    // 检查是否包含历史对话
    const histArrRaw = this.extractHistoryArray(userJson);
    logger.debug('🔍 [话题匹配] findOrCreateTopic 开始', { 
      clientIP, 
      hasHistory: !!histArrRaw, 
      historyLength: Array.isArray(histArrRaw) ? histArrRaw.length : 0,
      hasContents: !!userJson.contents,
      hasHistoryField: !!userJson.history,
      hasMessagesField: !!userJson.messages
    });
    
    if (Array.isArray(histArrRaw)) {
      // 原始请求里的对话数组(优先 contents,其次 history/messages),用于精确匹配
      const originalRequestContents = userJson.contents || userJson.history || userJson.messages;
      logger.debug('🎯 [话题匹配] 准备调用 findExactContinuingTopic', {
        originalRequestContentsLength: Array.isArray(originalRequestContents) ? originalRequestContents.length : 0,
        histArrRawLength: histArrRaw.length,
        useContents: !!userJson.contents,
        useHistory: !userJson.contents && !!userJson.history,
        useMessages: !userJson.contents && !userJson.history && !!userJson.messages
      });
  const exact = this.findExactContinuingTopic(clientIP, originalRequestContents, userJson);
      if(process.env.DASH_DEBUG_APPEND){
        try{
          console.debug('[AppendDebug] attempt match', {
            hasContents: !!userJson.contents,
            hasHistory: !!userJson.history,
            hasMessages: !!userJson.messages,
            requestLen: Array.isArray(originalRequestContents)?originalRequestContents.length:0,
            modeFound: exact && exact.mode,
            topicId: exact && exact.meta && exact.meta.topicId
          });
        }catch{}
      }
      if (exact) {
        hashKey = exact.meta.hashKey;
        existingTopic = loadTopic(clientIP, exact.meta.topicId);
        mode = exact.mode;
      } else {
        hashKey = generateId();
      }
    } else {
      const head = JSON.stringify(userJson).slice(0, 2048);
      hashKey = crypto.createHash('sha1').update(head + '|' + Date.now()).digest('hex');
    }

    return { hashKey, existingTopic, mode };
  }

  /**
   * 提取历史对话数组
   */
  extractHistoryArray(userJson) {
    logger.debug('📝 [extractHistoryArray] 开始提取', {
      hasContents: !!userJson?.contents,
      contentsLength: Array.isArray(userJson?.contents) ? userJson.contents.length : 0,
      hasHistory: !!userJson?.history,
      historyLength: Array.isArray(userJson?.history) ? userJson.history.length : 0,
      hasMessages: !!userJson?.messages,
      messagesLength: Array.isArray(userJson?.messages) ? userJson.messages.length : 0
    });
    
    if (Array.isArray(userJson?.contents) && userJson.contents.length) {
      const normalized = [];
      for (const item of userJson.contents) {
        const role = item.role || 'user';
        if (!Array.isArray(item.parts)) continue;
        
        const texts = [];
        for (const part of item.parts) {
          if (part && typeof part.text === 'string' && part.thought !== true) {
            texts.push(part.text);
          }
        }
        normalized.push({ role, content: texts.join('\n') });
      }
      logger.debug('✅ [extractHistoryArray] 从 contents 提取', { normalizedLength: normalized.length });
      return normalized.length ? normalized : null;
    }
    logger.debug('✅ [extractHistoryArray] 提取结果', { 
      source: Array.isArray(userJson?.history) ? 'history' : Array.isArray(userJson?.messages) ? 'messages' : 'none',
      resultLength: Array.isArray(result) ? result.length : 0
    });
    return Array.isArray(userJson?.history) ? userJson.history
         : Array.isArray(userJson?.messages) ? userJson.messages
         : null;
  }

  /**
   * 查找完全相同的对话(重复提交)或可追加的对话(前缀匹配)
   * 当前实现：仅依赖数据库中预计算的单一链式哈希(topic_hash_no_reasoning)
   */
  findExactContinuingTopic(ip, requestContents, userJson = null) {
    try {
      logger.debug('🎯 [HashMatch] findExactContinuingTopic 被调用', { 
        ip, 
        contentLength: requestContents ? requestContents.length : 0,
        isArray: Array.isArray(requestContents)
      });
      
      if (!Array.isArray(requestContents) || !requestContents.length) {
        logger.debug('❌ [HashMatch] 请求内容为空，跳过匹配', { ip });
        return null;
      }

      // 计算请求的链式哈希值（单一哈希策略）
      const { db } = require('../storage');
      // 提取systemInstruction
      const systemInstruction = userJson?.systemInstruction || null;
      const reqTopicHash = this.calculateRequestHash(requestContents, systemInstruction, true);

      logger.debug('🔐 [HashMatch] 请求链式哈希计算完成', { 
        requestLen: requestContents.length,
        reqTopicHashFull: reqTopicHash,
        // reqTopicHashShort: reqTopicHash.slice(0, 16),
        requestMessageCount: requestContents.length,
        historyMessageCount: Math.max(requestContents.length - 1, 0)
      });

      const index = loadIndex();
      const metas = (index.topics[ip] || [])
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 20);
      
      logger.debug('📋 [HashMatch] 候选话题列表', { 
        ip, 
        totalTopics: (index.topics[ip] || []).length,
        candidateCount: metas.length 
      });
      
      if (!metas.length) {
        logger.debug('❌ [HashMatch] 该IP无历史话题', { ip });
        return null;
      }

      // 遍历候选话题,直接比对数据库中的对应哈希字段
      for (const meta of metas) {
        const topicRow = db.prepare(`SELECT topic_id, message_count, topic_hash_no_reasoning FROM topics WHERE topic_id = ?`).get(meta.topicId);
        if (!topicRow || !topicRow.topic_hash_no_reasoning) continue;

        const storedHash = topicRow.topic_hash_no_reasoning;

        logger.debug('[话题匹配] 检查候选话题', {
          topicId: meta.topicId,
          storedMsgCount: topicRow.message_count,
          requestLen: requestContents.length,
          storedHashFull: storedHash,
          // storedHashShort: storedHash.slice(0, 16),
          reqTopicHashFull: reqTopicHash,
          // reqTopicHashShort: reqTopicHash.slice(0, 16),
          appendCandidate: topicRow.message_count === requestContents.length - 1 && storedHash === reqTopicHash ? '✅可追加' : '❌不匹配'
        });

        // 前缀匹配：存储的消息数量 == 请求消息数量-1 && 存储的topic_hash == 请求历史hash => 可追加
        if (topicRow.message_count === requestContents.length - 1 && storedHash === reqTopicHash) {
          logger.info('[话题匹配] 发现可追加话题(前缀匹配topic_hash)', { 
            topicId: meta.topicId,
            lastRole: (requestContents[requestContents.length - 1] || {}).role 
          });
          return { meta, mode: 'append' };
        }
      }

      logger.debug('[话题匹配] 无匹配话题', { reqLen: requestContents.length });
      return null;
    } catch (e) {
      logger.warn('[话题匹配] 匹配过程异常', { error: e.message, stack: e.stack });
      return null;
    }
  }

  /**
   * 计算请求的链式哈希值（忽略推理内容）
   * @param {Array} contents - 请求消息数组
   * @param {Object|null} systemInstruction - 系统提示词对象
   * @param {boolean} excludeLastMessage - 是否在内部排除最后一条消息（默认排除新消息）
   * @returns {string} 链式哈希值
   */
  calculateRequestHash(contents, systemInstruction = null, excludeLastMessage = true) {
    let sysText = '';
    if (systemInstruction && Array.isArray(systemInstruction.parts)) {
      sysText = systemInstruction.parts
        .filter(part => part && typeof part.text === 'string')
        .map(part => part.text)
        .join('\n');
    } else if (typeof systemInstruction === 'string') {
      sysText = systemInstruction;
    }

    // 初始哈希：从 systemInstruction 开始
    let chainedHash = sysText ? crypto.createHash('sha1').update(sysText).digest('hex') : '';
    
    logger.debug('[哈希计算] 初始哈希(系统提示词)', {
      hasSysInstruction: !!sysText,
      sysTextPreview: sysText ? sysText.slice(0, 50) + '...' : null,
      initialHashFull: chainedHash || '(empty)',
      // initialHashShort: chainedHash ? chainedHash.slice(0, 16) : '(empty)'
    });

    // 根据参数决定是否排除最后一条消息（通常为新消息）
    const historyMessages = excludeLastMessage ? contents.slice(0, -1) : contents;
    
    const lastMessage = contents.length ? contents[contents.length - 1] : null;
    logger.debug('[哈希计算] 请求消息处理', {
      totalMessages: contents.length,
      historyMessages: historyMessages.length,
      lastMessageRole: lastMessage ? lastMessage.role : null,
      lastMessagePreview: lastMessage ? JSON.stringify(lastMessage).slice(0, 100) : null,
      excludeLastMessage
    });

    // 逐条消息累积哈希
    for (let i = 0; i < historyMessages.length; i++) {
      const message = historyMessages[i];
      const prevHash = chainedHash;

      // 提取消息内容（完全忽略推理内容）
      const { text, attachmentHashes } = 
        this.extractMessageContent(message, null, true);

      // 计算这条消息的内容哈希
      const msgContent = `${message.role}:${text}:${attachmentHashes.join(',')}`;
      const msgHash = crypto.createHash('sha1').update(msgContent).digest('hex');
      
      // 累积到链式哈希： newHash = hash(prevHash + msgHash)
      chainedHash = crypto.createHash('sha1').update(prevHash + msgHash).digest('hex');
      
      logger.debug(`[哈希计算] 第${i + 1}/${historyMessages.length}条历史消息`, {
        role: message.role,
        textPreview: text.slice(0, 60) + (text.length > 60 ? '...' : ''),
        attachmentCount: attachmentHashes.length,
        msgContentForHash: msgContent.slice(0, 80) + '...',
        msgHashFull: msgHash,
        // msgHashShort: msgHash.slice(0, 16),
        prevChainHashFull: prevHash || '(empty)',
        // prevChainHashShort: prevHash ? prevHash.slice(0, 16) : '(empty)',
        newChainHashFull: chainedHash,
        // newChainHashShort: chainedHash.slice(0, 16),
        formula: `hash("${prevHash.slice(0, 8)}" + "${msgHash.slice(0, 8)}") = "${chainedHash.slice(0, 8)}"`
      });
    }

    return chainedHash;
  }

  /**
   * 从单条消息中提取文本、附件哈希和思考内容
   * @param {Object} message - 消息对象
   * @param {string|null} prependText - 需要前置的文本(如systemInstruction)
   * @param {boolean} ignoreReasoning - 是否完全忽略推理内容（用于哈希计算）
   * @returns { text, attachmentHashes, reasoning }
   */
  extractMessageContent(message, prependText = null, ignoreReasoning = false) {
    const texts = [];
    const attachmentHashes = [];
    const reasonings = [];

    if (!Array.isArray(message.parts)) {
      return { text: '', attachmentHashes: [], reasoning: null };
    }

    for (let partIndex = 0; partIndex < message.parts.length; partIndex++) {
      const part = message.parts[partIndex];
      if (!part || typeof part !== 'object') continue;

      // 提取附件哈希
      if (part.inlineData && part.inlineData.data) {
        attachmentHashes.push(hashBufferOrBase64(part.inlineData.data));
      }
      if (part.inline_data && part.inline_data.data) {
        attachmentHashes.push(hashBufferOrBase64(part.inline_data.data));
      }

      const explicitReasoning = isReasoningPart(part);
      const hasThoughtText = typeof part.thought === 'string';
      const partText = typeof part.text === 'string' ? part.text : null;

      const heuristicReasoning = !explicitReasoning
        && message.role === 'model'
        && partText !== null
        && partIndex > 0;

      // 如果设置了 ignoreReasoning，跳过所有推理内容处理
      if (ignoreReasoning && (explicitReasoning || heuristicReasoning)) {
        if (!explicitReasoning && heuristicReasoning) {
          // 启发式推理内容也跳过
          continue;
        }
        if (explicitReasoning) {
          // 显式推理内容跳过
          continue;
        }
      }

      if (explicitReasoning && partText !== null) {
        if (!ignoreReasoning) {
          reasonings.push(partText);
        }
        continue;
      }

      if (hasThoughtText && !ignoreReasoning) {
        reasonings.push(part.thought);
      }

      if (heuristicReasoning) {
        if (!ignoreReasoning) {
          reasonings.push(partText);
        }
        continue;
      }

      if (partText !== null) {
        texts.push(partText);
      }
    }

    let text = texts.join('\n');
    if (prependText) {
      text = (text ? prependText + '\n' : prependText) + text;
    }

    const reasoning = reasonings.length > 0 ? reasonings.join('\n') : null;

    return { text, attachmentHashes, reasoning };
  }

  /**
   * 准备待保存的消息 - 重构后只保存请求信息和哈希值
   */
  preparePendingMessages(userJson, userExtracted, modelExtracted, baseId, nowTs, url, proxyRes, modelJson, existingTopic, mode, realIP = null, headers = null) {
    // 提取系统指令和模型信息
    const systemInstruction = userJson?.systemInstruction?.parts?.map(p => p.text).join('\n') || null;
    const usageMetadataRaw = modelJson?.usageMetadata || null;
    const usageMetadata = usageMetadataRaw ? this.safeCloneForMeta(usageMetadataRaw) : null;
    const firstCandidate = Array.isArray(modelJson?.candidates) ? modelJson.candidates[0] : null;
    if (usageMetadata && firstCandidate?.citationMetadata?.citationSources) {
      usageMetadata.citationSources = firstCandidate.citationMetadata.citationSources.length;
    }
    if (usageMetadata && firstCandidate?.finishReason) {
      usageMetadata.finishReason = firstCandidate.finishReason;
    }
    if (usageMetadata && typeof modelJson?.error?.status === 'string' && !usageMetadata.finishReason) {
      usageMetadata.finishReason = 'ERROR';
    }

    const modelStatusCode = typeof proxyRes?.statusCode === 'number' ? proxyRes.statusCode : null;
    const modelStatusText = typeof proxyRes?.statusMessage === 'string' && proxyRes.statusMessage ? proxyRes.statusMessage : null;
    const errorInfo = modelJson?.error ? this.safeCloneForMeta(modelJson.error) : null;
    const errorMessage = errorInfo && typeof errorInfo.message === 'string' ? errorInfo.message : null;
    const errorStatus = errorInfo && typeof errorInfo.status === 'string' ? errorInfo.status : null;
    const errorCode = errorInfo && Object.prototype.hasOwnProperty.call(errorInfo, 'code') ? errorInfo.code : null;
    
    const modelVersion = modelJson?.candidates?.[0]?.modelVersion || null;
    let modelName = null;
    if (userJson && typeof userJson.model === 'string') {
      modelName = userJson.model;
    } else {
      try {
        const match = url.pathname.match(/\/models\/([^:\/]+)(?=[:\/]|$)/);
        if (match) modelName = match[1];
      } catch {}
    }

    // 用户消息:保存完整的请求体(包含历史上下文),作为一条消息记录
    const pendingUserMessage = {
      messageData: {
        id: baseId + '-u',
        role: 'user',
        requestUrl: url ? url.href : null,
        requestHeaders: headers || null,
        requestBody: userJson || null,
        meta: {
          path: url ? url.pathname : null,
          createdAt: nowTs,
          realIP: realIP
        }
      },
      options: { systemInstruction }
    };

    // 模型消息:不保存请求信息,只记录metadata
    const modelMeta = {
      status: modelStatusCode,
      statusText: modelStatusText,
      createdAt: nowTs + 1,
      tokens: usageMetadata,
      modelVersion,
      modelName,
      model: modelVersion,
      errMsg: errorMessage,
      errStatus: errorStatus,
      errCode: errorCode,
      hasErrorDetails: !!errorInfo
    };

    if (errorInfo) {
      modelMeta.error = errorInfo;
    }

    const pendingModelMessage = {
      messageData: {
        id: baseId + '-m',
        role: 'model',
        requestUrl: null,
        requestHeaders: null,
        requestBody: null,
        meta: modelMeta
      }
    };

    return { pendingUserMessage, pendingModelMessage };
  }

  /**
   * 保存消息并更新话题链式哈希
   */
  saveAllMessages(clientIP, hashKey, pendingUserMessage, pendingModelMessage, nowTs, userExtracted, modelExtracted, existingTopic, incomingBytes = 0, outgoingBytes = 0) {
    try {
      const sanitizeTrafficValue = (value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) {
          return 0;
        }
        return Math.floor(numeric);
      };

      const traffic = {
        inboundBytes: sanitizeTrafficValue(incomingBytes),
        outboundBytes: sanitizeTrafficValue(outgoingBytes)
      };

      const userOptions = {
        ...(pendingUserMessage.options || {}),
        traffic
      };

      // 保存用户消息
      const userResult = createOrAppendMessage(
        clientIP,
        hashKey,
        pendingUserMessage.messageData,
        userOptions
      );
      if (!userResult) {
        logger.error('保存用户消息失败');
        return null;
      }

      // 保存模型消息
      const modelResult = createOrAppendMessage(clientIP, hashKey, pendingModelMessage.messageData);
      if (!modelResult) {
        logger.error('保存模型消息失败');
        return null;
      }

      // 获取话题ID
      const topicId = userResult.topicMeta?.topicId || modelResult.topicMeta?.topicId;
      if (!topicId) {
        logger.error('无法获取话题ID');
        return null;
      }

      // 获取 systemInstruction (从 pendingUserMessage 的 options 中)
      const systemInstruction = pendingUserMessage.options?.systemInstruction || null;

      // 计算并更新话题链式哈希
      const updateTimestamp = pendingModelMessage.messageData?.meta?.createdAt ?? pendingUserMessage.messageData?.meta?.createdAt ?? nowTs;
      const effectiveUpdatedAt = this.updateTopicHash(
        topicId,
        userExtracted,
        modelExtracted,
        existingTopic,
        systemInstruction,
        updateTimestamp
      ) ?? updateTimestamp;

      if (userResult.topicMeta) {
        userResult.topicMeta.updatedAt = effectiveUpdatedAt;
      }
      if (userResult.topic) {
        userResult.topic.updatedAt = effectiveUpdatedAt;
      }
      if (modelResult?.topicMeta) {
        modelResult.topicMeta.updatedAt = effectiveUpdatedAt;
      }
      if (modelResult?.topic) {
        modelResult.topic.updatedAt = effectiveUpdatedAt;
      }

      // 更新时间戳
      this.lastModelRequestAt.set(clientIP, effectiveUpdatedAt);
      if (effectiveUpdatedAt > this.lastGlobalMessageAt) {
        this.lastGlobalMessageAt = effectiveUpdatedAt;
      }

      return {
        topicMeta: userResult.topicMeta,
        topic: userResult.topic,
        modelMessageId: pendingModelMessage.messageData.id,
        updatedAt: effectiveUpdatedAt
      };

    } catch (error) {
      logger.error('保存完整对话时出错', { error: error.message, stack: error.stack });
      return null;
    }
  }

  /**
   * 更新话题的链式哈希(在话题级别计算)
   * 注意: 需要传入 systemInstruction 以便首次计算时从正确的初始值开始
   */
  updateTopicHash(topicId, userExtracted, modelExtracted, existingTopic, systemInstruction = null, updatedAtOverride = null) {
    try {
      const database = db;
      
      // 获取当前话题的哈希值
      const topic = database.prepare('SELECT topic_hash_no_reasoning FROM topics WHERE topic_id = ?').get(topicId);
      if (!topic) {
        logger.error('无法找到话题', { topicId });
        return null;
      }

      // 提取用户消息内容用于哈希
      let userText = userExtracted.bodyText || '';
      const userAttHashes = [];
      if (Array.isArray(userExtracted.attachments)) {
        for (const att of userExtracted.attachments) {
          if (att.data) {
            try {
              userAttHashes.push(crypto.createHash('sha1').update(att.data).digest('hex'));
            } catch {}
          }
        }
      }
      // 提取模型消息内容用于哈希
      let modelText = modelExtracted.bodyText || '';
      const modelAttHashes = [];
      if (Array.isArray(modelExtracted.attachments)) {
        for (const att of modelExtracted.attachments) {
          if (att.data) {
            try {
              modelAttHashes.push(crypto.createHash('sha1').update(att.data).digest('hex'));
            } catch {}
          }
        }
      }
      // 获取当前话题的累积哈希
      let chainedHash = topic.topic_hash_no_reasoning || '';
      
      logger.debug('[话题哈希更新] 读取数据库哈希', {
        topicId,
        dbHash: topic.topic_hash_no_reasoning,
        chainedHashBefore: chainedHash || '(empty)',
        hasSystemInstruction: !!systemInstruction,
        systemInstructionType: typeof systemInstruction,
        systemInstructionPreview: systemInstruction ? (typeof systemInstruction === 'string' ? systemInstruction.slice(0, 60) : JSON.stringify(systemInstruction).slice(0, 60)) : null
      });
      
      // 如果是新话题(哈希为空)且有systemInstruction,从systemInstruction哈希开始
      if (!chainedHash && systemInstruction) {
        // systemInstruction 在这里已经是字符串格式
        const sysText = typeof systemInstruction === 'string' ? systemInstruction : this.extractSystemInstructionText(systemInstruction);
        if (sysText) {
          chainedHash = crypto.createHash('sha1').update(sysText).digest('hex');
        } else {
          logger.warn('[话题哈希更新] ⚠️ systemInstruction 存在但提取文本失败', {
            systemInstructionType: typeof systemInstruction,
            systemInstructionValue: systemInstruction
          });
        }
      } else {
        logger.debug('[话题哈希更新] 跳过系统提示词初始化', {
          reason: chainedHash ? '哈希已存在(追加模式)' : 'systemInstruction为空',
          chainedHashExists: !!chainedHash,
          hasSystemInstruction: !!systemInstruction
        });
      }
      
      logger.debug('[话题哈希更新] 开始累积新消息', {
        topicId,
        initialHashFull: chainedHash || '(empty)',
      });

      // 计算用户消息的内容哈希
      const userContent = `user:${userText}:${userAttHashes.join(',')}`;
      const userHash = crypto.createHash('sha1').update(userContent).digest('hex');
      const prevHashBeforeUser = chainedHash;
      // 累积：newHash = hash(prevHash + userHash)
      chainedHash = crypto.createHash('sha1').update(prevHashBeforeUser + userHash).digest('hex');
      
      logger.debug('[话题哈希更新] 用户消息累积', {
        userAttachmentCount: userAttHashes.length,
        userHashFull: userHash,
        prevHashFull: prevHashBeforeUser || '(empty)',
        newHashFull: chainedHash,
        formula: `hash("${prevHashBeforeUser.slice(0, 8)}" + "${userHash.slice(0, 8)}") = "${chainedHash.slice(0, 8)}"`
      });

      // 计算模型消息的内容哈希
      const modelContent = `model:${modelText}:${modelAttHashes.join(',')}`;
      const modelHash = crypto.createHash('sha1').update(modelContent).digest('hex');
      const prevHashBeforeModel = chainedHash;
      // 继续累积：newHash = hash(prevHash + modelHash)
      chainedHash = crypto.createHash('sha1').update(prevHashBeforeModel + modelHash).digest('hex');
      
      logger.debug('[话题哈希更新] 模型消息累积', {
        modelAttachmentCount: modelAttHashes.length,
        modelHashFull: modelHash,
        prevHashFull: prevHashBeforeModel,
        newHashFull: chainedHash,
        formula: `hash("${prevHashBeforeModel.slice(0, 8)}" + "${modelHash.slice(0, 8)}") = "${chainedHash.slice(0, 8)}"`
      });

      const newHash = chainedHash;

      // 更新话题哈希
      const resolvedUpdatedAt = typeof updatedAtOverride === 'number' ? updatedAtOverride : Date.now();

      database.prepare(`
        UPDATE topics 
        SET topic_hash_no_reasoning = ?, updated_at = ?
        WHERE topic_id = ?
      `).run(newHash, resolvedUpdatedAt, topicId);

      logger.info('[话题哈希] 更新话题链式哈希', { 
        topicId, 
        hash: newHash.slice(0, 16)
      });

      return resolvedUpdatedAt;

    } catch (error) {
      logger.error('更新话题哈希失败', { topicId, error: error.message });
      return null;
    }
  }

  /**
   * 提取 systemInstruction 的文本内容
   */
  extractSystemInstructionText(systemInstruction) {
    if (!systemInstruction) return null;
    
    // 如果已经是字符串
    if (typeof systemInstruction === 'string') {
      return systemInstruction;
    }
    
    // 如果是对象且有 parts 数组
    if (systemInstruction.parts && Array.isArray(systemInstruction.parts)) {
      return systemInstruction.parts
        .filter(p => p && p.text)
        .map(p => p.text)
        .join('\n');
    }
    
    return null;
  }

  /**
   * 深度克隆响应数据，处理 BigInt 与循环引用
   */
  safeCloneForMeta(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    const seen = new WeakSet();
    try {
      const cloned = JSON.parse(JSON.stringify(value, (_key, val) => {
        if (typeof val === 'bigint') {
          return val.toString();
        }
        if (typeof val === 'object' && val !== null) {
          if (seen.has(val)) {
            return '[Circular]';
          }
          seen.add(val);
        }
        return val;
      }));
      return cloned;
    } catch (error) {
      logger.warn('模型元数据克隆失败，将返回字符串化结果', { error: error.message });
      try {
        return JSON.parse(JSON.stringify(String(value)));
      } catch {
        return String(value);
      }
    }
  }

  /**
   * 获取统计数据
   */
  getStats() {
    return {
      totalRequests: this.totalRequests,
      totalIncomingTraffic: this.totalIncomingTraffic,
      totalOutgoingTraffic: this.totalOutgoingTraffic,
      requestsPerIP: this.requestsPerIP,
      incomingTrafficPerIP: this.incomingTrafficPerIP,
      outgoingTrafficPerIP: this.outgoingTrafficPerIP,
      requestLogsByIP: this.requestLogsByIP,
      lastModelRequestAt: this.lastModelRequestAt,
      lastGlobalMessageAt: this.lastGlobalMessageAt
    };
  }

  /**
   * 清除指定IP的统计缓存
   */
  clearIPStats(ip) {
    if (!ip) return;

    this.requestsPerIP.delete(ip);
    this.incomingTrafficPerIP.delete(ip);
    this.outgoingTrafficPerIP.delete(ip);
    this.requestLogsByIP.delete(ip);
    this.lastModelRequestAt.delete(ip);

    // 重新计算全局最后消息时间
    let maxTs = 0;
    for (const ts of this.lastModelRequestAt.values()) {
      if (typeof ts === 'number' && ts > maxTs) {
        maxTs = ts;
      }
    }
    this.lastGlobalMessageAt = maxTs;
  }

  /**
   * 保存IP映射
   */
  saveIPMapping(displayIP, realIP) {
    try {
      const { saveIPMapping } = require('../storage');
      saveIPMapping(displayIP, realIP);
      logger.debug('IP映射保存成功', { displayIP, realIP });
    } catch (error) {
      logger.error('保存IP映射失败', { displayIP, realIP, error: error.message });
    }
  }

  /**
   * 获取真实IP列表
   */
  getRealIPs(displayIP) {
    try {
      const { getRealIPs } = require('../storage');
      return getRealIPs(displayIP);
    } catch (error) {
      logger.error('获取真实IP列表失败', { displayIP, error: error.message });
      return [displayIP];
    }
  }

  /**
   * 获取真实IP
   */
  getRealIP(displayIP) {
    try {
      const { getRealIP } = require('../storage');
      return getRealIP(displayIP);
    } catch (error) {
      logger.error('获取真实IP失败', { displayIP, error: error.message });
      return displayIP;
    }
  }
}

module.exports = MessageProcessor;
