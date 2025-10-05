<template>
  <article ref="cardEl" class="message-card" :class="roleClass">
    <header class="message-card__header">
      <div class="message-card__meta">
        <span class="badge badge--role">{{ roleLabel }}</span>
        <span class="badge badge--id" :title="message.id">{{ shortId }}</span>
        <span v-if="tokens" class="badge badge--ghost" title="Tokens">
          {{ tokens }} tokens
        </span>
        <span v-if="modelStatusLabel" class="badge" :class="statusBadgeClass">
          {{ modelStatusLabel }}
        </span>
      </div>
    </header>

    <!-- 用户消息: 显示请求信息 -->
    <template v-if="message.role === 'user'">
      <!-- 请求 URL -->
      <section v-if="requestUrl" class="message-card__request-info">
        <header class="request-info__label">
          <IconSymbol name="link" />
          请求 URL
        </header>
        <div class="request-info__content">
          <code>{{ requestUrl }}</code>
        </div>
      </section>

      <!-- 请求头部 -->
      <details
        v-if="shouldShowRequestHeadersSection"
        class="message-card__request-section"
        @toggle="onRequestHeadersToggle"
      >
        <summary>
          <IconSymbol name="http" />
          <span>
            请求头部
            <template v-if="requestHeadersCount !== null"> ({{ requestHeadersCount }})</template>
          </span>
        </summary>
        <div class="request-section__content" :data-open="requestHeadersOpen">
          <div v-if="requestHeadersLoading" class="request-body__loading">
            <span class="loading-dot loading-dot--inline"></span>
            <span>正在加载请求头…</span>
          </div>
          <div v-else-if="requestHeadersError" class="request-body__error">
            <IconSymbol name="error" />
            <span>{{ requestHeadersError }}</span>
            <button class="ghost-button" @click.stop="reloadRequestHeaders">
              <IconSymbol name="refresh" />
              重试加载
            </button>
          </div>
          <template v-else-if="requestHeadersContentAvailable">
            <pre><code>{{ formattedRequestHeaders }}</code></pre>
            <button class="ghost-button" @click="copyRequestHeaders">
              <IconSymbol name="content_copy" />
              复制
            </button>
          </template>
          <div v-else class="request-body__empty">
            <span>没有可显示的请求头内容。</span>
          </div>
        </div>
      </details>

      <!-- 请求 Body -->
      <details
        v-if="shouldShowRequestBodySection"
        ref="requestBodyDetailsEl"
        class="message-card__request-section message-card__request-section--body"
        @toggle="onRequestBodyToggle"
      >
        <summary>
          <IconSymbol name="data_object" />
          <span>请求 Body</span>
        </summary>
        <div class="request-section__content" :data-open="requestBodyOpen">
          <div v-if="requestBodyLoading" class="request-body__loading">
            <span class="loading-dot loading-dot--inline"></span>
            <span>正在加载请求体…</span>
          </div>
          <div v-else-if="requestBodyError" class="request-body__error">
            <IconSymbol name="error" />
            <span>{{ requestBodyError }}</span>
            <button class="ghost-button" @click.stop="reloadRequestBody">
              <IconSymbol name="refresh" />
              重试加载
            </button>
          </div>
          <template v-else-if="requestBodyContentAvailable">
            <pre><code>{{ formattedRequestBody }}</code></pre>
            <button class="ghost-button" @click="copyRequestBody">
              <IconSymbol name="content_copy" />
              复制
            </button>
          </template>
          <div v-else class="request-body__empty">
            <span>没有可显示的请求体内容。</span>
          </div>
        </div>
      </details>
    </template>

    <!-- 模型消息: 显示元数据 -->
    <template v-if="message.role === 'model'">
      <section v-if="modelMetadata" class="message-card__model-meta">
        <div v-if="modelMetadata.modelName" class="meta-item">
          <IconSymbol name="smart_toy" />
          <span class="meta-label">模型:</span>
          <span class="meta-value">{{ modelMetadata.modelName }}</span>
        </div>
        <div v-if="modelMetadata.status !== null && modelMetadata.status !== undefined" class="meta-item">
          <IconSymbol name="info" />
          <span class="meta-label">状态码:</span>
          <span class="meta-value">{{ modelMetadata.status }}</span>
        </div>
        <div v-if="modelMetadata.statusText" class="meta-item">
          <IconSymbol name="description" />
          <span class="meta-label">状态说明:</span>
          <span class="meta-value">{{ modelMetadata.statusText }}</span>
        </div>
        <div v-if="modelMetadata.tokens" class="meta-item">
          <IconSymbol name="bar_chart" />
          <span class="meta-label">Token统计:</span>
          <div class="token-details">
            <span v-if="modelMetadata.tokens.promptTokenCount !== null && modelMetadata.tokens.promptTokenCount !== undefined">Prompt: {{ modelMetadata.tokens.promptTokenCount }}</span>
            <span v-if="modelMetadata.tokens.candidatesTokenCount !== null && modelMetadata.tokens.candidatesTokenCount !== undefined">Response: {{ modelMetadata.tokens.candidatesTokenCount }}</span>
            <span v-if="modelMetadata.tokens.thoughtsTokenCount !== null && modelMetadata.tokens.thoughtsTokenCount !== undefined">Thinking: {{ modelMetadata.tokens.thoughtsTokenCount }}</span>
            <span v-if="modelMetadata.tokens.totalTokenCount !== null && modelMetadata.tokens.totalTokenCount !== undefined">Total: {{ modelMetadata.tokens.totalTokenCount }}</span>
            <div v-if="promptTokensDetails && promptTokensDetails.length" class="token-breakdown">
              <span class="token-breakdown__label">Prompt 详情:</span>
              <ul class="token-breakdown__list">
                <li v-for="(detail, index) in promptTokensDetails" :key="index" class="token-breakdown__item">
                  <span class="token-breakdown__item-label">{{ detail.label }}</span>
                  <span class="token-breakdown__item-value">{{ detail.tokenCount ?? '—' }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div v-if="modelMetadata.finishReason" class="meta-item">
          <IconSymbol name="flag" />
          <span class="meta-label">结束原因:</span>
          <span class="meta-value">{{ modelMetadata.finishReason }}</span>
        </div>
      </section>
      <section v-if="modelErrorSummary || modelHasErrorDetails" class="message-card__model-error">
        <header class="model-error__header">
          <IconSymbol name="error" />
          <span class="model-section__title">错误信息</span>
        </header>
        <p v-if="modelErrorSummary" class="model-error__summary">{{ modelErrorSummary }}</p>
        <details
          v-if="modelHasErrorDetails"
          class="message-card__model-json"
          data-tone="error"
          :data-open="modelErrorDetailsOpen"
          @toggle="onModelErrorDetailsToggle"
        >
          <summary>
            <IconSymbol name="bug_report" />
            <span>错误详情</span>
            <span v-if="modelErrorDetailsLoading" class="loading-dot loading-dot--inline"></span>
          </summary>
          <div class="model-json-body" :data-loading="modelErrorDetailsLoading">
            <div v-if="modelErrorDetailsLoading" class="model-json__loading">
              <span class="loading-dot loading-dot--inline"></span>
              <span>正在加载错误详情…</span>
            </div>
            <div v-else-if="modelErrorDetailsError" class="model-json__error">
              <IconSymbol name="error" />
              <span>{{ modelErrorDetailsError }}</span>
              <button class="ghost-button ghost-button--alert" type="button" @click.stop="reloadModelErrorDetails">
                <IconSymbol name="refresh" />
                重试加载
              </button>
            </div>
            <template v-else-if="modelErrorDetailsContentAvailable">
              <pre><code>{{ formattedModelError }}</code></pre>
              <button class="ghost-button ghost-button--alert" type="button" @click.stop="copyModelErrorDetails">
                <IconSymbol name="content_copy" />
                复制
              </button>
            </template>
            <div v-else-if="modelErrorDetailsLoaded" class="model-json__empty">
              <span>暂无可显示的错误详情。</span>
            </div>
            <div v-else class="model-json__placeholder">
              <span>展开以加载错误详情。</span>
            </div>
          </div>
        </details>
      </section>
    </template>
  </article>
</template>

<script setup lang="ts">
import { computed, reactive, ref, unref, watch } from 'vue';
import { useIntersectionObserver, type MaybeElementRef } from '@vueuse/core';
import type { MessageEntity } from '@/types';
import IconSymbol from '@/components/IconSymbol.vue';
import { useDashboardStore } from '@/stores/dashboard';
import { useUiStore } from '@/stores/ui';
import { formatDateTime } from '@/utils/format';
import { useRelativeTime } from '@/composables/relativeTime';

const props = defineProps<{ message: MessageEntity; rootEl?: MaybeElementRef<HTMLElement> }>();

const dashboard = useDashboardStore();
const ui = useUiStore();

const loading = ref(false);
const loadError = ref(false);
const autoTriggered = ref(false);
const cardEl = ref<HTMLElement | null>(null);
const requestBodyDetailsEl = ref<HTMLDetailsElement | null>(null);
const requestBodyOpen = ref(false);
const requestHeadersOpen = ref(false);
const fallbackRequestUrl = ref<string | null>(null);
const requestBodyState = reactive<{ loading: boolean; loaded: boolean; error: string | null; data: unknown | null; raw: string | null }>(
  {
    loading: false,
    loaded: false,
    error: null,
    data: null,
    raw: null
  }
);
const requestHeadersState = reactive<{ loading: boolean; loaded: boolean; error: string | null; data: Record<string, unknown> | null; raw: string | null }>(
  {
    loading: false,
    loaded: false,
    error: null,
    data: null,
    raw: null
  }
);

const detail = computed(() => dashboard.getMessageDetail(props.message.id));
const tokens = computed(() => detail.value?.meta?.tokens?.totTokCnt ?? props.message.meta?.tokens?.totTokCnt ?? null);

// 请求信息(用户消息)
const cachedRequestBody = computed(() => dashboard.getMessageRequestBody(props.message.id));
const cachedRequestHeaders = computed(() => dashboard.getMessageRequestHeaders(props.message.id));

const requestUrl = computed(() => {
  return detail.value?.reqUrl
    ?? props.message.reqUrl
    ?? cachedRequestBody.value?.requestUrl
    ?? cachedRequestHeaders.value?.requestUrl
    ?? fallbackRequestUrl.value
    ?? null;
});

const hasRemoteRequestBody = computed(() => detail.value?.hasReqBody ?? props.message.hasReqBody ?? false);
const hasRemoteRequestHeaders = computed(() => detail.value?.hasReqHeaders ?? props.message.hasReqHeaders ?? false);

const requestBodyContent = computed<unknown | null>(() => {
  if (requestBodyState.loaded) {
    return requestBodyState.data ?? requestBodyState.raw ?? null;
  }
  const cache = cachedRequestBody.value;
  if (cache) {
    return cache.requestBody ?? cache.rawRequestBody ?? null;
  }
  return null;
});

const requestHeadersRecord = computed<Record<string, unknown> | null>(() => {
  if (requestHeadersState.loaded) {
    return requestHeadersState.data;
  }
  return cachedRequestHeaders.value?.requestHeaders ?? null;
});

const requestHeadersRaw = computed<string | null>(() => {
  if (requestHeadersState.loaded) {
    return requestHeadersState.raw;
  }
  return cachedRequestHeaders.value?.rawRequestHeaders ?? null;
});

const requestHeadersFormattedSource = computed<unknown | null>(() => requestHeadersRecord.value ?? requestHeadersRaw.value);

const requestHeadersCount = computed<number | null>(() => {
  const record = requestHeadersRecord.value;
  if (!record) return null;
  return Object.keys(record).length;
});

const shouldShowRequestHeadersSection = computed(() => {
  if (requestHeadersState.loading || requestHeadersState.error) return true;
  if (hasRemoteRequestHeaders.value) return true;
  return hasBodyContent(requestHeadersFormattedSource.value);
});

const shouldShowRequestBodySection = computed(() => {
  if (requestBodyState.loading || requestBodyState.error) return true;
  if (hasRemoteRequestBody.value) return true;
  return hasBodyContent(requestBodyContent.value);
});

const requestBodyLoading = computed(() => requestBodyState.loading);
const requestBodyError = computed(() => requestBodyState.error);
const requestHeadersLoading = computed(() => requestHeadersState.loading);
const requestHeadersError = computed(() => requestHeadersState.error);

const requestBodyContentAvailable = computed(() => hasBodyContent(requestBodyContent.value));
const requestHeadersContentAvailable = computed(() => hasBodyContent(requestHeadersFormattedSource.value));

const formattedRequestBody = computed(() => (requestBodyContentAvailable.value ? formatJson(requestBodyContent.value) : ''));
const formattedRequestHeaders = computed(() => (requestHeadersContentAvailable.value ? formatJson(requestHeadersFormattedSource.value) : ''));

// 模型元数据(模型消息)
type NormalizedPromptTokenDetail = {
  label: string;
  tokenCount: number | null;
};

type NormalizedTokens = {
  promptTokenCount?: number | null;
  candidatesTokenCount?: number | null;
  thoughtsTokenCount?: number | null;
  totalTokenCount?: number | null;
  promptTokensDetails?: NormalizedPromptTokenDetail[] | null;
};

type NormalizedModelMeta = {
  status: number | string | null;
  statusText: string | null;
  modelName: string | null;
  tokens: NormalizedTokens | null;
  finishReason: string | null;
  errMsg: string | null;
  errStatus: string | null;
  errCode: string | number | null;
  hasErrorDetails: boolean;
};

const modelMetadata = computed<NormalizedModelMeta | null>(() => {
  if (props.message.role !== 'model') return null;
  const rawMeta = detail.value?.meta ?? props.message.meta;
  if (!rawMeta) return null;

  const tokensSource = (rawMeta as any).tokens ?? null;
  const readNumber = (source: any, keys: string[]): number | null => {
    if (!source || typeof source !== 'object') return null;
    for (const key of keys) {
      const value = source[key];
      if (value === undefined || value === null) continue;
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
      if (typeof value === 'number') {
        return value;
      }
    }
    return null;
  };

  const promptTokenCount = readNumber(tokensSource, ['promptTokenCount', 'pTokCnt', 'promptTokensCount']);
  const candidatesTokenCount = readNumber(tokensSource, ['candidatesTokenCount', 'candTokCnt']);
  const thoughtsTokenCount = readNumber(tokensSource, ['thoughtsTokenCount', 'thgtTokCnt', 'thinkingTokenCount']);
  const totalTokenCount = readNumber(tokensSource, ['totalTokenCount', 'totTokCnt', 'totalTokensCount']);

  const rawPromptDetails = (tokensSource?.promptTokensDetails
    ?? tokensSource?.promptTokenDetails
    ?? tokensSource?.prompt_tokens_details) ?? null;

  const promptTokensDetails = Array.isArray(rawPromptDetails)
    ? rawPromptDetails
      .map((entry: any) => {
        if (!entry || typeof entry !== 'object') return null;

        const rawLabel = entry.modality
          ?? entry.type
          ?? entry.modalityType
          ?? entry.name;

        const label = typeof rawLabel === 'string' && rawLabel.trim().length
          ? rawLabel.trim()
          : null;

        const resolveCount = () => {
          for (const key of ['tokenCount', 'tokens', 'count', 'value', 'tokenCounts']) {
            if (entry[key] === undefined || entry[key] === null) continue;
            const numeric = Number(entry[key]);
            if (Number.isFinite(numeric)) return numeric;
            if (typeof entry[key] === 'number') return entry[key];
          }
          return null;
        };

        const tokenCount = resolveCount();

        if (!label && tokenCount === null) return null;
        return {
          label: label ?? 'Prompt',
          tokenCount
        } as NormalizedPromptTokenDetail;
      })
      .filter((entry): entry is NormalizedPromptTokenDetail => !!entry)
    : null;

  const tokensCandidate: NormalizedTokens = {
    promptTokenCount,
    candidatesTokenCount,
    thoughtsTokenCount,
    totalTokenCount,
    promptTokensDetails: promptTokensDetails && promptTokensDetails.length ? promptTokensDetails : null
  };
  const hasTokenCounts = [
    promptTokenCount,
    candidatesTokenCount,
    thoughtsTokenCount,
    totalTokenCount
  ].some(value => value !== null && value !== undefined) || !!(tokensCandidate.promptTokensDetails && tokensCandidate.promptTokensDetails.length);

  const finishReason = (rawMeta as any).finishReason ?? tokensSource?.finishReason ?? null;

  const statusRaw = (rawMeta as any).status;
  let status: number | string | null = null;
  if (typeof statusRaw === 'number' && Number.isFinite(statusRaw)) {
    status = statusRaw;
  } else if (typeof statusRaw === 'string') {
    const parsed = Number(statusRaw);
    status = Number.isFinite(parsed) ? parsed : statusRaw;
  } else if (statusRaw !== undefined && statusRaw !== null) {
    status = statusRaw as number | string;
  }

  const statusText = typeof (rawMeta as any).statusText === 'string' && (rawMeta as any).statusText.trim().length
    ? (rawMeta as any).statusText
    : null;

  const modelName = (rawMeta as any).modelName
    ?? (rawMeta as any).modelVer
    ?? (rawMeta as any).model
    ?? null;

  const rawErrCode = (rawMeta as any).errCode;
  let errCode: string | number | null = null;
  if (typeof rawErrCode === 'string' || typeof rawErrCode === 'number') {
    errCode = rawErrCode;
  } else if (rawErrCode !== undefined && rawErrCode !== null) {
    errCode = String(rawErrCode);
  }

  const hasErrorDetails = Boolean(
    (rawMeta as any).hasErrDetails ??
    (rawMeta as any).hasErrorDetails ??
    (rawMeta as any).hasErrDetail ??
    false
  );

  return {
    status,
    statusText,
    modelName,
    tokens: hasTokenCounts ? tokensCandidate : null,
    finishReason: finishReason ?? null,
    errMsg: typeof (rawMeta as any).errMsg === 'string' ? (rawMeta as any).errMsg : null,
    errStatus: typeof (rawMeta as any).errStatus === 'string' ? (rawMeta as any).errStatus : null,
    errCode,
    hasErrorDetails
  };
});

const modelStatusRaw = computed(() => modelMetadata.value?.status ?? null);

const modelStatusCode = computed(() => {
  const raw = modelStatusRaw.value;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : null;
});

const modelStatusLabel = computed(() => {
  const raw = modelStatusRaw.value;
  const text = modelMetadata.value?.statusText?.trim() ?? '';
  const codeString = raw !== null && raw !== undefined ? String(raw) : '';
  if (codeString && text) {
    if (codeString.toLowerCase() === text.toLowerCase()) {
      return codeString;
    }
    return `${codeString} ${text}`;
  }
  if (codeString) return codeString;
  return text || null;
});

const modelHasErrorDetails = computed(() => !!modelMetadata.value?.hasErrorDetails);

const isModelError = computed(() => {
  const meta = modelMetadata.value;
  if (!meta) return false;
  const status = modelStatusCode.value;
  if (status !== null && status >= 400) return true;
  if (typeof meta.errStatus === 'string' && meta.errStatus.trim().length) return true;
  if (typeof meta.errMsg === 'string' && meta.errMsg.trim().length) return true;
  if ((meta.finishReason ?? '').toString().toLowerCase() === 'error') return true;
  return false;
});

const statusBadgeClass = computed(() => {
  if (isModelError.value) return 'badge--error';
  const status = modelStatusCode.value;
  if (status === null || status === undefined) return 'badge--ghost';
  if (status >= 200 && status < 300) return 'badge--success';
  return 'badge--ghost';
});

const modelErrorSummary = computed(() => {
  const meta = modelMetadata.value;
  if (!meta) return null;
  const summaryParts: string[] = [];
  if (meta.errStatus) summaryParts.push(meta.errStatus);
  if (meta.errCode !== null && meta.errCode !== undefined && `${meta.errCode}`.length) {
    summaryParts.push(`code ${meta.errCode}`);
  }
  if (meta.errMsg) summaryParts.push(meta.errMsg);
  return summaryParts.length ? summaryParts.join(' · ') : null;
});

type ModelErrorPayload = { hasError: boolean; error: unknown | null } | null;

const cachedModelErrorDetails = computed(() => dashboard.getModelErrorDetails(props.message.id));

const modelErrorDetailsState = reactive<{ loading: boolean; loaded: boolean; error: string | null; data: unknown | null; hasError: boolean }>(
  {
    loading: false,
    loaded: false,
    error: null,
    data: null,
    hasError: false
  }
);

const modelErrorDetailsOpen = ref(false);

const modelErrorDetailsData = computed<ModelErrorPayload>(() => {
  if (modelErrorDetailsState.loaded) {
    return {
      hasError: modelErrorDetailsState.hasError,
      error: modelErrorDetailsState.data ?? null
    };
  }
  const cached = cachedModelErrorDetails.value;
  return cached ? { hasError: cached.hasError ?? false, error: cached.error ?? null } : null;
});

const modelErrorDetailsLoading = computed(() => modelErrorDetailsState.loading);
const modelErrorDetailsError = computed(() => modelErrorDetailsState.error);
const modelErrorDetailsLoaded = computed(() => modelErrorDetailsState.loaded || !!cachedModelErrorDetails.value);

const modelErrorDetailsContentAvailable = computed(() => {
  const data = modelErrorDetailsData.value;
  if (!data) return false;
  if (!data.hasError) return false;
  return hasBodyContent(data.error ?? null);
});

const formattedModelError = computed(() => modelErrorDetailsContentAvailable.value
  ? formatJson(modelErrorDetailsData.value?.error ?? null)
  : '');

const promptTokensDetails = computed(() => modelMetadata.value?.tokens?.promptTokensDetails ?? null);

function resetModelErrorState() {
  modelErrorDetailsState.loading = false;
  modelErrorDetailsState.loaded = false;
  modelErrorDetailsState.error = null;
  modelErrorDetailsState.data = null;
  modelErrorDetailsState.hasError = false;
  modelErrorDetailsOpen.value = false;
}

async function ensureModelErrorDetails(force = false) {
  if (!modelHasErrorDetails.value) return;
  if (modelErrorDetailsState.loading) return;

  if (!force) {
    const cached = cachedModelErrorDetails.value;
    if (cached) {
      modelErrorDetailsState.data = cached.error ?? null;
      modelErrorDetailsState.hasError = cached.hasError ?? false;
      modelErrorDetailsState.loaded = true;
      modelErrorDetailsState.error = null;
      return;
    }
    if (modelErrorDetailsState.loaded) return;
  }

  modelErrorDetailsState.loading = true;
  modelErrorDetailsState.error = null;
  try {
    const response = await dashboard.loadModelErrorDetails(props.message.id, force);
    if (response) {
      modelErrorDetailsState.data = response.error ?? null;
      modelErrorDetailsState.hasError = response.hasError ?? false;
      modelErrorDetailsState.loaded = true;
    } else {
      modelErrorDetailsState.data = null;
      modelErrorDetailsState.hasError = false;
      modelErrorDetailsState.loaded = true;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    modelErrorDetailsState.error = message;
    modelErrorDetailsState.loaded = false;
    ui.pushToast({ type: 'error', title: '错误详情加载失败', message });
  } finally {
    modelErrorDetailsState.loading = false;
  }
}

function onModelErrorDetailsToggle(event: Event) {
  const element = event.currentTarget as HTMLDetailsElement | null;
  const open = element?.open ?? false;
  modelErrorDetailsOpen.value = open;
  if (open) {
    void ensureModelErrorDetails();
  }
}

function reloadModelErrorDetails() {
  void ensureModelErrorDetails(true);
}

function copyModelErrorDetails() {
  if (!modelErrorDetailsContentAvailable.value || !formattedModelError.value) return;
  void copyToClipboard(formattedModelError.value);
}

const roleLabel = computed(() => {
  if (props.message.role === 'user') return '用户';
  if (props.message.role === 'model') return '模型';
  if (props.message.role === 'system') return '系统';
  return props.message.role;
});

const roleClass = computed(() => ({
  'message-card--user': props.message.role === 'user',
  'message-card--model': props.message.role === 'model',
  'message-card--state-error': props.message.role === 'model' && isModelError.value
}));

const relativeTime = useRelativeTime(() => props.message.ctAt ?? props.message.meta?.ctAt ?? null);
const absoluteTime = computed(() => formatDateTime(props.message.ctAt ?? props.message.meta?.ctAt ?? Date.now()));
const shortId = computed(() => props.message.id.slice(0, 8));
const rootElement = computed<HTMLElement | undefined>(() => {
  const target = props.rootEl;
  return target ? (unref(target) ?? undefined) : undefined;
});

watch(() => props.message.id, () => {
  autoTriggered.value = false;
  loadError.value = false;
  resetRequestBodyState();
  resetRequestHeadersState();
  resetModelErrorState();
});

watch(modelHasErrorDetails, has => {
  if (!has) {
    resetModelErrorState();
  }
});

function hasBodyContent(body: unknown): boolean {
  if (body === null || body === undefined) return false;
  if (Array.isArray(body)) return body.length > 0;
  if (typeof body === 'object') return Object.keys(body as Record<string, unknown>).length > 0;
  if (typeof body === 'string') return body.trim().length > 0;
  return true;
}

function formatJson(obj: unknown): string {
  try {
    if (typeof obj === 'string') {
      return obj;
    }
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    ui.pushToast({ type: 'success', title: '已复制到剪贴板' });
  } catch (error) {
    ui.pushToast({ type: 'error', title: '复制失败', message: error instanceof Error ? error.message : String(error) });
  }
}
function resetRequestBodyState() {
  requestBodyOpen.value = false;
  requestBodyState.loading = false;
  requestBodyState.loaded = false;
  requestBodyState.error = null;
  requestBodyState.data = null;
  requestBodyState.raw = null;
  fallbackRequestUrl.value = null;
}

async function loadRequestBody(force = false) {
  if (requestBodyState.loading) return;

  if (!force) {
    const cached = cachedRequestBody.value;
    if (cached) {
      requestBodyState.data = cached.requestBody ?? null;
      requestBodyState.raw = cached.rawRequestBody ?? null;
      requestBodyState.loaded = true;
      requestBodyState.error = null;
      fallbackRequestUrl.value = cached.requestUrl ?? fallbackRequestUrl.value;
      return;
    }
    if (requestBodyState.loaded) return;
    if (!hasRemoteRequestBody.value) return;
  }

  requestBodyState.loading = true;
  requestBodyState.error = null;
  try {
    const response = await dashboard.loadMessageRequestBody(props.message.id, force);
    if (response) {
      requestBodyState.data = response.requestBody ?? null;
      requestBodyState.raw = response.rawRequestBody ?? null;
      fallbackRequestUrl.value = response.requestUrl ?? fallbackRequestUrl.value;
    } else {
      requestBodyState.data = null;
      requestBodyState.raw = null;
    }
    requestBodyState.loaded = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    requestBodyState.error = message;
    ui.pushToast({ type: 'error', title: '请求体加载失败', message });
    requestBodyState.loaded = false;
    requestBodyState.data = null;
    requestBodyState.raw = null;
  } finally {
    requestBodyState.loading = false;
  }
}

function resetRequestHeadersState() {
  requestHeadersOpen.value = false;
  requestHeadersState.loading = false;
  requestHeadersState.loaded = false;
  requestHeadersState.error = null;
  requestHeadersState.data = null;
  requestHeadersState.raw = null;
}

async function loadRequestHeaders(force = false) {
  if (requestHeadersState.loading) return;

  if (!force) {
    const cached = cachedRequestHeaders.value;
    if (cached) {
      requestHeadersState.data = cached.requestHeaders ?? null;
      requestHeadersState.raw = cached.rawRequestHeaders ?? null;
      requestHeadersState.loaded = true;
      requestHeadersState.error = null;
      fallbackRequestUrl.value = cached.requestUrl ?? fallbackRequestUrl.value;
      return;
    }
    if (requestHeadersState.loaded) return;
    if (!hasRemoteRequestHeaders.value) return;
  }

  requestHeadersState.loading = true;
  requestHeadersState.error = null;
  try {
    const response = await dashboard.loadMessageRequestHeaders(props.message.id, force);
    if (response) {
      requestHeadersState.data = response.requestHeaders ?? null;
      requestHeadersState.raw = response.rawRequestHeaders ?? null;
      fallbackRequestUrl.value = response.requestUrl ?? fallbackRequestUrl.value;
    } else {
      requestHeadersState.data = null;
      requestHeadersState.raw = null;
    }
    requestHeadersState.loaded = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    requestHeadersState.error = message;
    ui.pushToast({ type: 'error', title: '请求头加载失败', message });
    requestHeadersState.loaded = false;
    requestHeadersState.data = null;
    requestHeadersState.raw = null;
  } finally {
    requestHeadersState.loading = false;
  }
}

function onRequestBodyToggle(event: Event) {
  const element = event.currentTarget as HTMLDetailsElement | null;
  const open = element?.open ?? false;
  requestBodyOpen.value = open;
  if (open) {
    void loadRequestBody();
  }
}

function reloadRequestBody() {
  void loadRequestBody(true);
}

function copyRequestBody() {
  if (!requestBodyContentAvailable.value) return;
  void copyToClipboard(formattedRequestBody.value);
}

function onRequestHeadersToggle(event: Event) {
  const element = event.currentTarget as HTMLDetailsElement | null;
  const open = element?.open ?? false;
  requestHeadersOpen.value = open;
  if (open) {
    void loadRequestHeaders();
  }
}

function reloadRequestHeaders() {
  void loadRequestHeaders(true);
}

function copyRequestHeaders() {
  if (!requestHeadersContentAvailable.value) return;
  void copyToClipboard(formattedRequestHeaders.value);
}
</script>

<style scoped>
.message-card {
  background: rgba(15, 22, 35, 0.82);
  border-radius: 18px;
  border: 1px solid rgba(70, 96, 150, 0.25);
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.message-card--user {
  border-left: 3px solid rgba(90, 170, 255, 0.8);
}

.message-card--model {
  border-left: 3px solid rgba(120, 255, 190, 0.8);
}

.message-card--state-error {
  background: rgba(54, 18, 30, 0.85);
  border-color: rgba(255, 130, 150, 0.4);
  border-left-color: rgba(255, 130, 150, 0.85);
}

.message-card--state-error .badge--role {
  background: rgba(255, 110, 150, 0.28);
  color: #ffd8de;
}

.message-card--state-error .badge--id {
  background: rgba(255, 140, 160, 0.2);
  color: #ffe4e9;
}

.message-card--state-error .badge--ghost {
  background: rgba(255, 160, 180, 0.18);
  color: #ffe7eb;
}

.message-card--state-error .timestamp {
  color: rgba(255, 210, 215, 0.78);
}

.message-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.6rem;
}

.message-card__meta {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.message-card__actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.badge--role {
  background: rgba(110, 140, 220, 0.2);
  color: #d0dcff;
}

.badge--id {
  background: rgba(70, 100, 160, 0.25);
  color: #cfdcff;
}

.badge--ghost {
  background: rgba(255, 255, 255, 0.08);
  color: #eaf3ff;
}

.badge--success {
  background: rgba(80, 255, 160, 0.2);
  color: #a0ffc8;
}

.badge--error {
  background: rgba(255, 100, 100, 0.2);
  color: #ffb0b0;
}

.timestamp {
  font-size: 0.8rem;
  color: rgba(204, 216, 255, 0.7);
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

/* 操作按钮区域 */
.message-card__actions-section {
  display: flex;
  gap: 0.6rem;
  padding: 0.5rem 0;
}

.ghost-button {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.6rem;
  border-radius: 8px;
  border: 1px solid rgba(90, 118, 190, 0.35);
  background: rgba(20, 30, 52, 0.6);
  color: #e5edff;
  font-size: 0.78rem;
  cursor: pointer;
}

.ghost-button:hover:not(:disabled) {
  background: rgba(48, 70, 110, 0.7);
}

.ghost-button--alert {
  border-color: rgba(255, 140, 140, 0.45);
  color: #ffb9b9;
}

.loading-dot {
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 50%;
  background: rgba(160, 182, 255, 0.8);
  position: relative;
}

.loading-dot::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  animation: pulse 1.2s ease-in-out infinite;
  background: inherit;
  opacity: 0.6;
}

.loading-dot--inline {
  width: 0.55rem;
  height: 0.55rem;
}

@keyframes pulse {
  0%, 100% {
    transform: scale(0.9);
    opacity: 0.6;
  }
  50% {
    transform: scale(1.2);
    opacity: 0.2;
  }
}

/* 请求信息区域 */
.message-card__request-info {
  border-radius: 12px;
  background: rgba(18, 26, 40, 0.7);
  border: 1px solid rgba(70, 100, 160, 0.28);
  padding: 0.75rem 1rem;
}

.request-info__label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: rgba(215, 228, 255, 0.8);
  margin-bottom: 0.5rem;
}

.request-info__content code {
  display: block;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.85rem;
  color: #b8d4ff;
  word-break: break-all;
  line-height: 1.5;
}

/* 可折叠的请求区域 */
.message-card__request-section {
  border: 1px solid rgba(80, 110, 180, 0.35);
  border-radius: 12px;
  background: rgba(20, 28, 45, 0.5);
  padding: 0.6rem 0.85rem;
}

.message-card__request-section summary {
  list-style: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 600;
  color: rgba(210, 225, 255, 0.85);
  font-size: 0.86rem;
  user-select: none;
}

.message-card__request-section summary::-webkit-details-marker {
  display: none;
}

.message-card__request-section[open] summary {
  color: rgba(230, 240, 255, 0.95);
  margin-bottom: 0.6rem;
}

.request-section__content {
  position: relative;
  border-radius: 10px;
  border: 1px solid rgba(80, 110, 180, 0.25);
  background: rgba(12, 18, 30, 0.8);
  padding: 0.75rem;
  overflow-x: auto;
}

.request-body__loading,
.request-body__error,
.request-body__empty {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.84rem;
  color: rgba(205, 220, 255, 0.8);
}

.request-body__error {
  color: rgba(255, 180, 180, 0.95);
}

.request-body__error button {
  margin-left: auto;
}

.request-section__content pre {
  margin: 0;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.82rem;
  line-height: 1.5;
  color: #c8dcff;
}

.request-section__content code {
  font-family: inherit;
}

.request-section__content .ghost-button {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
}

/* 哈希信息区域 */
.message-card__hash-info {
  border-radius: 12px;
  background: rgba(25, 18, 38, 0.6);
  border: 1px solid rgba(130, 110, 200, 0.3);
  padding: 0.75rem 1rem;
}

.hash-info__label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: rgba(223, 210, 255, 0.85);
  margin-bottom: 0.6rem;
}

.hash-info__values {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.hash-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.82rem;
}

.hash-label {
  color: rgba(210, 200, 230, 0.75);
  min-width: 5rem;
}

.hash-value {
  font-family: 'Consolas', 'Monaco', monospace;
  color: #d0b8ff;
  background: rgba(50, 40, 70, 0.5);
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
  border: 1px solid rgba(130, 110, 200, 0.25);
  font-size: 0.78rem;
}

/* 模型元数据区域 */
.message-card__model-meta {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  border-radius: 12px;
  background: rgba(18, 28, 40, 0.7);
  border: 1px solid rgba(80, 180, 130, 0.28);
  padding: 0.85rem 1rem;
}

.message-card--state-error .message-card__model-meta {
  background: rgba(52, 18, 28, 0.72);
  border-color: rgba(255, 140, 140, 0.35);
}

.meta-item {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  font-size: 0.88rem;
}

.meta-item .material-symbols-outlined {
  font-size: 1.1rem;
  color: #8fd4b8;
  margin-top: 0.1rem;
}

.meta-label {
  color: rgba(200, 220, 240, 0.75);
  min-width: 5rem;
  font-weight: 500;
}

.meta-value {
  color: #d8f0ff;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.86rem;
}

.token-details {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.84rem;
  color: #c8e8ff;
}

.token-details span {
  display: block;
}

.token-breakdown {
  margin-top: 0.4rem;
  border-top: 1px dashed rgba(140, 170, 220, 0.35);
  padding-top: 0.45rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.token-breakdown__label {
  font-size: 0.8rem;
  color: rgba(210, 230, 255, 0.85);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.token-breakdown__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.token-breakdown__item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.82rem;
}

.token-breakdown__item-label {
  color: rgba(205, 225, 255, 0.85);
}

.token-breakdown__item-value {
  color: #dff2ff;
}

.message-card__model-body {
  border-radius: 12px;
  background: rgba(18, 32, 48, 0.7);
  border: 1px solid rgba(90, 150, 220, 0.28);
  padding: 0.85rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.model-body__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: rgba(208, 226, 255, 0.88);
  font-size: 0.86rem;
  font-weight: 600;
}

.model-body__header .ghost-button {
  margin-left: auto;
  font-size: 0.75rem;
  padding: 0.25rem 0.55rem;
}

.model-section__title {
  font-weight: 600;
  color: rgba(218, 234, 255, 0.92);
}

.model-body__content {
  margin: 0;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.84rem;
  line-height: 1.5;
  color: #d8ecff;
  background: rgba(12, 18, 30, 0.82);
  border: 1px solid rgba(80, 110, 180, 0.25);
  border-radius: 10px;
  padding: 0.75rem;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.message-card__model-error {
  border-radius: 12px;
  background: rgba(48, 18, 30, 0.75);
  border: 1px solid rgba(255, 150, 150, 0.38);
  padding: 0.85rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.model-error__header {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.86rem;
  font-weight: 600;
  color: #ffcdcd;
}

.model-error__summary {
  margin: 0;
  font-size: 0.84rem;
  color: rgba(255, 215, 215, 0.92);
  line-height: 1.5;
}

.message-card__model-json {
  border: 1px solid rgba(90, 130, 200, 0.35);
  border-radius: 12px;
  background: rgba(16, 24, 38, 0.55);
  padding: 0.6rem 0.85rem;
}

.message-card--state-error .message-card__model-json {
  border-color: rgba(255, 140, 140, 0.4);
  background: rgba(46, 18, 30, 0.6);
}

.message-card__model-json[data-tone="error"] {
  border-color: rgba(255, 140, 140, 0.45);
  background: rgba(48, 22, 32, 0.6);
}

.message-card__model-json summary {
  list-style: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 600;
  color: rgba(210, 225, 255, 0.85);
  font-size: 0.86rem;
  user-select: none;
}

.message-card__model-json summary::-webkit-details-marker {
  display: none;
}

.message-card__model-json[open] summary {
  color: rgba(235, 245, 255, 0.95);
  margin-bottom: 0.6rem;
}

.message-card__model-json[data-tone="error"][open] summary {
  color: #ffdcdc;
}

.model-json-body {
  position: relative;
  border-radius: 10px;
  border: 1px solid rgba(80, 110, 180, 0.25);
  background: rgba(12, 18, 30, 0.82);
  padding: 0.75rem;
  overflow-x: auto;
}

.message-card__model-json[data-tone="error"] .model-json-body {
  border-color: rgba(255, 150, 150, 0.38);
  background: rgba(50, 20, 28, 0.78);
}

.model-json__loading,
.model-json__error,
.model-json__empty,
.model-json__placeholder {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.82rem;
  color: rgba(220, 230, 255, 0.82);
}

.model-json__error {
  color: rgba(255, 205, 205, 0.96);
}

.model-json__error .ghost-button {
  margin-left: auto;
}

.model-json__empty,
.model-json__placeholder {
  color: rgba(255, 225, 225, 0.86);
}

.model-json-body pre {
  margin: 0;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.82rem;
  line-height: 1.5;
  color: #c8dcff;
}

.message-card__model-json[data-tone="error"] .model-json-body pre {
  color: #ffe2e2;
}

.model-json-body .ghost-button {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
}

.model-body__header .material-symbols-outlined {
  color: #9dd4ff;
}

.model-error__header .material-symbols-outlined {
  color: #ff9d9d;
}

.message-card__model-json summary .material-symbols-outlined {
  font-size: 1.05rem;
  color: #8bc2ff;
}

.message-card__model-json[data-tone="error"] summary .material-symbols-outlined {
  color: #ff9b9b;
}
</style>
