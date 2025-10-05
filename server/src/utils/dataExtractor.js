/**
 * 数据提取工具
 * 处理Gemini API请求/响应的数据提取和解析
 */

/**
 * 处理内联数据
 */
function processInlineData(part, addAttachment) {
  // 处理 camelCase 格式
  if (part.inlineData && part.inlineData.data && part.inlineData.mimeType) {
    addAttachment(part.inlineData.mimeType, part.inlineData.data, part.fileName);
  }
  // 处理 snake_case 格式
  if (part.inline_data && part.inline_data.data && part.inline_data.mime_type) {
    addAttachment(part.inline_data.mime_type, part.inline_data.data, part.fileName);
  }
}

/**
 * 处理单个 part 的思考和文本内容
 */
function processPart(part, thoughts, texts, addAttachment) {
  if (!part || typeof part !== 'object') return;

  // 处理思考内容
  if (isReasoningPart(part) && typeof part.text === 'string') {
    thoughts.push(part.text);
  } else if (typeof part.thought === 'string' && !isReasoningPart(part)) {
    thoughts.push(part.thought);
  }
  
  // 处理普通文本
  if (part.text && typeof part.text === 'string' && !isReasoningPart(part)) {
    texts.push(part.text);
  }
  
  // 处理内联数据
  processInlineData(part, addAttachment);
}

/**
 * 从 Gemini 响应中提取附件和思考内容
 */
const crypto = require('crypto');

// 全局常量
const MAX_RECORD_SIZE = 50 * 1024 * 1024;          // 单条请求/响应截取上限
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;     // 单个附件最大 50MB
const ATTACHMENT_MAX_COUNT = 100;                  // 单条消息最多提取附件数
const ALLOWED_MIME = [
  'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp',
  'text/plain', 'application/json'
];

function isReasoningPart(part) {
  if (!part || typeof part !== 'object') return false;
  if (part.thought === true || part.thought === 'true' || part.thought === 1) return true;
  if (part.reasoning === true || part.reason === true) return true;
  if (part.metadata && typeof part.metadata === 'object') {
    if (part.metadata.thought === true || part.metadata.reasoning === true) return true;
    if (typeof part.metadata.type === 'string' && part.metadata.type.toLowerCase() === 'reasoning') return true;
  }
  return false;
}

/**
 * 安全的JSON解析
 */
function safeJSONParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * 从Gemini响应中提取附件和思考内容
 */
function extractAttachmentsAndReasoning(obj) {
  const result = {
    attachments: [],
    reasoning: null,
    bodyText: null,
    truncated: false
  };

  if (!obj) return result;

  const addAttachment = (mime, base64Data, name) => {
    if (!mime || !base64Data) return;
    if (result.attachments.length >= ATTACHMENT_MAX_COUNT) {
      result.truncated = true;
      return;
    }
    if (!ALLOWED_MIME.includes(mime)) return;

    try {
      const buffer = Buffer.from(base64Data, 'base64');
      if (buffer.length > MAX_ATTACHMENT_BYTES) {
        result.truncated = true;
        return;
      }
      result.attachments.push({
        mime,
        size: buffer.length,
        data: buffer,
        name: name || ('att_' + result.attachments.length)
      });
    } catch (error) {
      // 忽略解析错误
    }
  };

  let thoughts = [];
  let texts = [];

  // 递归解析节点
  const visitNode = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      return node.forEach(visitNode);
    }
    if (typeof node !== 'object') return;

    // 处理 contents 数组
    if (Array.isArray(node.contents)) {
      for (const content of node.contents) {
        if (Array.isArray(content.parts)) {
          content.parts.forEach(part => processPart(part, thoughts, texts, addAttachment));
        }
      }
    }

    // 处理单数 content.parts
    if (node.content && Array.isArray(node.content.parts)) {
      node.content.parts.forEach(part => processPart(part, thoughts, texts, addAttachment));
    }

    // 处理其他格式的内联数据
    processInlineData(node, addAttachment);
    
    if (node.mime_type && node.b64_json) {
      addAttachment(node.mime_type, node.b64_json, node.fileName);
    }
    if (node.type === 'image' && node.image && node.image.base64 && node.image.mime_type) {
      addAttachment(node.image.mime_type, node.image.base64, node.image.fileName);
    }

    // 递归处理子节点
    for (const key in node) {
      if (key !== 'contents') {
        visitNode(node[key]);
      }
    }
  };

  visitNode(obj);

  if (thoughts.length > 0) {
    result.reasoning = thoughts.join('\n\n---\n\n');
  }
  if (texts.length > 0) {
    result.bodyText = texts.join('\n');
  }

  return result;
}

/**
 * 哈希工具函数
 */
function hashBufferOrBase64(base64String) {
  try {
    return crypto.createHash('sha1').update(Buffer.from(base64String, 'base64')).digest('hex');
  } catch {
    return 'error';
  }
}

module.exports = {
  MAX_RECORD_SIZE,
  MAX_ATTACHMENT_BYTES,
  ATTACHMENT_MAX_COUNT,
  ALLOWED_MIME,
  safeJSONParse,
  isReasoningPart,
  extractAttachmentsAndReasoning,
  hashBufferOrBase64
};
