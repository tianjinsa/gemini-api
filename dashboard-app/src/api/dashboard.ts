import { dashboardHttpClient } from './httpClient';
import type {
  AliasKeysResponse,
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
  SimpleOkResponse,
  TopicMessagesResponse,
  TopicsResponse,
  UnbanIpPayload
} from '@/types';

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
