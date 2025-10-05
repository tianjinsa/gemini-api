/**
 * 结构化日志工具
 * 提供统一的日志记录格式，支持二级分类和debug开关
 */

// 从环境变量读取debug开关，默认为false
const DEBUG_ENABLED = process.env.DEBUG === '1' || process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

const logger = {
  log: (level, message, data, category = '内部处理') => {
    // debug级别的日志需要检查开关
    if (level === 'debug' && !DEBUG_ENABLED) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logData = data ? ` ${JSON.stringify(data)}` : '';
    const categoryStr = category ? `[${category}]` : '';

    // 定义颜色
    let colorStart = '';
    let colorEnd = '\x1b[0m';
    switch (level) {
      case 'warn':
        colorStart = '\x1b[33m'; // 黄色
        break;
      case 'info':
        colorStart = '\x1b[37m'; // 白色
        break;
      case 'debug':
        colorStart = '\x1b[32m'; // 绿色
        break;
      case 'error':
        colorStart = '\x1b[31m'; // 红色
        break;
      default:
        colorStart = '';
    }

    const logMsg = `[${timestamp}] [${level.toUpperCase()}] ${categoryStr} ${message}${logData}`;
    // 仅在支持颜色的终端下输出颜色
    if (colorStart || process.stdout.isTTY) {
      console[level](`${colorStart}${logMsg}${colorEnd}`);
    } else {
      console[level](logMsg);
    }
  },
  
  debug: (message, data, category = '内部处理') => logger.log('debug', message, data, category),
  info: (message, data, category = '内部处理') => logger.log('info', message, data, category),
  warn: (message, data, category = '内部处理') => logger.log('warn', message, data, category),
  error: (message, data, category = '内部处理') => logger.log('error', message, data, category),
  
  // 专门的网络请求日志方法
  net: {
    debug: (message, data) => logger.log('debug', message, data, 'NET请求'),
    info: (message, data) => logger.log('info', message, data, 'NET请求'),
    warn: (message, data) => logger.log('warn', message, data, 'NET请求'),
    error: (message, data) => logger.log('error', message, data, 'NET请求'),
  },
  
  // 检查debug是否启用
  isDebugEnabled: () => DEBUG_ENABLED
};

module.exports = logger;
