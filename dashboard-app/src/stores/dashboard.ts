import { computed, reactive, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { useEventListener, useIntervalFn, useStorage } from '@vueuse/core';
import {
  banIP,
  deleteAliasKey,
  deleteIP as apiDeleteIP,
  deleteTopics as apiDeleteTopics,
  fetchAliasKeys,
  fetchBlockedIPs,
  fetchFullStats,
  fetchGlobalDelta,
  fetchIPTopics,
  fetchLightStats,
  fetchMessageRequestBody,
  fetchMessageRequestHeaders,
  fetchModelErrorDetails,
  fetchTopicMessages,
  unbanIP,
  setDashboardToken
} from '@/api/dashboard';
import {
  type AliasKeysResponse,
  type AttachmentTextResponse,
  type BlockedIPsResponse,
  type DashboardBootstrapPayload,
  type IPStatSummary,
  type MessageRequestBodyResponse,
  type MessageRequestHeadersResponse,
  type MessageResponse,
  type ModelErrorDetailsResponse,
  type TopicMessagesResponse,
  type TopicSummary
} from '@/types';
import {
  DASHBOARD_POLL_INTERVAL_MS,
  getBootstrapPayload
} from '@/config';
import type { GlobalDeltaResponse, LightStatsResponse, MessageEntity } from '@/types';

export type IPSortKey = 'recent' | 'reqs' | 'in' | 'out';

interface IPEntry {
  summary: IPStatSummary;
  unread: boolean;
  dirtyTopics: boolean;
}

interface TopicCacheEntry {
  items: TopicSummary[];
  fetchedAt: number;
  dirty: boolean;
  unreadTopicIds: Set<string>;
}

interface MessageCacheEntry {
  items: MessageEntity[];
  total: number;
  fetchedAt: number;
  dirty: boolean;
  fullyLoaded: boolean;
  topicHashNoReason?: string | null;
  topicHashWithReason?: string | null;
}

interface MessageDetailCacheEntry {
  data: MessageResponse;
  fetchedAt: number;
}

interface MessageRequestBodyCacheEntry {
  data: MessageRequestBodyResponse;
  fetchedAt: number;
}

interface MessageRequestHeadersCacheEntry {
  data: MessageRequestHeadersResponse;
  fetchedAt: number;
}

interface AttachmentTextCacheEntry {
  data: AttachmentTextResponse;
  fetchedAt: number;
}

interface ModelErrorDetailsCacheEntry {
  data: ModelErrorDetailsResponse;
  fetchedAt: number;
}

export const useDashboardStore = defineStore('dashboard', () => {
  const initialized = ref(false);
  const stats = ref<LightStatsResponse | null>(null);
  const ipMap = reactive(new Map<string, IPEntry>());
  const topicsCache = reactive(new Map<string, TopicCacheEntry>());
  const messagesCache = reactive(new Map<string, MessageCacheEntry>());
  const messageDetailCache = reactive(new Map<string, MessageDetailCacheEntry>());
  const messageRequestBodyCache = reactive(new Map<string, MessageRequestBodyCacheEntry>());
  const messageRequestHeadersCache = reactive(new Map<string, MessageRequestHeadersCacheEntry>());
  const modelErrorCache = reactive(new Map<string, ModelErrorDetailsCacheEntry>());
  const attachmentTextCache = reactive(new Map<string, AttachmentTextCacheEntry>());

  const blockedIPs = ref<BlockedIPsResponse | null>(null);
  const aliasKeys = ref<AliasKeysResponse | null>(null);

  const selectedIp = useStorage<string | null>('dashboard:selected-ip', null);
  const selectedTopic = useStorage<string | null>('dashboard:selected-topic', null);
  const topicFilter = useStorage<string>('dashboard:topic-filter', '');
  const ipFilter = useStorage<string>('dashboard:ip-filter', '');
  const ipSortKey = useStorage<IPSortKey>('dashboard:ip-sort', 'recent');

  const ipPage = ref(1);
  const ipPageSize = ref(25);
  const topicPage = ref(1);
  const topicPageSize = ref(25);

  const globalDeltaSince = ref(0);
  const lastDeltaAt = ref<number | null>(null);
  const connectionStatus = ref<'connected' | 'disconnected'>('connected');
  const lastSuccessfulPoll = ref<number | null>(null);
  const pollError = ref<string | null>(null);

  const loadingLightStats = ref(false);
  const loadingFullStats = ref(false);
  const loadingBlockedIPs = ref(false);
  const loadingAliasKeys = ref(false);

  const loadingTopics = reactive(new Map<string, boolean>());
  const loadingMessages = reactive(new Map<string, boolean>());
  const loadingMessageDetail = reactive(new Map<string, boolean>());
  const loadingAttachmentText = reactive(new Map<string, boolean>());

  const bootstrapData = ref<DashboardBootstrapPayload | null>(null);

  const hasUnreadUpdates = computed(() => {
    for (const entry of ipMap.values()) {
      if (entry.unread) return true;
    }
    for (const cache of topicsCache.values()) {
      if (cache.unreadTopicIds.size > 0) return true;
    }
    return false;
  });

  const ipList = computed(() => {
    return Array.from(ipMap.entries()).map(([ip, entry]) => {
      const { summary } = entry;
      const lastActive = summary.lModReqAt ?? summary.lTopUpdAt ?? 0;
      return {
        ip,
        entry,
        summary,
        unread: entry.unread,
        dirtyTopics: entry.dirtyTopics,
        lastActive,
        sortValue: computeIpSortValue(entry.summary, ipSortKey.value)
      };
    });
  });

  const sortedIpList = computed(() => {
    const list = [...ipList.value];
    const key = ipSortKey.value;

    list.sort((a, b) => {
      if (key === 'recent') {
        return (b.lastActive || 0) - (a.lastActive || 0);
      }
      if (key === 'reqs') {
        return (b.summary.reqs || 0) - (a.summary.reqs || 0);
      }
      if (key === 'in') {
        return (b.summary.inTfc || 0) - (a.summary.inTfc || 0);
      }
      if (key === 'out') {
        return (b.summary.outTfc || 0) - (a.summary.outTfc || 0);
      }
      return 0;
    });

    return list;
  });

  const paginatedIps = computed(() => {
    const filterText = ipFilter.value.trim().toLowerCase();
    const source = filterText
      ? sortedIpList.value.filter(item => item.ip.toLowerCase().includes(filterText))
      : sortedIpList.value;
    const list = source;
    const pages = Math.max(1, Math.ceil(list.length / ipPageSize.value));
    if (ipPage.value > pages) {
      ipPage.value = pages;
    }
    const start = (ipPage.value - 1) * ipPageSize.value;
    return list.slice(start, start + ipPageSize.value);
  });
  watch(ipFilter, () => {
    ipPage.value = 1;
  });

  const selectedIpDirtyTopics = computed(() => {
    const ip = selectedIp.value;
    if (!ip) return false;
    return ipMap.get(ip)?.dirtyTopics ?? false;
  });

  watch(selectedIpDirtyTopics, dirty => {
    if (dirty && selectedIp.value) {
      ensureTopics(selectedIp.value);
    }
  });


  const currentIpTopics = computed(() => {
    const ip = selectedIp.value;
    if (!ip) return [] as TopicSummary[];
    const cache = topicsCache.get(ip);
    if (!cache) return [] as TopicSummary[];
    const list = [...cache.items];
    list.sort((a, b) => (b.upAt || 0) - (a.upAt || 0));
    const filterText = topicFilter.value.trim().toLowerCase();
    return filterText
      ? list.filter(topic =>
          topic.tid.toLowerCase().includes(filterText) ||
          (topic.hKey || '').toLowerCase().includes(filterText) ||
          (topic.title || '').toLowerCase().includes(filterText)
        )
      : list;
  });

  const paginatedTopics = computed(() => {
    const list = currentIpTopics.value;
    const pages = Math.max(1, Math.ceil(list.length / topicPageSize.value));
    if (topicPage.value > pages) {
      topicPage.value = pages;
    }
    const start = (topicPage.value - 1) * topicPageSize.value;
    return list.slice(start, start + topicPageSize.value);
  });

  const currentTopicMessages = computed(() => {
    const topicId = selectedTopic.value;
    if (!topicId) return [] as MessageEntity[];
    const cache = messagesCache.get(topicId);
    if (!cache) return [] as MessageEntity[];
    return cache.items;
  });

  const selectedTopicDirtyMessages = computed(() => {
    const topicId = selectedTopic.value;
    if (!topicId) return false;
    const cache = messagesCache.get(topicId);
    return cache?.dirty ?? false;
  });

  watch(selectedTopicDirtyMessages, dirty => {
    if (!dirty) return;
    const topicId = selectedTopic.value;
    if (!topicId) return;
    const ip = selectedIp.value ?? findTopicOwner(topicId);
    if (ip) {
      ensureMessages(ip, topicId);
    }
  });

  const currentTopicMeta = computed(() => {
    const topicId = selectedTopic.value;
    if (!topicId) return null;
    const cache = messagesCache.get(topicId);
    if (!cache) return null;
    return {
      total: cache.total,
      dirty: cache.dirty,
      fullyLoaded: cache.fullyLoaded,
      topicHashNoReason: cache.topicHashNoReason ?? null,
      topicHashWithReason: cache.topicHashWithReason ?? null
    };
  });

  function computeIpSortValue(summary: IPStatSummary, key: IPSortKey) {
    if (key === 'recent') {
      return summary.lModReqAt ?? summary.lTopUpdAt ?? 0;
    }
    if (key === 'reqs') {
      return summary.reqs;
    }
    if (key === 'in') {
      return summary.inTfc;
    }
    if (key === 'out') {
      return summary.outTfc;
    }
    return 0;
  }

  function updateIpEntry(summary: Partial<IPStatSummary> & { ip: string }, opts: { markDirty?: boolean; markUnread?: boolean } = {}) {
    const existing = ipMap.get(summary.ip);
    const mergedSummary: IPStatSummary = {
      ip: summary.ip,
      reqs: summary.reqs ?? existing?.summary.reqs ?? 0,
      inTfc: summary.inTfc ?? existing?.summary.inTfc ?? 0,
      outTfc: summary.outTfc ?? existing?.summary.outTfc ?? 0,
      lTopUpdAt: summary.lTopUpdAt ?? existing?.summary.lTopUpdAt,
      lModReqAt: summary.lModReqAt ?? existing?.summary.lModReqAt,
      realIPs: summary.realIPs ?? existing?.summary.realIPs
    };

    ipMap.set(summary.ip, {
      summary: mergedSummary,
      dirtyTopics: opts.markDirty ?? existing?.dirtyTopics ?? false,
      unread: opts.markUnread ? true : existing?.unread ?? false
    });
  }

  function removeMissingIPs(currentIps: Set<string>) {
    for (const key of ipMap.keys()) {
      if (!currentIps.has(key)) {
        ipMap.delete(key);
        topicsCache.delete(key);
      }
    }
  }

  function markIpRead(ip: string) {
    const entry = ipMap.get(ip);
    if (entry) {
      ipMap.set(ip, {
        ...entry,
        unread: false
      });
    }
    const cache = topicsCache.get(ip);
    if (cache) {
      cache.unreadTopicIds = new Set();
    }
  }

  function markTopicRead(ip: string, topicId: string) {
    const cache = topicsCache.get(ip);
    if (cache && cache.unreadTopicIds.has(topicId)) {
      const next = new Set(cache.unreadTopicIds);
      next.delete(topicId);
      cache.unreadTopicIds = next;
    }
  }

  async function initialize() {
    if (initialized.value) return;

    const bootstrap = getBootstrapPayload();
    bootstrapData.value = bootstrap;

    if (bootstrap) {
      stats.value = {
        totReqs: bootstrap.totReqs,
        totInTfc: bootstrap.totInTfc,
        totOutTfc: bootstrap.totOutTfc,
        ts: bootstrap.ts,
        sTime: bootstrap.sTime,
        lGMsgAt: bootstrap.lGMsgAt ?? null
      };
      globalDeltaSince.value = bootstrap.lGMsgAt ?? 0;
      setDashboardToken(bootstrap.aDashkey ?? null);

      const ipSet = new Set<string>();
      bootstrap.ipStats.forEach(summary => {
        ipSet.add(summary.ip);
        updateIpEntry(summary);
      });
      removeMissingIPs(ipSet);

      const ipCandidates = bootstrap.ipStats.map(item => item.ip);
      if (selectedIp.value && !ipCandidates.includes(selectedIp.value)) {
        selectedIp.value = null;
        selectedTopic.value = null;
      }

      if (!selectedIp.value && ipCandidates.length > 0) {
        setSelectedIp(ipCandidates[0]);
      } else if (selectedIp.value) {
        ensureTopics(selectedIp.value);
      }
    }

    initialized.value = true;
  }

  async function refreshLightStats() {
    if (loadingLightStats.value) return;
    loadingLightStats.value = true;
    try {
      const response = await fetchLightStats();
      stats.value = response;
      connectionStatus.value = 'connected';
      pollError.value = null;
      lastSuccessfulPoll.value = Date.now();

      if (response.lGMsgAt && response.lGMsgAt > globalDeltaSince.value) {
        await applyGlobalDelta();
      }
    } catch (error) {
      connectionStatus.value = 'disconnected';
      pollError.value = error instanceof Error ? error.message : String(error);
    } finally {
      loadingLightStats.value = false;
    }
  }

  async function refreshFullStats() {
    if (loadingFullStats.value) return;
    loadingFullStats.value = true;
    try {
      const response = await fetchFullStats();
      stats.value = {
        totReqs: response.totReqs,
        totInTfc: response.totInTfc,
        totOutTfc: response.totOutTfc,
        ts: response.ts,
        sTime: response.sTime,
        lGMsgAt: response.lGMsgAt
      };
      const currentIps = new Set<string>();
      response.ipStats.forEach(summary => {
        currentIps.add(summary.ip);
        updateIpEntry(summary);
      });
      removeMissingIPs(currentIps);
      connectionStatus.value = 'connected';
      pollError.value = null;
    } catch (error) {
      connectionStatus.value = 'disconnected';
      pollError.value = error instanceof Error ? error.message : String(error);
    } finally {
      loadingFullStats.value = false;
    }
  }

  async function applyGlobalDelta(targetSince?: number) {
    const since = targetSince ?? globalDeltaSince.value;
    const response = await fetchGlobalDelta(since);

    if (response.lGMsgAt) {
      globalDeltaSince.value = response.lGMsgAt;
      lastDeltaAt.value = response.lGMsgAt;
    }

    const touchedIps = new Set<string>();
    const now = Date.now();

    response.chgIPs.forEach(change => {
      touchedIps.add(change.ip);
      updateIpEntry(
        {
          ip: change.ip,
          reqs: change.reqs,
          inTfc: change.inTfc,
          outTfc: change.outTfc,
          lTopUpdAt: change.ipUpdAt,
          lModReqAt: change.ipUpdAt,
          realIPs: change.realIPs
        },
        { markUnread: true }
      );
    });

    response.chgTop.forEach(change => {
      touchedIps.add(change.ip);
      const cache = topicsCache.get(change.ip);
      const unreadSet = cache ? new Set(cache.unreadTopicIds) : new Set<string>();
      const currentlySelected = selectedIp.value === change.ip && selectedTopic.value === change.tid;

      if (currentlySelected) {
        unreadSet.delete(change.tid);
      } else {
        unreadSet.add(change.tid);
      }

      let items = cache ? [...cache.items] : [];
      const index = items.findIndex(item => item.tid === change.tid);
      const deriveTopic = (existing?: TopicSummary): TopicSummary => {
        const base: TopicSummary = existing
          ? { ...existing }
          : {
              tid: change.tid,
              hKey: change.tid,
              ctAt: change.ctAt ?? change.upAt ?? now,
              upAt: change.upAt ?? now,
              msgCnt: change.msgCnt ?? 0,
              inBytes: change.inBytes ?? 0,
              outBytes: change.outBytes ?? 0,
              status: '',
              hist: false,
              title: null
            };

        base.ctAt = change.ctAt ?? base.ctAt;
        base.upAt = change.upAt ?? base.upAt;
        base.msgCnt = change.msgCnt ?? base.msgCnt;
        base.inBytes = change.inBytes ?? base.inBytes;
        base.outBytes = change.outBytes ?? base.outBytes;
        if (Object.prototype.hasOwnProperty.call(change, 'status')) {
          base.status = (change as Partial<TopicSummary>).status ?? base.status;
        }
        if (Object.prototype.hasOwnProperty.call(change, 'hist')) {
          base.hist = (change as Partial<TopicSummary>).hist ?? base.hist;
        }
        if (Object.prototype.hasOwnProperty.call(change, 'title')) {
          base.title = change.title ?? null;
        }
        return base;
      };

      if (index >= 0) {
        items[index] = deriveTopic(items[index]);
      } else {
        const nextTopic = deriveTopic();
        items = [nextTopic, ...items];
      }

      items.sort((a, b) => (b.upAt || 0) - (a.upAt || 0));

      topicsCache.set(change.ip, {
        items,
        fetchedAt: now,
        dirty: false,
        unreadTopicIds: unreadSet
      });

      const msgCache = messagesCache.get(change.tid);
      if (msgCache) {
        messagesCache.set(change.tid, {
          ...msgCache,
          dirty: true,
          fullyLoaded: false
        });
      }

      updateIpEntry(
        {
          ip: change.ip,
          lTopUpdAt: change.upAt,
          lModReqAt: change.upAt
        },
        { markUnread: !currentlySelected }
      );
    });

    if (touchedIps.size > 0) {
      connectionStatus.value = 'connected';
      pollError.value = null;
    }
  }

  async function ensureTopics(ip: string, force = false) {
    if (!ip) return;
    const cache = topicsCache.get(ip);
    if (!force && cache && !cache.dirty) {
      return;
    }

    if (loadingTopics.get(ip)) {
      return;
    }

    loadingTopics.set(ip, true);
    try {
      const response = await fetchIPTopics(ip);
      topicsCache.set(ip, {
        items: response.topics,
        fetchedAt: Date.now(),
        dirty: false,
        unreadTopicIds: cache ? cache.unreadTopicIds : new Set<string>()
      });
      if (selectedTopic.value && !response.topics.some(topic => topic.tid === selectedTopic.value)) {
        selectedTopic.value = null;
      }
      updateIpEntry(
        {
          ip,
          lTopUpdAt: response.topics[0]?.upAt ?? cache?.items[0]?.upAt ?? 0
        },
        { markDirty: false, markUnread: cache?.unreadTopicIds.size ? true : false }
      );
    } finally {
      loadingTopics.delete(ip);
    }
  }

  async function ensureMessages(ip: string, topicId: string, force = false) {
    if (!topicId) return;
    const cache = messagesCache.get(topicId);
    if (!force && cache && !cache.dirty) {
      return;
    }

    if (loadingMessages.get(topicId)) {
      return;
    }

    loadingMessages.set(topicId, true);
    try {
      const response: TopicMessagesResponse = await fetchTopicMessages(ip, topicId, {
        start: 0,
        limit: 200
      });
      messagesCache.set(topicId, {
        items: response.msgs,
        total: response.total,
        fetchedAt: Date.now(),
        dirty: false,
        fullyLoaded: response.msgs.length >= response.total,
        topicHashNoReason: response.topicHashNoReason ?? null,
        topicHashWithReason: response.topicHashWithReason ?? null
      });
      markTopicRead(ip, topicId);
      markIpRead(ip);
    } finally {
      loadingMessages.delete(topicId);
    }
  }

  async function loadMessageRequestBody(id: string, force = false) {
    if (!id) return;
    const cache = messageRequestBodyCache.get(id);
    if (!force && cache) {
      return cache.data;
    }
    const response = await fetchMessageRequestBody(id);
    messageRequestBodyCache.set(id, {
      data: response,
      fetchedAt: Date.now()
    });
    return response;
  }

  async function loadMessageRequestHeaders(id: string, force = false) {
    if (!id) return;
    const cache = messageRequestHeadersCache.get(id);
    if (!force && cache) {
      return cache.data;
    }
    const response = await fetchMessageRequestHeaders(id);
    messageRequestHeadersCache.set(id, {
      data: response,
      fetchedAt: Date.now()
    });
    return response;
  }

  async function loadModelErrorDetails(id: string, force = false) {
    if (!id) return;
    const cache = modelErrorCache.get(id);
    if (!force && cache) {
      return cache.data;
    }
    const response = await fetchModelErrorDetails(id);
    modelErrorCache.set(id, {
      data: response,
      fetchedAt: Date.now()
    });
    return response;
  }

  async function removeTopics(ip: string, topicIds: string[]) {
    if (!topicIds.length) return;
    await apiDeleteTopics({ ip, topicIds });
    const cache = topicsCache.get(ip);
    if (cache) {
      const remaining = cache.items.filter(topic => !topicIds.includes(topic.tid));
      const unread = new Set(cache.unreadTopicIds);
      topicIds.forEach(id => unread.delete(id));
      topicsCache.set(ip, {
        items: remaining,
        fetchedAt: Date.now(),
        dirty: false,
        unreadTopicIds: unread
      });
    }
    topicIds.forEach(id => messagesCache.delete(id));
    if (selectedTopic.value && topicIds.includes(selectedTopic.value)) {
      selectedTopic.value = null;
    }
    await refreshFullStats();
  }

  async function removeIp(ip: string) {
    await apiDeleteIP({ ip });
    ipMap.delete(ip);
    topicsCache.delete(ip);
    const messageKeys = Array.from(messagesCache.keys()) as string[];
    messageKeys.forEach(key => {
      const owner = findTopicOwner(key);
      if (owner === ip) {
        messagesCache.delete(key);
      }
    });
    if (selectedIp.value === ip) {
      selectedIp.value = null;
      selectedTopic.value = null;
    }
    await refreshFullStats();
  }

  async function banIp(ip: string, durationMs?: number, reason?: string) {
    await banIP({ ip, durationMs, reason });
    await refreshBlockedIPs(true);
  }

  async function unbanIp(ip: string) {
    await unbanIP({ ip });
    await refreshBlockedIPs(true);
  }

  async function removeAlias(aliasName: string) {
    await deleteAliasKey({ aliasName });
    await refreshAliasKeys(true);
  }

  async function refreshBlockedIPs(force = false) {
    if (loadingBlockedIPs.value) return;
    if (!force && blockedIPs.value && Date.now() - (blockedIPs.value.now || 0) < 30_000) {
      return;
    }
    loadingBlockedIPs.value = true;
    try {
      blockedIPs.value = await fetchBlockedIPs();
    } finally {
      loadingBlockedIPs.value = false;
    }
  }

  async function refreshAliasKeys(force = false) {
    if (loadingAliasKeys.value) return;
    const last = aliasKeys.value?.aliasKeys?.[0];
    if (!force && aliasKeys.value && last && Date.now() - last.upAt < 30_000) {
      return;
    }
    loadingAliasKeys.value = true;
    try {
      aliasKeys.value = await fetchAliasKeys();
    } finally {
      loadingAliasKeys.value = false;
    }
  }

  function setSelectedIp(ip: string | null) {
    if (ip === selectedIp.value) return;
    selectedIp.value = ip;
    topicPage.value = 1;
    selectedTopic.value = null;
    if (ip) {
      ensureTopics(ip);
      markIpRead(ip);
    }
  }

  function setSelectedTopic(topicId: string | null) {
    if (topicId === selectedTopic.value) return;
    selectedTopic.value = topicId;
    if (topicId && selectedIp.value) {
      ensureMessages(selectedIp.value, topicId);
      markTopicRead(selectedIp.value, topicId);
    }
  }

  function findTopicOwner(topicId: string): string | null {
    for (const [ip, cache] of topicsCache.entries()) {
      if (cache.items.some(topic => topic.tid === topicId)) {
        return ip;
      }
    }
    return null;
  }

  function acknowledgeUpdates() {
    if (selectedIp.value) {
      markIpRead(selectedIp.value);
    }
  }

  function isTopicUnread(ip: string, topicId: string) {
    const cache = topicsCache.get(ip);
    return cache ? cache.unreadTopicIds.has(topicId) : false;
  }

  function getMessageDetail(id: string) {
    return messageDetailCache.get(id)?.data ?? null;
  }

  function getMessageRequestBody(id: string) {
    return messageRequestBodyCache.get(id)?.data ?? null;
  }

  function getMessageRequestHeaders(id: string) {
    return messageRequestHeadersCache.get(id)?.data ?? null;
  }

  function getModelErrorDetails(id: string) {
    return modelErrorCache.get(id)?.data ?? null;
  }

  // 自动轮询
  const { pause: pausePolling, resume: resumePolling } = useIntervalFn(() => {
    if (document.hidden) {
      return;
    }
    refreshLightStats();
  }, DASHBOARD_POLL_INTERVAL_MS, { immediate: false });

  useEventListener(document, 'visibilitychange', () => {
    if (document.hidden) {
      pausePolling();
    } else {
      refreshLightStats();
      resumePolling();
    }
  });

  watch(initialized, (value) => {
    if (value) {
      resumePolling();
    }
  }, { immediate: true });

  return {
    initialized,
    stats,
    ipSortKey,
    ipPage,
    ipPageSize,
    topicPage,
    topicPageSize,
    selectedIp,
    selectedTopic,
    topicFilter,
    ipFilter,
    connectionStatus,
    lastSuccessfulPoll,
    pollError,
    hasUnreadUpdates,
    paginatedIps,
    sortedIpList,
    currentIpTopics,
    paginatedTopics,
    currentTopicMessages,
    currentTopicMeta,
    blockedIPs,
    aliasKeys,
    bootstrapData,
    globalDeltaSince,
    lastDeltaAt,
    loadingLightStats,
    loadingFullStats,
    loadingBlockedIPs,
    loadingAliasKeys,
    loadingTopics,
    loadingMessages,
    loadingMessageDetail,
    initialize,
    refreshLightStats,
    refreshFullStats,
    applyGlobalDelta,
    ensureTopics,
    ensureMessages,
    loadMessageRequestBody,
    loadMessageRequestHeaders,
    loadModelErrorDetails,
    removeTopics,
    removeIp,
    banIp,
    unbanIp,
    removeAlias,
    refreshBlockedIPs,
    refreshAliasKeys,
    setSelectedIp,
    setSelectedTopic,
    acknowledgeUpdates,
    isTopicUnread,
    getMessageDetail,
    getMessageRequestBody,
    getMessageRequestHeaders,
    getModelErrorDetails
  };
});
