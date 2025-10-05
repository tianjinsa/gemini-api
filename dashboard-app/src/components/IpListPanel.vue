<template>
  <section
    class="panel panel--ip"
    :class="{ 'panel--collapsed': isCollapsed }"
    @mouseenter="requestFocus"
    @focusin="requestFocus"
    @pointerdown.capture="requestFocus"
  >
    <aside v-if="stackDirection === 'right'" ref="desktopHeaderEl" class="panel-rail panel-rail--desktop">
      <div class="panel-rail__title" aria-hidden="true">IP 列表</div>
      <div class="panel-rail__meta" v-if="totalIpCount">
        <strong>{{ totalIpCount }}</strong>
        <span>IP</span>
      </div>
      <div class="panel-rail__controls">
        <div class="panel-rail__actions">
          <button
            ref="filterTriggerEl"
            class="control-button control-button--icon"
            type="button"
            aria-label="过滤 IP"
            :title="ipFilterActive ? `过滤：${dashboard.ipFilter}` : '过滤 IP'"
            :class="{ 'control-button--active': ipFilterActive }"
            @mouseenter="openFilterOverlay($event)"
            @focus="openFilterOverlay($event)"
            @click="openFilterOverlay($event)"
            @keydown.enter.prevent="openFilterOverlay($event)"
            @keydown.space.prevent="openFilterOverlay($event)"
          >
            <IconSymbol name="search" />
          </button>
          <button
            ref="sortTriggerEl"
            class="control-button control-button--icon"
            type="button"
            aria-label="排序方式"
            :title="`排序：${activeSortLabel}`"
            :class="{ 'control-button--active': dashboard.ipSortKey !== defaultSortKey }"
            @mouseenter="openSortOverlay($event)"
            @focus="openSortOverlay($event)"
            @click="openSortOverlay($event)"
            @keydown.enter.prevent="openSortOverlay($event)"
            @keydown.space.prevent="openSortOverlay($event)"
          >
            <IconSymbol name="sort" />
          </button>
          <button
            class="control-button control-button--icon"
            type="button"
            title="刷新"
            aria-label="刷新"
            :disabled="dashboard.loadingFullStats"
            @click="dashboard.refreshFullStats"
          >
            <IconSymbol name="sync" />
          </button>
          <button
            class="control-button control-button--icon"
            type="button"
            title="封禁管理"
            aria-label="封禁管理"
            @click="ui.toggleBanManager(true)"
          >
            <IconSymbol name="gpp_maybe" />
          </button>
          <button
            class="control-button control-button--icon"
            type="button"
            title="别名管理"
            aria-label="别名管理"
            @click="ui.toggleAliasManager(true)"
          >
            <IconSymbol name="key" />
          </button>
          <button
            class="control-button control-button--icon control-button--danger"
            type="button"
            title="删除当前 IP"
            aria-label="删除当前 IP"
            :disabled="!selectedIp"
            @click="onDeleteCurrentIp"
          >
            <IconSymbol name="delete" />
          </button>
        </div>
      </div>
    </aside>

    <div class="panel-main">
      <header v-if="stackDirection === 'down'" ref="mobileHeaderEl" class="panel-header panel-header--mobile">
        <div class="panel-header__primary">
          <h2>IP 列表</h2>
          <span v-if="totalIpCount" class="panel-header__count">{{ totalIpCount }}</span>
        </div>
        <div class="panel-header__controls">
          <div class="panel-header__actions">
            <button
              class="control-button control-button--icon"
              type="button"
              aria-label="过滤 IP"
              :title="ipFilterActive ? `过滤：${dashboard.ipFilter}` : '过滤 IP'"
              :class="{ 'control-button--active': ipFilterActive }"
              @mouseenter="openFilterOverlay($event)"
              @focus="openFilterOverlay($event)"
              @click="openFilterOverlay($event)"
              @keydown.enter.prevent="openFilterOverlay($event)"
              @keydown.space.prevent="openFilterOverlay($event)"
            >
              <IconSymbol name="search" />
            </button>
            <button
              class="control-button control-button--icon"
              type="button"
              aria-label="排序方式"
              :title="`排序：${activeSortLabel}`"
              :class="{ 'control-button--active': dashboard.ipSortKey !== defaultSortKey }"
              @mouseenter="openSortOverlay($event)"
              @focus="openSortOverlay($event)"
              @click="openSortOverlay($event)"
              @keydown.enter.prevent="openSortOverlay($event)"
              @keydown.space.prevent="openSortOverlay($event)"
            >
              <IconSymbol name="sort" />
            </button>
            <button
              class="control-button control-button--icon"
              type="button"
              title="刷新"
              aria-label="刷新"
              :disabled="dashboard.loadingFullStats"
              @click="dashboard.refreshFullStats"
            >
              <IconSymbol name="sync" />
            </button>
            <button
              class="control-button control-button--icon"
              type="button"
              title="封禁管理"
              aria-label="封禁管理"
              @click="ui.toggleBanManager(true)"
            >
              <IconSymbol name="gpp_maybe" />
            </button>
            <button
              class="control-button control-button--icon"
              type="button"
              title="别名管理"
              aria-label="别名管理"
              @click="ui.toggleAliasManager(true)"
            >
              <IconSymbol name="key" />
            </button>
            <button
              class="control-button control-button--icon control-button--danger"
              type="button"
              title="删除当前 IP"
              aria-label="删除当前 IP"
              :disabled="!selectedIp"
              @click="onDeleteCurrentIp"
            >
              <IconSymbol name="delete" />
            </button>
          </div>
        </div>
      </header>

      <div class="panel-content ip-list">
        <article
          v-for="item in ipItems"
          :key="item.ip"
          class="ip-item"
          :class="{ 'ip-item--active': item.ip === selectedIp, 'ip-item--unread': item.unread }"
          @click="selectIp(item.ip)"
        >
          <div class="ip-item__header">
            <div class="ip-item__identity">
              <span class="ip-item__name">{{ item.ip }}</span>
              <span v-if="item.summary.realIPs?.length" class="ip-item__alias">
                <span class="ip-item__alias-text">真实 IP ×{{ item.summary.realIPs.length }}</span>
                <span class="ip-item__alias-popover">
                  <strong>真实 IP</strong>
                  <ul>
                    <li v-for="real in item.summary.realIPs" :key="real">
                      {{ real }}
                    </li>
                  </ul>
                </span>
              </span>
            </div>
            <span class="badge badge--ghost" :title="absoluteTime(item)">
              {{ relativeTime(item) }}
            </span>
          </div>
          <div class="ip-item__metrics">
            <dl>
              <dt>请求</dt>
              <dd>{{ formatNumber(item.summary.reqs) }}</dd>
            </dl>
            <dl>
              <dt>入流量</dt>
              <dd>{{ formatBytes(item.summary.inTfc) }}</dd>
            </dl>
            <dl>
              <dt>出流量</dt>
              <dd>{{ formatBytes(item.summary.outTfc) }}</dd>
            </dl>
          </div>
        </article>
        <div v-if="!ipItems.length" class="empty-state">
          <p>暂无 IP 数据</p>
        </div>
      </div>

      <footer class="panel-footer">
        <button class="control-button control-button--icon" :disabled="dashboard.ipPage <= 1" aria-label="上一页" title="上一页" @click="dashboard.ipPage--">
          <IconSymbol name="chevron_left" />
        </button>
        <span class="page-info">第 {{ dashboard.ipPage }} 页 / 共 {{ totalPages }} 页</span>
        <button
          class="control-button control-button--icon"
          :disabled="dashboard.ipPage >= totalPages"
          aria-label="下一页"
          title="下一页"
          @click="dashboard.ipPage++"
        >
          <IconSymbol name="chevron_right" />
        </button>
      </footer>
    </div>
  </section>
</template>

<script setup lang="ts">
import IconSymbol from '@/components/IconSymbol.vue';
import { computed, inject, ref } from 'vue';
import { useDashboardStore, type IPSortKey } from '@/stores/dashboard';
import { useUiStore } from '@/stores/ui';
import { formatBytes, formatDateTime, formatRelative, formatNumber } from '@/utils/format';
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

const ipItems = computed(() => dashboard.paginatedIps);
const selectedIp = computed(() => dashboard.selectedIp);
const totalPages = computed(() => Math.max(1, Math.ceil(dashboard.sortedIpList.length / dashboard.ipPageSize)));
const totalIpCount = computed(() => dashboard.sortedIpList.length);
const ipFilterActive = computed(() => dashboard.ipFilter.trim().length > 0);
const relativeTicker = useRelativeTicker();

const sortOptions = [
  { value: 'recent', label: '最近活跃' },
  { value: 'reqs', label: '请求数' },
  { value: 'in', label: '入流量' },
  { value: 'out', label: '出流量' }
];

const defaultSortKey = sortOptions[0]?.value ?? '';

const desktopHeaderEl = ref<HTMLElement | null>(null);
const mobileHeaderEl = ref<HTMLElement | null>(null);
const layoutHooks = inject(PANEL_LAYOUT_HOOK_KEY, null);

const overlayControl = useControlOverlayStore();
const filterTriggerEl = ref<HTMLButtonElement | null>(null);
const sortTriggerEl = ref<HTMLButtonElement | null>(null);
const isCollapsed = computed(() => props.collapsed === true);

const activeSortLabel = computed(() => {
  const match = sortOptions.find((option) => option.value === dashboard.ipSortKey);
  return match?.label ?? '最近活跃';
});

if (layoutHooks?.ipList) {
  useResizeObserver(desktopHeaderEl, (entries) => {
    const entry = entries[0];
    if (!entry) return;
    const boxSize = Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0] : entry.borderBoxSize;
    const width = boxSize ? boxSize.inlineSize : entry.contentRect.width;
    if (width > 0) {
      layoutHooks.ipList.reportHeaderSize({ width, height: 0 });
    }
  });
  useResizeObserver(mobileHeaderEl, (entries) => {
    const entry = entries[0];
    if (!entry) return;
    const boxSize = Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0] : entry.borderBoxSize;
    const height = boxSize ? boxSize.blockSize : entry.contentRect.height;
    if (height > 0) {
      layoutHooks.ipList.reportHeaderSize({ width: 0, height });
    }
  });
}

function selectIp(ip: string) {
  dashboard.setSelectedIp(ip);
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

function openFilterOverlay(event?: Event) {
  const anchor = resolveAnchor(event, filterTriggerEl.value);
  if (!anchor) return;
  if (overlayControl.visible && overlayControl.controlId === 'ip-filter') {
    if (overlayControl.closing) {
      overlayControl.finalize();
    } else {
      overlayControl.refreshAnchorRect();
      return;
    }
  }

  const initialValue = dashboard.ipFilter;
  overlayControl.open({
    controlId: 'ip-filter',
    anchorEl: anchor,
    variant: 'filter',
    label: '过滤 IP',
    icon: 'search',
    value: initialValue,
    expandedWidth: 280,
    onInput(value) {
      dashboard.ipFilter = value;
    },
    onCommit(value) {
      dashboard.ipFilter = value.trim();
    },
    onCancel() {
      dashboard.ipFilter = initialValue;
    }
  });
}

function openSortOverlay(event?: Event) {
  const anchor = resolveAnchor(event, sortTriggerEl.value);
  if (!anchor) return;
  if (overlayControl.visible && overlayControl.controlId === 'ip-sort') {
    if (overlayControl.closing) {
      overlayControl.finalize();
    } else {
      overlayControl.refreshAnchorRect();
      return;
    }
  }

  const initialSort = dashboard.ipSortKey as IPSortKey;
  overlayControl.open({
    controlId: 'ip-sort',
    anchorEl: anchor,
    variant: 'sort',
    label: '排序方式',
    icon: 'sort',
    value: dashboard.ipSortKey,
    options: sortOptions,
    onCommit(value) {
      dashboard.ipSortKey = value as IPSortKey;
    },
    onCancel() {
      dashboard.ipSortKey = initialSort;
    }
  });
}

function relativeTime(item: (typeof ipItems)['value'][number]) {
  const { lModReqAt, lTopUpdAt } = item.summary;
  const ts = lModReqAt ?? lTopUpdAt;
  void relativeTicker.value;
  return ts ? formatRelative(ts) : '—';
}

function absoluteTime(item: (typeof ipItems)['value'][number]) {
  const { lModReqAt, lTopUpdAt } = item.summary;
  const ts = lModReqAt ?? lTopUpdAt;
  return ts ? formatDateTime(ts) : '—';
}

async function onDeleteCurrentIp() {
  if (!selectedIp.value) return;
  const ok = await ui.confirm({
    title: '删除 IP 数据',
    message: `确定要删除 IP “${selectedIp.value}” 的所有话题和消息吗？该操作不可恢复。`,
    confirmLabel: '删除',
    destructive: true
  });
  if (!ok) return;
  try {
    await dashboard.removeIp(selectedIp.value);
    ui.pushToast({ type: 'success', title: '删除成功', message: 'IP 数据已清理。' });
  } catch (error) {
    ui.pushToast({
      type: 'error',
      title: '删除失败',
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

function resetToCollapsedState() {
  if (!overlayControl.visible) {
    return;
  }
  if (overlayControl.controlId === 'ip-filter' || overlayControl.controlId === 'ip-sort') {
    overlayControl.requestClose();
  }
}

defineExpose({
  resetToCollapsedState
});
</script>

<style scoped>
.panel--ip {
  --panel-bg: rgba(12, 18, 28, 0.78);
  --panel-border: rgba(60, 88, 140, 0.28);
}

.ip-item {
  position: relative;
  border-radius: 14px;
  padding: 0.78rem 0.95rem;
  background: rgba(24, 34, 56, 0.68);
  border: 1px solid transparent;
  cursor: pointer;
  transition: border 0.2s ease, transform 0.2s ease;
}

.ip-item:hover {
  border-color: rgba(110, 150, 250, 0.4);
  transform: translateY(-1px);
}

.ip-item--active {
  border-color: rgba(120, 190, 255, 0.6);
  background: rgba(40, 62, 96, 0.75);
}

.ip-item--unread::before {
  content: '';
  position: absolute;
  top: 16px;
  left: 16px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #66ffb2;
}

.ip-item__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  margin-bottom: 0.6rem;
}

.ip-item__identity {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.ip-item__name {
  font-weight: 600;
  font-size: 0.96rem;
}

.ip-item__alias {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.72rem;
  color: rgba(210, 220, 255, 0.55);
}

.ip-item__alias-text {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.18rem 0.45rem;
  border-radius: 6px;
  background: rgba(34, 48, 78, 0.58);
}

.ip-item__alias-popover {
  position: absolute;
  top: 120%;
  left: 0;
  min-width: 210px;
  max-width: 280px;
  max-height: 180px;
  padding: 0.6rem 0.7rem;
  border-radius: 10px;
  border: 1px solid rgba(90, 120, 190, 0.45);
  background: rgba(12, 18, 32, 0.96);
  box-shadow: 0 14px 28px rgba(6, 10, 20, 0.48);
  opacity: 0;
  pointer-events: none;
  transform: translateY(6px);
  transition: opacity 0.18s ease, transform 0.18s ease;
  z-index: 8;
}

.ip-item__alias:hover .ip-item__alias-popover {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.ip-item__metrics {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.ip-item__metrics dl {
  margin: 0;
}

.ip-item__metrics dt {
  font-size: 0.64rem;
  text-transform: uppercase;
  opacity: 0.6;
}

.ip-item__metrics dd {
  font-size: 0.86rem;
  font-weight: 600;
  margin: 0.2rem 0 0;
}

.panel-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.7rem;
  padding: 0.7rem 1.1rem 1rem;
  border-top: 1px solid rgba(82, 110, 166, 0.25);
}

.page-info {
  font-size: 0.78rem;
  color: rgba(205, 220, 255, 0.7);
}
</style>
