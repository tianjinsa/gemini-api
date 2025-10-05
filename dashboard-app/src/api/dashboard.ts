import { dashboardHttpClient } from './httpClient';
import type {
  AliasKeysResponse,
  AttachmentTextResponse,
  BanIpPayload,
  BlockedIPsResponse,
  DeleteAliasKeyPayload,
  DeleteIpPayload,
  DeleteTopicsPayload,
  FullStatsResponse,
  GlobalDeltaResponse,
  LightStatsResponse,
  ModelErrorDetailsResponse,
  MessageRequestBodyResponse,
  MessageRequestHeadersResponse,
  MessageResponse,
  SimpleOkResponse,
  TopicMessagesResponse,
  TopicsResponse,
  UnbanIpPayload
} from '@/types';
import { getApiBase, getDashboardToken } from '@/config';

export const fetchLightStats = () => dashboardHttpClient.get<LightStatsResponse>('/lightStats');

export const fetchFullStats = () => dashboardHttpClient.get<FullStatsResponse>('/fullStats');

export const fetchGlobalDelta = (since: number) =>
  dashboardHttpClient.get<GlobalDeltaResponse>('/globalDelta', {
    params: { since }
  });

export const fetchIPTopics = (ip: string) =>
  dashboardHttpClient.get<TopicsResponse>('/iptopics', { params: { ip } });

export const fetchTopicMessages = (
  ip: string,
  tid: string,
  options: { start?: number; limit?: number } = {}
) =>
  dashboardHttpClient.get<TopicMessagesResponse>('/topic', {
    params: {
      ip,
      tid,
      start: options.start,
      limit: options.limit
    }
  });

export const fetchMessage = (id: string) =>
  dashboardHttpClient.get<MessageResponse>('/message', {
    params: { id }
  });

export const fetchMessageRequestBody = (id: string) =>
  dashboardHttpClient.get<MessageRequestBodyResponse>('/messageRequestBody', {
    params: { id }
  });

export const fetchMessageRequestHeaders = (id: string) =>
  dashboardHttpClient.get<MessageRequestHeadersResponse>('/messageRequestHeaders', {
    params: { id }
  });

export const fetchModelErrorDetails = (id: string) =>
  dashboardHttpClient.get<ModelErrorDetailsResponse>('/modelError', {
    params: { id }
  });

export const fetchAttachment = async (file: string, signal?: AbortSignal) => {
  const token = getDashboardToken();
  const apiBase = getApiBase().replace(/\/$/, '');
  const url = `${apiBase}/attachment?file=${encodeURIComponent(file)}`;

  const response = await fetch(url, {
    method: 'GET',
    signal,
    headers: token ? { 'x-dashboard-token': token } : undefined,
    credentials: 'same-origin'
  });

  if (!response.ok) {
    throw new Error(`附件下载失败: ${response.status}`);
  }

  return response;
};

export const fetchAttachmentText = (file: string, opts: { offset?: number; limit?: number } = {}) =>
  dashboardHttpClient.get<AttachmentTextResponse>('/attachmentText', {
    params: {
      file,
      offset: opts.offset,
      limit: opts.limit
    }
  });

export const deleteTopics = (payload: DeleteTopicsPayload) =>
  dashboardHttpClient.post<SimpleOkResponse>('/deleteTopics', payload);

export const deleteIP = (payload: DeleteIpPayload) =>
  dashboardHttpClient.post<SimpleOkResponse>('/deleteIP', payload);

export const fetchBlockedIPs = () => dashboardHttpClient.get<BlockedIPsResponse>('/blockedIPs');

export const banIP = (payload: BanIpPayload) =>
  dashboardHttpClient.post<SimpleOkResponse>('/banIP', payload);

export const unbanIP = (payload: UnbanIpPayload) =>
  dashboardHttpClient.post<SimpleOkResponse>('/unbanIP', payload);

export const fetchAliasKeys = () => dashboardHttpClient.get<AliasKeysResponse>('/aliasKeys');

export const deleteAliasKey = (payload: DeleteAliasKeyPayload) =>
  dashboardHttpClient.post<SimpleOkResponse>('/deleteAliasKey', payload);

export const setDashboardToken = (token: string | null) => {
  dashboardHttpClient.setToken(token);
};
