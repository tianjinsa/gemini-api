<template>
  <section
    class="panel panel--message"
    :class="{ 'panel--collapsed': isCollapsed }"
    :style="panelStyle"
    @mouseenter="requestFocus"
    @focusin="requestFocus"
    @pointerdown.capture="requestFocus"
  >
    <aside v-if="stackDirection === 'right'" ref="desktopRailEl" class="panel-rail panel-rail--desktop">
      <div class="panel-rail__title" aria-hidden="true">消息详情</div>
      <div v-if="selectedTopic" class="panel-rail__meta">
        <strong>{{ topicInfo?.msgCnt ?? messages.length }}</strong>
        <span>消息</span>
        <div v-if="topicDisplayTitle" class="panel-rail__hint" :title="topicDisplayTitle">
          标题 {{ topicDisplayTitle }}
        </div>
        <div class="panel-rail__hint" :title="selectedTopic">话题 {{ selectedTopic }}</div>
        <div class="panel-rail__hint" v-if="selectedIp" :title="selectedIp">IP {{ selectedIp }}</div>
      </div>
      <div v-else class="panel-rail__meta panel-rail__meta--empty">
        <span>等待</span>
        <span>选择话题</span>
      </div>
      <div v-if="topicInfo" class="panel-rail__stats">
        <span class="badge badge--ghost">入 {{ formatBytes(topicInfo.inBytes) }}</span>
        <span class="badge badge--ghost">出 {{ formatBytes(topicInfo.outBytes) }}</span>
        <span class="badge badge--ghost" :title="formatDateTime(topicInfo.upAt)">
          更新 {{ topicUpdatedAgo }}
        </span>
      </div>
      <div class="panel-rail__controls">
        <div class="panel-rail__actions">
          <button
            class="control-button control-button--icon"
            type="button"
            title="刷新消息"
            aria-label="刷新消息"
            :disabled="!selectedTopic || messagesRefreshing"
            @click="refreshMessages"
          >
            <IconSymbol name="sync" />
          </button>
        </div>
      </div>
    </aside>

    <div class="panel-main">
      <header v-if="stackDirection === 'down'" ref="mobileHeaderEl" class="panel-header panel-header--mobile">
        <div class="panel-header__title">
          <div class="panel-header__primary">
            <h2>消息详情</h2>
            <span v-if="selectedTopic" class="panel-header__count">{{ topicInfo?.msgCnt ?? messages.length }}</span>
          </div>
          <p v-if="selectedTopic" class="panel-header__hint">
            <span v-if="topicDisplayTitle" class="topic-header__title" :title="topicDisplayTitle">{{ topicDisplayTitle }}</span>
            <span>话题 {{ selectedTopic }}</span>
            ·
            <span>IP {{ selectedIp ?? '—' }}</span>
          </p>
          <p v-else class="panel-header__hint">等待选择话题</p>
        </div>
        <div class="panel-header__controls">
          <div v-if="topicInfo" class="panel-header__meta">
            <span class="badge badge--ghost">入 {{ formatBytes(topicInfo.inBytes) }}</span>
            <span class="badge badge--ghost">出 {{ formatBytes(topicInfo.outBytes) }}</span>
            <span class="badge badge--ghost" :title="formatDateTime(topicInfo.upAt)">更新 {{ topicUpdatedAgo }}</span>
          </div>
          <div class="panel-header__actions">
            <button
              class="control-button control-button--icon"
              type="button"
              title="刷新消息"
              aria-label="刷新消息"
              :disabled="!selectedTopic || messagesRefreshing"
              @click="refreshMessages"
            >
              <IconSymbol name="sync" />
            </button>
          </div>
        </div>
      </header>

      <div v-if="selectedTopic" ref="listEl" class="panel-content message-list">
        <article v-if="systemBubble" class="topic-hash-card">
          <header class="topic-hash-card__header">
            <div class="topic-hash-card__title">
              <IconSymbol name="tag" />
              <span>{{ systemBubble.title }}</span>
            </div>
          </header>
          <div class="topic-hash-card__content">
            <div v-if="systemBubble.hashNoReason" class="hash-item">
              <span class="hash-label">无推理:</span>
              <code class="hash-value" :title="systemBubble.hashNoReason">{{ shortHash(systemBubble.hashNoReason) }}</code>
            </div>
            <div v-if="systemBubble.hashWithReason" class="hash-item">
              <span class="hash-label">含推理:</span>
              <code class="hash-value" :title="systemBubble.hashWithReason">{{ shortHash(systemBubble.hashWithReason) }}</code>
            </div>
          </div>
        </article>
        <MessageCard
          v-for="msg in messages"
          :key="msg.id"
          :message="msg"
          :root-el="listEl"
        />
        <div v-if="!messages.length" class="empty-state">
          <p>暂无消息。</p>
        </div>
      </div>
      <div v-else class="panel-content empty-state">
        <p>请选择话题查看消息详情。</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import IconSymbol from '@/components/IconSymbol.vue';
import { computed, inject, ref } from 'vue';
import { useDashboardStore } from '@/stores/dashboard';
import { useUiStore } from '@/stores/ui';
import { formatBytes, formatDateTime } from '@/utils/format';
import MessageCard from './MessageCard.vue';
import { useRelativeTime } from '@/composables/relativeTime';
import { useResizeObserver } from '@vueuse/core';
import { PANEL_LAYOUT_HOOK_KEY } from '@/composables/panelLayout';

const props = defineProps<{ 
  collapsed?: boolean; 
  mainSpan?: number;
  stackDirection?: 'right' | 'down';
}>();
const emit = defineEmits<{ (e: 'request-focus'): void }>();

const panelStyle = computed<Record<string, string> | undefined>(() => {
  if (props.stackDirection === 'right' && typeof props.mainSpan === 'number' && props.mainSpan >= 0) {
    const width = Math.max(props.mainSpan, 0);
    return { width: `${width}px` };
  }
  return undefined;
});

const dashboard = useDashboardStore();
const ui = useUiStore();

const selectedIp = computed(() => dashboard.selectedIp);
const selectedTopic = computed(() => dashboard.selectedTopic);
const rawMessages = computed(() => dashboard.currentTopicMessages);
const listEl = ref<HTMLElement | null>(null);
const desktopRailEl = ref<HTMLElement | null>(null);
const mobileHeaderEl = ref<HTMLElement | null>(null);
const layoutHooks = inject(PANEL_LAYOUT_HOOK_KEY, null);
const isCollapsed = computed(() => props.collapsed === true);

if (layoutHooks?.messageList) {
  useResizeObserver(desktopRailEl, (entries) => {
    const entry = entries[0];
    if (!entry) return;
    const boxSize = Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0] : entry.borderBoxSize;
    const width = boxSize ? boxSize.inlineSize : entry.contentRect.width;
    if (width > 0) {
      layoutHooks.messageList.reportHeaderSize({ width, height: 0 });
    }
  });
  useResizeObserver(mobileHeaderEl, (entries) => {
    const entry = entries[0];
    if (!entry) return;
    const boxSize = Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0] : entry.borderBoxSize;
    const height = boxSize ? boxSize.blockSize : entry.contentRect.height;
    if (height > 0) {
      layoutHooks.messageList.reportHeaderSize({ width: 0, height });
    }
  });
}

const topicInfo = computed(() => {
  if (!selectedTopic.value) return null;
  const topic = dashboard.currentIpTopics.find(item => item.tid === selectedTopic.value);
  return topic ?? null;
});

const topicDisplayTitle = computed(() => {
  const title = topicInfo.value?.title;
  if (typeof title === 'string' && title.trim().length > 0) {
    return title.trim();
  }
  return null;
});

const topicHashes = computed(() => ({
  hashNoReason: dashboard.currentTopicMeta?.topicHashNoReason ?? null,
  hashWithReason: dashboard.currentTopicMeta?.topicHashWithReason ?? null
}));

const systemBubble = computed(() => {
  // 优先显示话题哈希
  const hashes = topicHashes.value;
  if (hashes.hashNoReason || hashes.hashWithReason) {
    return {
      title: '话题哈希',
      hashNoReason: hashes.hashNoReason,
      hashWithReason: hashes.hashWithReason,
      messageId: null as string | null,
    };
  }
  return null;
});

const messages = computed(() => {
  return rawMessages.value;
});

const messagesRefreshing = computed(() => {
  const ip = selectedIp.value;
  const topic = selectedTopic.value;
  if (!ip || !topic) return false;
  return dashboard.loadingMessages.get(`${ip}:${topic}`) === true;
});

const topicUpdatedAgo = useRelativeTime(() => topicInfo.value?.upAt ?? null);

function shortHash(hash: string): string {
  if (!hash) return '';
  return hash.length > 16 ? `${hash.slice(0, 8)}...${hash.slice(-8)}` : hash;
}

async function refreshMessages() {
  if (!selectedIp.value || !selectedTopic.value) return;
  await dashboard.ensureMessages(selectedIp.value, selectedTopic.value, true);
}

function requestFocus() {
  emit('request-focus');
}

function resetToCollapsedState() {
  // 当前面板没有需要重置的本地展开状态
}

defineExpose({
  resetToCollapsedState
});
</script>

<style scoped>
.panel--message {
  --panel-bg: rgba(8, 15, 24, 0.75);
  --panel-border: rgba(54, 80, 130, 0.25);
}

.message-list {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.topic-hash-card {
  padding: 0.85rem 1rem;
  border-radius: 14px;
  border: 1px solid rgba(80, 180, 130, 0.28);
  background: rgba(18, 28, 40, 0.7);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.topic-hash-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  font-size: 0.85rem;
  color: #dbe6ff;
}

.topic-hash-card__title {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 600;
  color: #8fd4b8;
}

.topic-hash-card__content {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.topic-hash-card .hash-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.82rem;
}

.topic-hash-card .hash-label {
  color: rgba(200, 220, 240, 0.75);
  min-width: 5rem;
  font-weight: 500;
}

.topic-hash-card .hash-value {
  font-family: 'Consolas', 'Monaco', monospace;
  color: #c8e8ff;
  background: rgba(12, 18, 30, 0.8);
  padding: 0.3rem 0.6rem;
  border-radius: 6px;
  border: 1px solid rgba(80, 110, 180, 0.25);
  font-size: 0.78rem;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.panel-header__meta {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.topic-header__title {
  font-weight: 600;
  margin-right: 0.35rem;
}

.panel-rail__stats .badge {
  text-transform: none;
  letter-spacing: 0.02em;
}
</style>
