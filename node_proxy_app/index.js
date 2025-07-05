// @ts-nocheck
const http = require('http');
const https = require('https');
const fs = require('fs').promises;
const path = require('path');
const WebSocket = require('ws');


// 限速配置常量
const RATE_LIMIT_MAX_REQUESTS = 10; // 每个时间窗口最大请求数
const RATE_LIMIT_WINDOW_MS = 60000; // 时间窗口（毫秒），60000ms = 1分钟

// IP 封禁配置
const blockedIPs = new Map(); // 存储被封禁的IP及其解封时间
const BLOCK_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7天

// 防火墙自动封禁配置
const blockedIPAttempts = new Map(); // 记录被封禁IP的尝试次数
const FIREWALL_BLOCK_THRESHOLD = 20; // 20次尝试后触发防火墙封禁
const FIREWALL_BLOCK_WINDOW_MS = 5 * 60 * 1000; // 5分钟的统计窗口

// API 请求超时配置
const API_REQUEST_TIMEOUT_MS = 60000; // 60秒

// 服务统计
let totalRequests = 0;
const requestsPerIP = new Map();
let totalTraffic = 0; // 单位：字节，基于 Content-Length
const trafficPerIP = new Map(); // 新增：记录每个IP的流量

// 定义敏感文件路径的正则表达式
const SENSITIVE_FILE_PATTERNS = [
  /\.log$/,
  /\.sql$/,
  /\.zip$/,
  /\.tar\.gz$/,
  /\.env$/,
  /^\/\.git/,
  /^\/\.svn/,
  /^\/\.DS_Store/,
  /backup/i,
  /dump/i,
  /database/i
];

// 检查是否为敏感文件路径
function isSensitivePath(path) {
  return SENSITIVE_FILE_PATTERNS.some(pattern => pattern.test(path));
}

// 引入安全模块
// const { PathDetector, ScanDetector, SecurityAuditLogger } = require("./core/security.js");

// 初始化安全组件
// const pathDetector = new PathDetector();
// const scanDetector = new ScanDetector();
// const securityLogger = new SecurityAuditLogger();

// 检查是否为敏感文件路径（使用安全模块）
// function isSensitivePath(path) {
//   return pathDetector.isSensitive(path);
// }

// 添加一个结构化日志工具
const logger = {
  log: (level, message, data) => {
    const timestamp = new Date().toISOString();
    const logData = data ? ` ${JSON.stringify(data)}` : '';
    console[level](`[${timestamp}] [${level.toUpperCase()}] ${message}${logData}`);
  },
  debug: (message, data) => logger.log('debug', message, data),
  info: (message, data) => logger.log('info', message, data),
  warn: (message, data) => logger.log('warn', message, data),
  error: (message, data) => logger.log('error', message, data),
};

// 添加限速功能
class RateLimiter {
  constructor(maxRequests = 20, windowMs = 60000) {
    this.requests = new Map();
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.suspiciousIPs = new Map();
  }

  isAllowed(clientId) {
    const now = Date.now();
    const requests = this.requests.get(clientId) || [];
    
    const validRequests = requests.filter(time => now - time < this.windowMs);
    
    if (validRequests.length >= this.maxRequests) {
      this.requests.set(clientId, validRequests);
      return false;
    }
    
    validRequests.push(now);
    this.requests.set(clientId, validRequests);
    return true;
  }

  getRemainingRequests(clientId) {
    const now = Date.now();
    const requests = this.requests.get(clientId) || [];
    const validRequests = requests.filter(time => now - time < this.windowMs);
    return Math.max(0, this.maxRequests - validRequests.length);
  }
  
  recordSuspiciousRequest(clientId) {
    const count = (this.suspiciousIPs.get(clientId) || 0) + 1;
    this.suspiciousIPs.set(clientId, count);
    
    if (count >= 3) {
      const requests = this.requests.get(clientId) || [];
      for (let i = 0; i < 5; i++) {
        requests.push(Date.now());
      }
      this.requests.set(clientId, requests);
      logger.warn('Enhanced rate limiting for suspicious IP', { clientId, suspiciousCount: count });
    }
  }
  
  isSuspicious(clientId) {
    return (this.suspiciousIPs.get(clientId) || 0) >= 3;
  }
}

const rateLimiter = new RateLimiter(RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);

async function handleWebSocket(req, res, clientIP) {
  try {
    const wss = new WebSocket.Server({ noServer: true });

    // 添加错误处理
    wss.on('error', (err) => {
      logger.error('WebSocket server error', { 
        error: {
          name: err.name,
          message: err.message,
          stack: err.stack
        }
      });
    });

    wss.on('connection', (clientWs, request) => {
      try {
        // 为每个WebSocket连接增加请求计数
        totalRequests++;
        requestsPerIP.set(clientIP, (requestsPerIP.get(clientIP) || 0) + 1);

        const url = new URL(request.url, `http://${request.headers.host}`);
        const targetUrl = `wss://generativelanguage.googleapis.com${url.pathname}${url.search}`;
        
        // 检查URL是否包含API密钥参数
        if (!url.search.includes('key=') && !request.headers['x-goog-api-key']) {
          logger.warn('WebSocket连接缺少API密钥', { pathname: url.pathname });
        }
        
        logger.info('WebSocket连接', { targetUrl });
        
        const pendingMessages = [];
        const targetWs = new WebSocket(targetUrl);
        
        // 添加连接超时处理
        const connectionTimeout = setTimeout(() => {
          if (targetWs.readyState !== WebSocket.OPEN) {
            logger.error('WebSocket连接超时', { url: targetUrl });
            targetWs.terminate();
            clientWs.close(1013, 'Connection timeout');
          }
        }, 15000); // 15秒连接超时
        
        targetWs.onopen = () => {
          clearTimeout(connectionTimeout);
          logger.info('已连接到Gemini WebSocket');
          pendingMessages.forEach(msg => {
            try {
              targetWs.send(msg);
            } catch (err) {
              logger.error('发送待处理消息时出错', { 
                error: {
                  name: err.name,
                  message: err.message
                }
              });
            }
          });
          pendingMessages.length = 0;
        };

        clientWs.on('message', (message) => {
          try {
            const messageSize = message.length;
            logger.debug('收到客户端消息', { size: messageSize });
            totalTraffic += messageSize;
            trafficPerIP.set(clientIP, (trafficPerIP.get(clientIP) || 0) + messageSize);
            if (targetWs.readyState === WebSocket.OPEN) {
              targetWs.send(message);
            } else if (targetWs.readyState === WebSocket.CONNECTING) {
              pendingMessages.push(message);
            } else {
              logger.warn('目标WebSocket未打开，丢弃客户端消息', { 
                readyState: targetWs.readyState 
              });
            }
          } catch (err) {
            logger.error('处理客户端消息时出错', { 
              error: {
                name: err.name,
                message: err.message,
                stack: err.stack
              }
            });
          }
        });

        targetWs.on('message', (message) => {
          try {
            const messageSize = message.length;
            logger.debug('收到Gemini消息', { size: messageSize });
            totalTraffic += messageSize;
            trafficPerIP.set(clientIP, (trafficPerIP.get(clientIP) || 0) + messageSize);
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(message);
            }
          } catch (err) {
            logger.error('转发Gemini消息时出错', { 
              error: {
                name: err.name,
                message: err.message,
                stack: err.stack
              }
            });
          }
        });

        clientWs.on('close', (code, reason) => {
          try {
            logger.info('客户端连接已关闭', { code, reason: reason ? reason.toString() : '' });
            clearTimeout(connectionTimeout);
            if (targetWs.readyState === WebSocket.OPEN) {
              targetWs.close(code, reason ? reason.toString() : '');
            } else if (targetWs.readyState !== WebSocket.CLOSED) {
              targetWs.terminate();
            }
          } catch (err) {
            logger.error('处理客户端关闭时出错', { 
              error: {
                name: err.name,
                message: err.message
              }
            });
          }
        });

        targetWs.on('close', (code, reason) => {
          try {
            logger.info('Gemini连接已关闭', { code, reason: reason ? reason.toString() : '' });
            clearTimeout(connectionTimeout);
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.close(code, reason ? reason.toString() : '');
            } else if (clientWs.readyState !== WebSocket.CLOSED) {
              clientWs.terminate();
            }
          } catch (err) {
            logger.error('处理目标关闭时出错', { 
              error: {
                name: err.name,
                message: err.message
              }
            });
          }
        });

        clientWs.on('error', (err) => {
          logger.error('Client WebSocket error', { 
            error: {
              name: err.name,
              message: err.message,
              stack: err.stack
            }
          });
          clearTimeout(connectionTimeout);
          if (targetWs.readyState !== WebSocket.CLOSED) {
            targetWs.terminate();
          }
        });

        targetWs.on('error', (err) => {
          logger.error('Gemini WebSocket error', { 
            error: {
              name: err.name,
              message: err.message,
              stack: err.stack
            }
          });
          clearTimeout(connectionTimeout);
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.close(1011, 'Target WebSocket error');
          }
        });
      } catch (err) {
        logger.error('WebSocket connection handling error', { 
          error: {
            name: err.name,
            message: err.message,
            stack: err.stack
          }
        });
        clientWs.close(1011, 'Internal server error');
      }
    });

    wss.handleUpgrade(req, req.socket, Buffer.alloc(0), (clientWs) => {
      try {
        wss.emit('connection', clientWs, req);
      } catch (err) {
        logger.error('WebSocket升级期间出错', { 
          error: {
            name: err.name,
            message: err.message,
            stack: err.stack
          }
        });
        clientWs.close(1011, 'Upgrade error');
      }
    });
  } catch (err) {
    logger.error('WebSocket处理程序错误', { 
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack
      }
    });
    // 如果WebSocket初始化失败，以HTTP错误响应
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json;charset=UTF-8' });
      res.end(JSON.stringify({ error: 'WebSocket initialization failed', status: 500 }));
    }
  }
}

async function handleAPIRequest(req, res, clientIP) {
  try {
    // 增加统计数据
    totalRequests++;
    requestsPerIP.set(clientIP, (requestsPerIP.get(clientIP) || 0) + 1);
    const requestSize = parseInt(req.headers['content-length'] || '0', 10);
    totalTraffic += requestSize;
    trafficPerIP.set(clientIP, (trafficPerIP.get(clientIP) || 0) + requestSize);

    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    const authHeader = req.headers['authorization'];
    const isOpenAI = path.startsWith('/v1beta/openai/') || !!authHeader;
    
    let suffix = path;
    if (path.startsWith('/v1beta/openai')) {
      suffix = path.substring('/v1beta/openai'.length);
    } else if (path.startsWith('/v1beta')) {
      suffix = path.substring('/v1beta'.length);
    }
    const prefix = isOpenAI ? '/v1beta/openai' : '/v1beta';
    const targetPath = prefix + suffix;

    // 新增逻辑：自动将URL中的key参数移到header
    const apiKeyInUrl = url.searchParams.get('key');
    if (apiKeyInUrl) {
      if (!req.headers['x-goog-api-key'] && !req.headers['authorization']) {
        req.headers['x-goog-api-key'] = apiKeyInUrl;
      }
      //url.searchParams.delete('key'); // 从URL中移除，避免重复或泄露
    }

    const targetUrl = `https://generativelanguage.googleapis.com${targetPath}${url.search}`;
    // API请求日志移动到主处理器中，此处不再重复记录

    // 处理 OPTIONS 请求，支持 CORS
    if (req.method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Goog-Api-Key',
        'Access-Control-Max-Age': '86400'
      });
      res.end();
      return;
    }

    const options = {
      method: req.method,
      headers: { ...req.headers },
    };
    
    // 移除可能导致问题的header
    delete options.headers.host;
    delete options.headers.connection;
    
    // 检查是否有API密钥头或URL参数，没有的话可能会出错
    if (!options.headers['x-goog-api-key'] && !options.headers.authorization && !url.searchParams.has('key')) {
      logger.warn('API请求缺少身份验证', { path: req.url });
      // 继续请求，让Google API返回适当的错误
    }

    const proxyReq = https.request(targetUrl, options);

    // 设置超时处理，避免请求无限挂起
    proxyReq.setTimeout(API_REQUEST_TIMEOUT_MS, () => {
      proxyReq.destroy(new Error(`Request timeout after ${API_REQUEST_TIMEOUT_MS / 1000}s`));
    });

    proxyReq.on('response', (proxyRes) => {
      try {
        // 直接使用 Google 的原始响应头和状态码
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        
        let responseSize = 0;
        proxyRes.on('data', (chunk) => {
          responseSize += chunk.length;
        });
        proxyRes.on('end', () => {
          totalTraffic += responseSize;
          trafficPerIP.set(clientIP, (trafficPerIP.get(clientIP) || 0) + responseSize);
        });

        // 处理响应流错误
        proxyRes.on('error', (err) => {
          logger.error('代理响应流中出错', { 
            error: {
              name: err.name,
              message: err.message,
              stack: err.stack
            } 
          });
          // 如果头部已经发送，我们无法发送错误状态码
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json;charset=UTF-8' });
            res.end(JSON.stringify({ error: 'Error in proxy response', status: 502 }));
          } else {
            res.end();
          }
        });
        
        proxyRes.pipe(res);
      } catch (err) {
        logger.error('处理代理响应时出错', { 
          error: {
            name: err.name,
            message: err.message,
            stack: err.stack
          }
        });
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json;charset=UTF-8' });
          res.end(JSON.stringify({ error: err.message, status: 500 }));
        }
      }
    });

    proxyReq.on('error', (err) => {
      logger.error('API请求错误', { 
        error: {
          name: err.name,
          message: err.message,
          stack: err.stack
        } 
      });
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json;charset=UTF-8' });
        res.end(JSON.stringify({ error: err.message, status: 502 }));
      }
    });

    // 处理原始请求的错误
    req.on('error', (err) => {
      logger.error('客户端请求流中出错', { 
        error: {
          name: err.name,
          message: err.message,
          stack: err.stack
        }
      });
      proxyReq.destroy(err);
    });

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      req.pipe(proxyReq);
    } else {
      proxyReq.end();
    }

  } catch (err) {
    logger.error('API请求处理错误', { 
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack
      }
    });
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json;charset=UTF-8' });
      res.end(JSON.stringify({ error: err.message, status: 500 }));
    }
  }
}

async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const clientIP = getClientIP(req);

    // 在处理前记录请求信息
    logger.info('收到请求', { clientIP, path: url.pathname+url.search});
    // 1. 检查IP是否在封禁列表中
    const unblockTime = blockedIPs.get(clientIP);
    if (unblockTime && Date.now() < unblockTime) {
      logger.warn('阻止被封禁IP的请求', { clientIP, url: req.url });

      // 检查是否需要升级到防火墙封禁
      const now = Date.now();
      const attempts = blockedIPAttempts.get(clientIP) || [];
      const validAttempts = attempts.filter(time => now - time < FIREWALL_BLOCK_WINDOW_MS);
      validAttempts.push(now);
      blockedIPAttempts.set(clientIP, validAttempts);

      if (validAttempts.length >= FIREWALL_BLOCK_THRESHOLD) {
        logger.error('检测到持续攻击，建议使用 fail2ban 等工具自动封禁IP', { clientIP });
        // 清除记录，防止在日志中重复报告相同的IP
        blockedIPAttempts.delete(clientIP);
      }

      // 不返回任何信息，直接销毁socket，让攻击方请求超时
      req.socket.destroy();
      return;
    } else if (unblockTime) {
      // 如果封禁时间已过，则解封
      blockedIPs.delete(clientIP);
      blockedIPAttempts.delete(clientIP); // 同时清除尝试记录
    }

    

    
    // 2. 添加健康检查端点
    if (url.pathname === '/health' || url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json;charset=UTF-8' });
      res.end(JSON.stringify({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        totalRequests,
        totalTrafficInKB: (totalTraffic / 1024).toFixed(3),
        ipStats: Object.fromEntries(Array.from(requestsPerIP.keys()).map(ip => [
          ip,
          `${requestsPerIP.get(ip) || 0} 次, ${((trafficPerIP.get(ip) || 0) / 1024).toFixed(3)} KB`
        ]))
      }));
      return;
    }

    // 3. 忽略 /favicon.ico 请求
    if (url.pathname === '/favicon.ico') {
      req.socket.destroy();
      return;
    }

    // 4. 增加统计数据 - 这部分逻辑已移至 handleAPIRequest 和 handleWebSocket
    
    if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') {
      handleWebSocket(req, res, clientIP);
      return;
    }

    if (!rateLimiter.isAllowed(clientIP)) {
      const isSuspicious = rateLimiter.isSuspicious(clientIP);
      const retryAfter = isSuspicious ? 
        300 : 
        Math.ceil(rateLimiter.getRemainingRequests(clientIP) / 20);
      
      logger.warn('超出速率限制', { 
        clientIP, 
        suspicious: isSuspicious,
        retryAfter
      });
      
      res.writeHead(429, { 
        'Content-Type': 'application/json;charset=UTF-8',
        'Retry-After': retryAfter.toString(),
      });
      res.end(JSON.stringify({ error: 'Too Many Requests', status: 429 }));
      return;
    }
    
    if (url.pathname.startsWith('/v1beta') || req.headers['authorization'] || req.headers['x-goog-api-key']) {
      handleAPIRequest(req, res, clientIP);
      return;
    }

    // 对于所有其他请求，视为非法访问并封禁IP
    logger.error('无效路径访问尝试，正在封禁IP', { clientIP, path: url.pathname });
    blockedIPs.set(clientIP, Date.now() + BLOCK_DURATION_MS);
    // 不返回任何信息，直接销毁socket，让攻击方请求超时
    req.socket.destroy();

  } catch (err) {
    // 处理URL解析或其他前期处理错误
    logger.error('请求处理程序错误', { 
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack
      }
    });
    
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json;charset=UTF-8' });
      res.end(JSON.stringify({ error: 'Internal Server Error', status: 500 }));
    }
    return;
  }
}

function getClientIP(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  const realIP = req.headers['x-real-ip'];
  if (realIP) {
    return realIP;
  }
  return req.socket.remoteAddress;
}

const PORT = process.env.PORT || 3000;

const server = http.createServer(handleRequest);

// 添加服务器级别的错误处理
server.on('error', (err) => {
  logger.error('服务器错误：', { error: err });
  // 在生产环境中可能需要尝试重启服务器
});

// 处理未捕获的异常，防止应用崩溃
process.on('uncaughtException', (err) => {
  // 改进错误日志记录，确保包含完整的错误信息
  logger.error('未捕获的异常：', { 
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack
    }
  });
  
  // 生产环境可能需要重启应用，但我们保持服务运行
  // 可以在这里添加告警通知逻辑，如发送邮件等
});

// 处理未处理的Promise拒绝
process.on('unhandledRejection', (reason, promise) => {
  // 未处理的Promise拒绝也可能导致应用不稳定
  logger.error('未处理的Promise拒绝：', { 
    error: reason instanceof Error ? {
      name: reason.name,
      message: reason.message,
      stack: reason.stack
    } : reason
  });
});

server.listen(PORT, () => {
  logger.info(`服务器正在 http://localhost:${PORT} 上运行`);
});