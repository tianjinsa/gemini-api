<template>
  <section
    class="panel panel--topic"
    :class="{ 'panel--collapsed': isCollapsed }"
    @mouseenter="requestFocus"
    @focusin="requestFocus"
    @pointerdown.capture="requestFocus"
  >
    <aside v-if="stackDirection === 'right'" ref="desktopRailEl" class="panel-rail panel-rail--desktop">
      <div class="panel-rail__title" aria-hidden="true">话题列表</div>
        <div class="panel-rail__meta" v-if="selectedIp">
        <strong>{{ topicsCount }}</strong>
        <span>话题</span>
        <div class="panel-rail__hint" :title="selectedIp">IP {{ selectedIp }}</div>
      </div>
      <div class="panel-rail__meta panel-rail__meta--empty" v-else>
        <span>等待</span>
        <span>选择 IP</span>
      </div>
      <div class="panel-rail__controls">
        <div class="panel-rail__actions">
          <button
            ref="filterTriggerEl"
            class="control-button control-button--icon"
            type="button"
            aria-label="过滤话题"
            :title="topicFilterActive ? `过滤：${dashboard.topicFilter}` : '过滤话题'"
            :class="{ 'control-button--active': topicFilterActive }"
            :disabled="!selectedIp"
            @mouseenter="openTopicFilterOverlay($event)"
            @focus="openTopicFilterOverlay($event)"
            @click="openTopicFilterOverlay($event)"
            @keydown.enter.prevent="openTopicFilterOverlay($event)"
            @keydown.space.prevent="openTopicFilterOverlay($event)"
          >
            <IconSymbol name="search" />
          </button>
          <button
            class="control-button control-button--icon"
            type="button"
            title="刷新话题"
            aria-label="刷新话题"
            :disabled="!selectedIp || topicsLoading"
            @click="refresh"
          >
            <IconSymbol name="sync" />
          </button>
          <button
            class="control-button control-button--icon control-button--danger"
            type="button"
            title="删除话题"
            aria-label="删除话题"
            :disabled="!selectedTopic"
            @click="deleteTopic"
          >
            <IconSymbol name="delete" />
          </button>
        </div>
      </div>
    </aside>

    <div class="panel-main">
      <header v-if="stackDirection === 'down'" ref="mobileHeaderEl" class="panel-header panel-header--mobile">
        <div class="panel-header__title">
          <div class="panel-header__primary">
            <h2>话题列表</h2>
            <span v-if="selectedIp" class="panel-header__count">{{ topicsCount }}</span>
          </div>
          <p v-if="selectedIp" class="panel-header__hint">{{ topicsCount }} 个话题 · IP {{ selectedIp }}</p>
          <p v-else class="panel-header__hint">等待选择 IP</p>
        </div>
        <div class="panel-header__controls">
          <div class="panel-header__actions">
            <button
              class="control-button control-button--icon"
              type="button"
              aria-label="过滤话题"
              :title="topicFilterActive ? `过滤：${dashboard.topicFilter}` : '过滤话题'"
              :class="{ 'control-button--active': topicFilterActive }"
              :disabled="!selectedIp"
              @mouseenter="openTopicFilterOverlay($event)"
              @focus="openTopicFilterOverlay($event)"
              @click="openTopicFilterOverlay($event)"
              @keydown.enter.prevent="openTopicFilterOverlay($event)"
              @keydown.space.prevent="openTopicFilterOverlay($event)"
            >
              <IconSymbol name="search" />
            </button>
            <button
              class="control-button control-button--icon"
              type="button"
              title="刷新话题"
              aria-label="刷新话题"
              :disabled="!selectedIp || topicsLoading"
              @click="refresh"
            >
              <IconSymbol name="sync" />
            </button>
            <button
              class="control-button control-button--icon control-button--danger"
              type="button"
              title="删除话题"
              aria-label="删除话题"
              :disabled="!selectedTopic"
              @click="deleteTopic"
            >
              <IconSymbol name="delete" />
            </button>
          </div>
        </div>
      </header>

      <div class="panel-content topic-list">
        <article
          v-for="topic in topics"
          :key="topic.tid"
          class="topic-item"
          :class="{
            'topic-item--active': topic.tid === selectedTopic,
            'topic-item--unread': isTopicUnread(topic)
          }"
          @click="selectTopic(topic.tid)"
        >
          <header class="topic-item__header">
            <div class="topic-item__identity">
              <div class="topic-item__title-group">
                <span
                  class="topic-item__title"
                  :title="topicHoverLabel(topic)"
                >
                  {{ topicDisplayLabel(topic) }}
                </span>
                <!-- <span v-if="!topicTitle(topic)" class="topic-item__id">{{ topic.tid }}</span> -->
              </div>
              <span v-if="topic.status" class="badge badge--ghost">{{ topic.status }}</span>
            </div>
            <span class="badge badge--ghost" :title="formatDateTime(topic.upAt)">
              {{ relativeTimeOf(topic.upAt) }}
            </span>
          </header>
          <div class="topic-item__stats">
            <dl>
              <dt>消息</dt>
              <dd>{{ topic.msgCnt }}</dd>
            </dl>
            <dl>
              <dt>入流量</dt>
              <dd>{{ formatBytes(topic.inBytes) }}</dd>
            </dl>
            <dl>
              <dt>出流量</dt>
              <dd>{{ formatBytes(topic.outBytes) }}</dd>
            </dl>
            <dl>
              <dt>创建</dt>
              <dd>{{ formatDateTime(topic.ctAt) }}</dd>
            </dl>
          </div>
        </article>
        <div v-if="!topics.length" class="empty-state">
          <p>请选择左侧 IP 以查看话题。</p>
        </div>
      </div>

      <footer class="panel-footer">
        <button
          class="control-button control-button--icon"
          type="button"
          title="上一页"
          aria-label="上一页"
          :disabled="dashboard.topicPage <= 1"
          @click="dashboard.topicPage--"
        >
          <IconSymbol name="chevron_left" />
        </button>
        <span class="page-info">第 {{ dashboard.topicPage }} 页 / 共 {{ topicTotalPages }} 页</span>
        <button
          class="control-button control-button--icon"
          type="button"
          title="下一页"
          aria-label="下一页"
          :disabled="dashboard.topicPage >= topicTotalPages"
          @click="dashboard.topicPage++"
        >
          <IconSymbol name="chevron_right" />
        </button>
      </footer>
    </div>
  </section>
</template>

<script setup lang="ts">
import IconSymbol from '@/components/IconSymbol.vue';
import { computed, inject, ref, watch } from 'vue';
import { useDashboardStore } from '@/stores/dashboard';
import { useUiStore } from '@/stores/ui';
import { formatBytes, formatDateTime, formatRelative } from '@/utils/format';
import { useRelativeTicker } from '@/composables/relativeTime';
import { useResizeObserver } from '@vueuse/core';
import { PANEL_LAYOUT_HOOK_KEY } from '@/composables/panelLayout';
import { useControlOverlayStore } from '@/stores/controlOverlay';

const props = defineProps<{ 
  collapsed?: boolean; 
  mainSpan?: number;
  stackDirection?: 'right' | 'down';
}>();
const emit = defineEmits<{ (e: 'request-focus'): void }>();

const dashboard = useDashboardStore();
const ui = useUiStore();

const selectedIp = computed(() => dashboard.selectedIp);
const selectedTopic = computed(() => dashboard.selectedTopic);

const topics = computed(() => dashboard.paginatedTopics);
const topicTotalPages = computed(() => Math.max(1, Math.ceil(dashboard.currentIpTopics.length / dashboard.topicPageSize)));
const topicsCount = computed(() => dashboard.currentIpTopics.length);
const topicFilterActive = computed(() => dashboard.topicFilter.trim().length > 0);
const topicsLoading = computed(() => {
  const ip = selectedIp.value;
  return ip ? dashboard.loadingTopics.get(ip) === true : false;
});
const relativeTicker = useRelativeTicker();

const desktopRailEl = ref<HTMLElement | null>(null);
const mobileHeaderEl = ref<HTMLElement | null>(null);
const layoutHooks = inject(PANEL_LAYOUT_HOOK_KEY, null);
const overlayControl = useControlOverlayStore();
const filterTriggerEl = ref<HTMLButtonElement | null>(null);
const isCollapsed = computed(() => props.collapsed === true);

watch(selectedIp, (value) => {
  if (!value && overlayControl.visible && overlayControl.controlId === 'topic-filter') {
    overlayControl.cancel();
  }
});

if (layoutHooks?.topicList) {
  useResizeObserver(desktopRailEl, (entries) => {
    const entry = entries[0];
    if (!entry) return;
    const boxSize = Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0] : entry.borderBoxSize;
    const width = boxSize ? boxSize.inlineSize : entry.contentRect.width;
    if (width > 0) {
      layoutHooks.topicList.reportHeaderSize({ width, height: 0 });
    }
  });
  useResizeObserver(mobileHeaderEl, (entries) => {
    const entry = entries[0];
    if (!entry) return;
    const boxSize = Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0] : entry.borderBoxSize;
    const height = boxSize ? boxSize.blockSize : entry.contentRect.height;
    if (height > 0) {
      layoutHooks.topicList.reportHeaderSize({ width: 0, height });
    }
  });
}

function selectTopic(tid: string) {
  dashboard.setSelectedTopic(tid);
}

function requestFocus() {
  emit('request-focus');
}

function resolveAnchor(event: Event | undefined, fallback: HTMLElement | null) {
  const candidate = event?.currentTarget;
  if (candidate instanceof HTMLElement) {
    return candidate;
  }
  return fallback;
}

function openTopicFilterOverlay(event?: Event) {
  if (!selectedIp.value) return;
  const anchor = resolveAnchor(event, filterTriggerEl.value);
  if (!anchor) return;
  if (overlayControl.visible && overlayControl.controlId === 'topic-filter') {
    if (overlayControl.closing) {
      overlayControl.finalize();
    } else {
      overlayControl.refreshAnchorRect();
      return;
    }
  }

  const initialValue = dashboard.topicFilter;
  overlayControl.open({
    controlId: 'topic-filter',
    anchorEl: anchor,
    variant: 'filter',
    label: '过滤话题',
    icon: 'search',
    value: initialValue,
    expandedWidth: 280,
    onInput(value) {
      dashboard.topicFilter = value;
    },
    onCommit(value) {
      dashboard.topicFilter = value.trim();
    },
    onCancel() {
      dashboard.topicFilter = initialValue;
    }
  });
}

function relativeTimeOf(ts: number | string | Date) {
  void relativeTicker.value;
  return formatRelative(ts);
}

function topicTitle(topic: (typeof topics)['value'][number]) {
  const title = topic.title;
  if (typeof title === 'string' && title.trim().length > 0) {
    return title.trim();
  }
  return null;
}

function topicDisplayLabel(topic: (typeof topics)['value'][number]) {
  return topicTitle(topic) ?? topic.tid;
}

function topicHoverLabel(topic: (typeof topics)['value'][number]) {
  const title = topicTitle(topic);
  if (!title) return topic.tid;
  return `${title} (ID: ${topic.tid})`;
}

function isTopicUnread(topic: (typeof topics)['value'][number]) {
  const ip = selectedIp.value;
  if (!ip) return false;
  return dashboard.isTopicUnread(ip, topic.tid);
}

async function refresh() {
  if (!selectedIp.value) return;
  await dashboard.ensureTopics(selectedIp.value, true);
}

async function deleteTopic() {
  if (!selectedIp.value || !selectedTopic.value) return;
  const ok = await ui.confirm({
    title: '删除话题',
    message: `确定永久删除话题 “${selectedTopic.value}” 吗？该操作不可恢复。`,
    confirmLabel: '删除',
    destructive: true
  });
  if (!ok) return;
  try {
    await dashboard.removeTopics(selectedIp.value, [selectedTopic.value]);
    ui.pushToast({ type: 'success', title: '删除成功', message: '话题已删除。' });
  } catch (error) {
    ui.pushToast({ type: 'error', title: '删除失败', message: error instanceof Error ? error.message : String(error) });
  }
}

function resetToCollapsedState() {
  if (!overlayControl.visible) {
    return;
  }
  if (overlayControl.controlId === 'topic-filter') {
    overlayControl.requestClose();
  }
}

defineExpose({
  resetToCollapsedState
});
</script>

<style scoped>
.panel--topic {
  --panel-bg: rgba(10, 16, 26, 0.78);
  --panel-border: rgba(60, 88, 140, 0.25);
}

.topic-list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.topic-item {
  position: relative;
  padding: 0.75rem 0.9rem;
  border-radius: 13px;
  background: rgba(20, 28, 44, 0.7);
  border: 1px solid transparent;
  cursor: pointer;
  transition: border 0.2s ease, transform 0.2s ease;
}

.topic-item:hover {
  border-color: rgba(120, 150, 240, 0.35);
}

.topic-item--active {
  border-color: rgba(110, 185, 255, 0.55);
  background: rgba(38, 56, 88, 0.68);
}

.topic-item--unread::before {
  content: '';
  width: 9px;
  height: 9px;
  background: #65f7b1;
  border-radius: 50%;
  position: absolute;
  top: 14px;
  left: 14px;
}

.topic-item__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
  gap: 0.6rem;
}

.topic-item__identity {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.topic-item__title-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
}

.topic-item__title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #f7fbff;
  max-width: 260px;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}

.topic-item__id {
  font-weight: 600;
  font-size: 0.92rem;
  color: #f4f7ff;
}

.topic-item__stats {
  display: flex;
  gap: 0.9rem;
  flex-wrap: wrap;
}

.topic-item__stats dl {
  margin: 0;
}

.topic-item__stats dt {
  font-size: 0.66rem;
  text-transform: uppercase;
  opacity: 0.6;
}

.topic-item__stats dd {
  margin: 0.15rem 0 0;
  font-weight: 600;
  font-size: 0.88rem;
}

.panel-footer {
  padding: 0.7rem 1.1rem 1rem;
  border-top: 1px solid rgba(82, 110, 166, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
}

.page-info {
  color: rgba(200, 216, 255, 0.68);
  font-size: 0.78rem;
}
</style>
