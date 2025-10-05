const STAT_KEY_MAP = {
  totalRequests: 'totReqs',
  totalIncomingTraffic: 'totInTfc',
  totalOutgoingTraffic: 'totOutTfc',
  timestamp: 'ts',
  startTime: 'sTime',
  lastGlobalMessageAt: 'lGMsgAt'
};

const IP_STAT_KEY_MAP = {
  requests: 'reqs',
  incomingTraffic: 'inTfc',
  outgoingTraffic: 'outTfc',
  lastTopicUpdatedAt: 'lTopUpdAt',
  lastModelRequestAt: 'lModReqAt'
};

const TOKEN_KEY_MAP = {
  promptTokenCount: 'pTokCnt',
  promptTokensCount: 'pTokCnt',
  candidatesTokenCount: 'candTokCnt',
  totalTokenCount: 'totTokCnt',
  totalTokensCount: 'totTokCnt',
  thoughtTokensCount: 'thgtTokCnt',
  thinkingTokenCount: 'thgtTokCnt'
};

function normalizePromptTokensDetails(details) {
  if (!Array.isArray(details) || !details.length) return undefined;
  const normalized = details
    .map(entry => {
      if (!entry || typeof entry !== 'object') return null;
      const modality = typeof entry.modality === 'string'
        ? entry.modality
        : typeof entry.type === 'string'
          ? entry.type
          : typeof entry.modalityType === 'string'
            ? entry.modalityType
            : undefined;

      let tokenCount = null;
      for (const key of ['tokenCount', 'tokens', 'count', 'tokenCounts']) {
        if (entry[key] === null || entry[key] === undefined) continue;
        const numeric = Number(entry[key]);
        if (Number.isFinite(numeric)) {
          tokenCount = numeric;
          break;
        }
      }

      const payload = {};
      if (modality !== undefined) payload.modality = modality;
      if (tokenCount !== null) payload.tokenCount = tokenCount;

      if (!Object.keys(payload).length) return null;
      return payload;
    })
    .filter(Boolean);

  return normalized.length ? normalized : undefined;
}

function pickMappedKeys(source, map) {
  if (!source || typeof source !== 'object') return {};
  const result = {};
  for (const [fromKey, toKey] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(source, fromKey)) {
      const value = source[fromKey];
      if (value !== undefined) {
        result[toKey] = value;
      }
    }
  }
  return result;
}

function mapStatsBase(stats, overrides = {}) {
  const payload = pickMappedKeys({ ...stats, ...overrides }, STAT_KEY_MAP);
  if (!('ts' in payload)) {
    payload.ts = new Date().toISOString();
  }
  if (!('sTime' in payload) && typeof stats?.startTime === 'number') {
    payload.sTime = stats.startTime;
  }
  if (!('lGMsgAt' in payload)) {
    payload.lGMsgAt = stats?.lastGlobalMessageAt ?? null;
  }
  return payload;
}

function mapIpStat(stat) {
  const result = pickMappedKeys(stat, IP_STAT_KEY_MAP);
  result.ip = stat.ip;
  if (Array.isArray(stat.realIPs) && stat.realIPs.length) {
    result.realIPs = stat.realIPs;
  }
  return result;
}

function mapIpStats(stats) {
  return stats.map(mapIpStat);
}

function mapTopicSummary(topic) {
  return {
    tid: topic.topicId,
    hKey: topic.hashKey,
    ctAt: topic.createdAt,
    upAt: topic.updatedAt,
    msgCnt: topic.messageCount,
    inBytes: topic.inboundBytes || 0,
    outBytes: topic.outboundBytes || 0,
    status: topic.status,
    hist: !!topic.historical,
    title: topic.displayName || null
  };
}

function mapTopics(topics) {
  return topics.map(mapTopicSummary);
}

function mapTokens(tokens) {
  if (!tokens || typeof tokens !== 'object') return undefined;
  const result = pickMappedKeys(tokens, TOKEN_KEY_MAP);
  if (tokens.finishReason !== undefined) {
    result.finishReason = tokens.finishReason;
  }

  const promptDetails = normalizePromptTokensDetails(
    tokens.promptTokensDetails
      ?? tokens.promptTokenDetails
      ?? tokens.prompt_tokens_details
  );
  if (promptDetails) {
    result.promptTokensDetails = promptDetails;
  }

  if (Object.keys(result).length === 0) {
    return undefined;
  }
  return result;
}

function mapMessageMeta(meta) {
  if (!meta || typeof meta !== 'object') return undefined;
  const mapped = {};

  if (meta.createdAt !== undefined) mapped.ctAt = meta.createdAt;
  if (meta.path !== undefined) mapped.path = meta.path;
  if (meta.modelVersion !== undefined) mapped.modelVer = meta.modelVersion;
  if (meta.modelName !== undefined) mapped.modelName = meta.modelName;
  if (meta.model !== undefined && mapped.modelVer === undefined) mapped.modelVer = meta.model;
  if (meta.status !== undefined) mapped.status = meta.status;
  if (meta.statusText !== undefined) mapped.statusText = meta.statusText;
  if (meta.finishReason !== undefined) mapped.finishReason = meta.finishReason;
  if (meta.errMsg !== undefined) mapped.errMsg = meta.errMsg;
  if (meta.errStatus !== undefined) mapped.errStatus = meta.errStatus;
  if (Object.prototype.hasOwnProperty.call(meta, 'errCode')) mapped.errCode = meta.errCode;
  if (Object.prototype.hasOwnProperty.call(meta, 'hasErrorDetails')) {
    mapped.hasErrDetails = !!meta.hasErrorDetails;
  }

  const tokens = mapTokens(meta.tokens);
  if (tokens) {
    mapped.tokens = tokens;
  }

  if (meta.fromHistory !== undefined) mapped.fHist = meta.fromHistory;
  if (meta.isLastRequest !== undefined) mapped.isLReq = meta.isLastRequest;
  if (meta.realIP !== undefined) mapped.realIP = meta.realIP;

  return mapped;
}

function mapMessageEntity(message) {
  const meta = mapMessageMeta(message.meta);
  const result = {
    id: message.id,
    tid: message.topicId || message.tid,
    ip: message.ip,
    role: message.role,
    meta
  };
  
  // 用户消息包含请求信息
  if (message.role === 'user') {
    result.reqUrl = message.requestUrl || null;
    const hasHeaders = message.hasRequestHeaders !== undefined
      ? message.hasRequestHeaders
      : message.requestHeaders;
    result.hasReqHeaders = !!hasHeaders;

    if (message.hasRequestBody !== undefined) {
      result.hasReqBody = !!message.hasRequestBody;
    } else if (message.requestBody !== undefined) {
      result.hasReqBody = !!message.requestBody;
    } else {
      result.hasReqBody = false;
    }
  }

  if (message.ctAt !== undefined) {
    result.ctAt = message.ctAt;
  } else if (meta && meta.ctAt !== undefined) {
    result.ctAt = meta.ctAt;
  }

  if (meta && meta.ctAt === undefined && result.ctAt !== undefined) {
    meta.ctAt = result.ctAt;
  }

  return result;
}

function mapTopicMessagesResponse({ topicId, ip, messages, total, topicHashNoReasoning }) {
  const mappedMessages = Array.isArray(messages)
    ? messages.map(msg => mapMessageEntity({
        id: msg.id,
        topicId,
        ip,
        role: msg.role,
        requestUrl: msg.requestUrl,
        hasRequestBody: msg.hasRequestBody,
        hasRequestHeaders: msg.hasRequestHeaders,
        meta: msg.meta,
        ctAt: msg.meta?.createdAt
      }))
    : [];

  const response = {
    msgs: mappedMessages,
    total: total ?? mappedMessages.length
  };

  // 添加话题级别的哈希
  if (topicHashNoReasoning !== undefined) {
    response.topicHashNoReason = topicHashNoReasoning;
  }

  return response;
}

function mapMessageDetailResponse(data) {
  return mapMessageEntity({
    id: data.id,
    topicId: data.topicId,
    ip: data.ip,
    role: data.role,
    requestUrl: data.requestUrl,
    hasRequestHeaders: data.hasRequestHeaders !== undefined
      ? data.hasRequestHeaders
      : !!data.requestHeaders,
    requestBody: data.requestBody,
    meta: data.meta,
    ctAt: data.createdAt ?? data.meta?.createdAt
  });
}

function mapGlobalDeltaResponse({ since, lastGlobalMessageAt, changedIPs, changedTopics }) {
  return {
    since,
    lGMsgAt: lastGlobalMessageAt ?? null,
    chgIPs: (Array.isArray(changedIPs) ? changedIPs : []).map(ipData => {
      const mapped = pickMappedKeys(ipData, {
        ipUpdatedAt: 'ipUpdAt',
        requests: 'reqs',
        incomingTraffic: 'inTfc',
        outgoingTraffic: 'outTfc'
      });
      mapped.ip = ipData.ip;
      if (Array.isArray(ipData.realIPs) && ipData.realIPs.length) {
        mapped.realIPs = ipData.realIPs;
      }
      return mapped;
    }),
    chgTop: (Array.isArray(changedTopics) ? changedTopics : []).map(topic => ({
      ip: topic.ip,
      tid: topic.topicId,
      ctAt: topic.createdAt,
      upAt: topic.updatedAt,
      msgCnt: topic.messageCount,
      inBytes: topic.inboundBytes || 0,
      outBytes: topic.outboundBytes || 0,
      title: topic.displayName ?? null
    }))
  };
}

function mapAliasKeysResponse(aliasKeys) {
  return {
    aliasKeys: Array.isArray(aliasKeys)
      ? aliasKeys.map(entry => ({
          aliasName: entry.aliasName,
          ctAt: entry.createdAt,
          upAt: entry.updatedAt,
          firstUsedAt: entry.firstUsedAt,
          usageCount: entry.usageCount
        }))
      : []
  };
}

function mapTopicsResponse(topics) {
  return { topics: mapTopics(topics) };
}

function mapStatsResponse(stats, overrides = {}) {
  return mapStatsBase(stats, overrides);
}

module.exports = {
  mapStatsResponse,
  mapIpStats,
  mapTopicsResponse,
  mapTopicMessagesResponse,
  mapMessageDetailResponse,
  mapGlobalDeltaResponse,
  mapAliasKeysResponse,
  mapStatsBase,
  mapTopicSummary,
  mapMessageMeta,
  mapMessageEntity,
  mapTokens,
  mapTopics
};
