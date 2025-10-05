/**
 * Gemini API代理处理器
 * 负责将客户端请求转发到Google Gemini API
 */

const https = require('https');
const logger = require('../utils/logger');
const { safeJSONParse, extractAttachmentsAndReasoning, MAX_RECORD_SIZE } = require('../utils/dataExtractor');

// API请求超时配置
const API_REQUEST_TIMEOUT_MS = 60000; // 60秒

class GeminiProxyHandler {
  constructor(messageProcessor) {
    this.messageProcessor = messageProcessor;
  }

  /**
   * 处理API代理请求
   */
  async handleAPIRequest(req, res, clientIP) {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const requestSize = parseInt(req.headers['content-length'] || '0', 10);

      // 检查是否有自定义名称和认证
      let displayIP = clientIP;
      let realIP = clientIP;
      const customName = req.headers['name'];
      const namekey = req.headers['namekey'];
      
      if (customName && namekey) {
        // 使用新的别名密钥验证系统
        const { validateOrCreateAliasKey } = require('../storage');
        const validation = validateOrCreateAliasKey(customName, namekey);
        
        if (validation.success) {
          displayIP = customName;
          realIP = clientIP;
          const action = validation.isNew ? '创建新别名' : '验证别名密钥成功';
          logger.net.info(action, { 
            customName, 
            realIP,
            isNew: validation.isNew,
            displayInfo: `${customName} (${realIP})`
          });
        } else {
          logger.net.warn('别名密钥验证失败', {
            customName,
            clientIP,
            reason: validation.reason,
            providedKey: namekey ? '[PROVIDED]' : '[MISSING]'
          });
          // 密钥验证失败时，仍使用真实IP，但记录警告
        }
      }

      // 记录流量统计
      this.messageProcessor.recordIncomingTraffic(displayIP, requestSize);

      // 先构建请求选项（会从 URL 中读取 key 并设置到 headers）
      const options = this.buildRequestOptions(req, url);
      // 再构建目标 URL（可能会从 url 中移除 key）
      const targetUrl = this.buildTargetUrl(url);
      
      // 处理OPTIONS请求（CORS预检）
      if (req.method === 'OPTIONS') {
        this.handleCORSPreflight(res);
        return;
      }

      // 检查认证
      if (!this.hasAuthentication(options.headers, url)) {
        logger.net.warn('API请求缺少身份验证', { path: req.url });
      }

      await this.forwardRequest(req, res, targetUrl, options, displayIP, realIP || displayIP);

    } catch (error) {
      logger.net.error('API请求处理错误', {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        }
      });

      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json;charset=UTF-8' });
        res.end(JSON.stringify({ error: error.message, status: 500 }));
      }
    }
  }

  /**
   * 构建目标URL
   */
  buildTargetUrl(url) {
    const reqPath = url.pathname;
    let suffix = reqPath;
    
    // 判断是否为OpenAI兼容接口
    const isOpenAI = reqPath.startsWith('/v1beta/openai/') || reqPath.startsWith('/v1/');
    
    if (reqPath.startsWith('/v1beta/openai')) {
      suffix = reqPath.substring('/v1beta/openai'.length);
    } else if (reqPath.startsWith('/v1beta')) {
      suffix = reqPath.substring('/v1beta'.length);
    }

    const prefix = isOpenAI ? '/v1beta/openai' : '/v1beta';
    const targetPath = prefix + suffix;

    // 自动将URL中的key参数移到header处理
    const apiKeyInUrl = url.searchParams.get('key');
    if (apiKeyInUrl) {
      url.searchParams.delete('key');
    }

    return `https://generativelanguage.googleapis.com${targetPath}${url.search}`;
  }

  /**
   * 构建请求选项
   */
  buildRequestOptions(req, url) {
    const options = {
      method: req.method,
      headers: { ...req.headers }
    };

    // 处理URL中的API密钥
    const apiKeyInUrl = url.searchParams.get('key');
    if (apiKeyInUrl && !options.headers['x-goog-api-key'] && !options.headers['authorization']) {
      options.headers['x-goog-api-key'] = apiKeyInUrl;
    }

    // 移除可能导致问题的header
    delete options.headers.host;
    delete options.headers.connection;

    return options;
  }

  /**
   * 检查是否有认证信息
   */
  hasAuthentication(headers, url) {
    return !!(headers['x-goog-api-key'] || headers.authorization || url.searchParams.has('key'));
  }

  /**
   * 处理CORS预检请求
   */
  handleCORSPreflight(res) {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Goog-Api-Key',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
  }

  /**
   * 转发请求到Google API
   */
  async forwardRequest(req, res, targetUrl, options, displayIP, realIP) {
    const proxyReq = https.request(targetUrl, options);
    const requestBuffers = [];

    // 收集请求数据
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      req.on('data', chunk => {
        if (requestBuffers.reduce((sum, buf) => sum + buf.length, 0) <= MAX_RECORD_SIZE) {
          requestBuffers.push(chunk);
        }
      });
    }

    // 设置超时
    proxyReq.setTimeout(API_REQUEST_TIMEOUT_MS, () => {
      proxyReq.destroy(new Error(`Request timeout after ${API_REQUEST_TIMEOUT_MS / 1000}s`));
    });

    // 处理响应
    proxyReq.on('response', (proxyRes) => {
      this.handleProxyResponse(proxyRes, res, req, requestBuffers, displayIP, realIP);
    });

    // 处理请求错误
    proxyReq.on('error', (error) => {
      logger.net.error('API请求错误', {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        }
      });

      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json;charset=UTF-8' });
        res.end(JSON.stringify({ error: error.message, status: 502 }));
      }
    });

    // 处理客户端请求错误
    req.on('error', (error) => {
      logger.net.error('客户端请求流错误', {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        }
      });
      proxyReq.destroy(error);
    });

    // 转发请求体
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      req.pipe(proxyReq);
    } else {
      proxyReq.end();
    }
  }

  /**
   * 处理代理响应
   */
  handleProxyResponse(proxyRes, res, req, requestBuffers, displayIP, realIP) {
    try {
      // 转发响应头和状态码
      res.writeHead(proxyRes.statusCode, proxyRes.headers);

      let responseSize = 0;
      const responseBuffers = [];

      // 收集响应数据
      proxyRes.on('data', (chunk) => {
        responseSize += chunk.length;
        if (responseSize <= MAX_RECORD_SIZE) {
          responseBuffers.push(chunk);
        }
      });

      // 响应结束时处理
      proxyRes.on('end', () => {
        this.messageProcessor.recordOutgoingTraffic(displayIP, responseSize);
        this.processAndSaveMessage(req, requestBuffers, responseBuffers, displayIP, proxyRes, realIP, responseSize);
      });

      // 处理响应流错误
      proxyRes.on('error', (error) => {
        logger.net.error('代理响应流错误', {
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack
          }
        });

        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json;charset=UTF-8' });
          res.end(JSON.stringify({ error: 'Error in proxy response', status: 502 }));
        } else {
          res.end();
        }
      });

      // 转发响应流
      proxyRes.pipe(res);

    } catch (error) {
      logger.net.error('处理代理响应时出错', {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        }
      });

      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json;charset=UTF-8' });
        res.end(JSON.stringify({ error: error.message, status: 500 }));
      }
    }
  }

  /**
   * 处理和保存消息数据
   */
  processAndSaveMessage(req, requestBuffers, responseBuffers, displayIP, proxyRes, realIP, responseSize = 0) {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const userBuffer = Buffer.concat(requestBuffers);
      const modelBuffer = Buffer.concat(responseBuffers);
      
  const userContent = userBuffer.toString('utf8');
  const modelContent = modelBuffer.toString('utf8');

      // 解析JSON内容
      let userJson = safeJSONParse(userContent);
      let modelJson = safeJSONParse(modelContent);

      // 处理SSE流式响应
      if (!modelJson && /\n?data:\s*\{/.test(modelContent)) {
        modelJson = this.aggregateSSEResponse(modelContent);
      }

      // 过滤非模型调用请求
      if (!this.shouldRecordRequest(req, userJson)) {
        return;
      }

      // 提取附件和思考内容
      const userExtracted = extractAttachmentsAndReasoning(userJson);
      const modelExtracted = extractAttachmentsAndReasoning(modelJson);

      // 处理聚合SSE响应中的思考内容
      if (!modelExtracted.reasoning && modelJson && Array.isArray(modelJson.__thoughts)) {
        modelExtracted.reasoning = modelJson.__thoughts.join('\n\n---\n\n');
      }

      // 保存消息
      const reportedLength = Number(req.headers['content-length'] ?? 0);
      const incomingBytes = Number.isFinite(reportedLength) && reportedLength > 0
        ? reportedLength
        : userBuffer.length;

      this.saveConversation(
        displayIP,
        url,
        userJson,
        userExtracted,
        modelExtracted,
        proxyRes,
        modelJson,
        realIP,
        req.headers,
        incomingBytes,
        responseSize
      );

    } catch (error) {
      logger.net.error('处理和保存消息数据时出错', {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        }
      });
    }
  }

  /**
   * 聚合SSE流式响应
   */
  aggregateSSEResponse(content) {
    const aggregatedParts = [];
    const sseThoughts = [];
    let modelVersion = null;
    let usageMetadata = null;
    let finalFinishReason = null;

    content.split(/\r?\n/).forEach(line => {
      if (!line.startsWith('data:')) return;
      
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') return;

      try {
        const parsed = JSON.parse(payload);
        
        if (parsed.usageMetadata) usageMetadata = parsed.usageMetadata;

        const candidate = parsed.candidates && parsed.candidates[0];
        if (candidate) {
          if (!modelVersion && candidate.modelVersion) modelVersion = candidate.modelVersion;
          if (candidate.finishReason) finalFinishReason = candidate.finishReason;

          const parts = (candidate.content && Array.isArray(candidate.content.parts)) ? candidate.content.parts : [];
          parts.forEach(part => {
            if (part.thought === true && typeof part.text === 'string') {
              sseThoughts.push(part.text);
            } else if (typeof part.text === 'string' && !part.thought) {
              aggregatedParts.push({ text: part.text });
            }
          });
        }
      } catch (error) {
        // 忽略解析错误
      }
    });

    if (aggregatedParts.length || sseThoughts.length) {
      if (aggregatedParts.length > 1) {
        const combined = aggregatedParts.map(p => p.text || '').join('');
        aggregatedParts.splice(0, aggregatedParts.length, { text: combined });
      }

      const result = {
        candidates: [{
          content: { parts: aggregatedParts },
          modelVersion,
          finishReason: finalFinishReason
        }],
        usageMetadata
      };

      if (sseThoughts.length) {
        result.__thoughts = sseThoughts;
      }

      return result;
    }

    return null;
  }

  /**
   * 判断是否应该记录请求
   */
  shouldRecordRequest(req, userJson) {
    if (req.method !== 'POST') return false;

    const reqPath = new URL(req.url, `http://${req.headers.host}`).pathname;
    
    // 检查是否为生成类接口
    const generateLike = /generateContent|streamGenerateContent|embedContent|batchEmbedContents|countTokens|moderate/i.test(reqPath);
    const hasContentStruct = !!(userJson && (Array.isArray(userJson.contents) || Array.isArray(userJson.messages) || userJson.prompt || userJson.input));
    
    if (!generateLike && !hasContentStruct) {
      return false;
    }

    // 排除模型列表等GET请求
    if (/\/models(\b|\/|\?|$)/.test(reqPath) && req.method === 'GET') {
      return false;
    }

    return true;
  }

  /**
   * 保存对话数据
   */
  saveConversation(displayIP, url, userJson, userExtracted, modelExtracted, proxyRes, modelJson, realIP, headers, incomingBytes, outgoingBytes) {
    // 这里调用消息处理器来保存对话
    // 具体实现将在消息处理器中完成
    this.messageProcessor.saveConversation({
      clientIP: displayIP,
      realIP: realIP || displayIP,
      url,
      userJson,
      userExtracted,
      modelExtracted,
      proxyRes,
      modelJson,
      headers,
      incomingBytes,
      outgoingBytes
    });
  }
}

module.exports = GeminiProxyHandler;
