export interface StatsBase {
  totReqs: number;
  totInTfc: number;
  totOutTfc: number;
  ts: string;
  sTime: number;
  lGMsgAt: number | null;
}

export interface LightStatsResponse extends StatsBase {}

export interface IPStatSummary {
  ip: string;
  reqs: number;
  inTfc: number;
  outTfc: number;
  lTopUpdAt?: number;
  lModReqAt?: number;
  realIPs?: string[];
}

export interface FullStatsResponse extends StatsBase {
  ipStats: IPStatSummary[];
}

export interface GlobalDeltaIPChange {
  ip: string;
  ipUpdAt: number;
  reqs: number;
  inTfc: number;
  outTfc: number;
  realIPs?: string[];
}

export interface GlobalDeltaTopicChange {
  ip: string;
  tid: string;
  ctAt: number;
  upAt: number;
  msgCnt: number;
  inBytes: number;
  outBytes: number;
  title?: string | null;
}

export interface GlobalDeltaResponse {
  since: number;
  lGMsgAt: number | null;
  chgIPs: GlobalDeltaIPChange[];
  chgTop: GlobalDeltaTopicChange[];
}

export interface TopicSummary {
  tid: string;
  hKey: string;
  ctAt: number;
  upAt: number;
  msgCnt: number;
  inBytes: number;
  outBytes: number;
  status: 'completed' | 'pending' | 'failed' | string;
  hist: boolean;
  title?: string | null;
}

export interface TopicsResponse {
  topics: TopicSummary[];
}

export type MessageRole = 'user' | 'model' | 'system' | string;

// 附件功能已移除
export interface MessageAttachment {
  // 保留接口以兼容,但不再使用
}

export interface MessageTokens {
  pTokCnt?: number;
  candTokCnt?: number;
  totTokCnt?: number;
  thgtTokCnt?: number;
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  thoughtsTokenCount?: number;
  finishReason?: string | null;
  promptTokensDetails?: Array<{
    modality?: string;
    tokenCount?: number;
  }>;
}

export interface MessageMeta {
  ctAt?: number;
  path?: string;
  tokens?: MessageTokens;
  modelVer?: string;
  fHist?: boolean;
  isLReq?: boolean;
  realIP?: string;
  modelName?: string;
  model?: string;
  status?: number | string | null;
  statusText?: string | null;
  finishReason?: string | null;
  errMsg?: string | null;
  errStatus?: string | null;
  errCode?: string | number | null;
  hasErrDetails?: boolean;
}

// 重构后的消息实体
export interface MessageEntity {
  id: string;
  tid: string;
  ip: string;
  role: MessageRole;
  meta?: MessageMeta;
  ctAt?: number;
  // 用户消息包含请求信息
  reqUrl?: string | null;
  hasReqHeaders?: boolean | null;
  hasReqBody?: boolean | null;
}

export interface TopicMessagesResponse {
  msgs: MessageEntity[];
  total: number;
  topicHashNoReason?: string | null;
  topicHashWithReason?: string | null;
}

export interface MessageResponse extends MessageEntity {
  attStart?: number;
  attLimit?: number;
  totAtts?: number;
}

export interface MessageRequestBodyResponse {
  messageId: string;
  requestBody: unknown | null;
  rawRequestBody: string | null;
  ts: string | null;
  source: string | null;
  baseId: string | null;
  requestUrl: string | null;
}

export interface MessageRequestHeadersResponse {
  messageId: string;
  requestHeaders: Record<string, unknown> | null;
  rawRequestHeaders: string | null;
  ts: string | null;
  source: string | null;
  baseId: string | null;
  requestUrl: string | null;
}

export interface ModelErrorDetailsResponse {
  messageId: string;
  hasError: boolean;
  error: unknown | null;
}

export interface AttachmentTextResponse {
  file: string;
  offset: number;
  bytes: number;
  next: number | null;
  limit: number;
  total: number;
  chunk: string;
  done: boolean;
}

export interface BlockedIPEntry {
  ip: string;
  reason: string;
  unblockAt: number | null;
}

export interface BlockedIPsResponse {
  blocked: BlockedIPEntry[];
  now: number;
}

export interface AliasKeyEntry {
  aliasName: string;
  ctAt: number;
  upAt: number;
  firstUsedAt: number;
  usageCount: number;
}

export interface AliasKeysResponse {
  aliasKeys: AliasKeyEntry[];
}

export interface DeleteTopicsPayload {
  ip: string;
  topicIds: string[];
}

export interface DeleteIpPayload {
  ip: string;
}

export interface BanIpPayload {
  ip: string;
  durationMs?: number;
  reason?: string;
}

export interface UnbanIpPayload {
  ip: string;
}

export interface DeleteAliasKeyPayload {
  aliasName: string;
}

export interface SimpleOkResponse {
  ok: boolean;
  [extra: string]: unknown;
}

export interface DashboardBootstrapPayload extends StatsBase {
  ipStats: IPStatSummary[];
  aDashkey: string | null;
}

export type DashboardAPIError = {
  error: string;
  [key: string]: unknown;
};

