<template>
  <header
    class="stats-header"
    :class="{ 'stats-header--collapsed': !isExpanded }"
    @mouseenter="onHeaderEnter"
    @mouseleave="onHeaderLeave"
  >
    <div class="stats-header__pinned">
      <div class="stats-header__pinned-row">
        <span class="badge" :class="connectionBadgeClass">
          <span class="dot"></span>
          {{ connectionLabel }}
        </span>
        <span v-if="hasUnread" class="badge badge--success">
          <span class="dot"></span>
          有新消息
        </span>
      </div>
      <div v-if="pollErrorMessage" class="stats-header__pinned-banner">
        <div class="status-banner status-banner--error status-banner--compact">
          <IconSymbol name="error" />
          <div>
            <strong>同步异常</strong>
            <p>{{ pollErrorMessage }}</p>
          </div>
          <button
            class="ghost-button"
            type="button"
            :disabled="isRefreshing"
            @click.stop="retry"
          >
            <IconSymbol name="refresh" />
            <span>重试</span>
          </button>
        </div>
      </div>
    </div>
    <div class="stats-header__content">
      <div class="stats-header__top">
        <div class="stats-header__title">
          <h1>Gemini Proxy 控制台</h1>
          <div class="stats-header__badges">
            <span class="badge" :class="connectionBadgeClass">
              <span class="dot"></span>
              {{ connectionLabel }}
            </span>
            <span v-if="hasUnread" class="badge badge--success">
              <span class="dot"></span>
              有新消息
            </span>
          </div>
        </div>
        <div class="stats-header__actions">
          <button class="ghost-button" @click="refreshNow" :disabled="isRefreshing">
            <IconSymbol name="refresh" />
            <span>刷新</span>
          </button>
          <button class="ghost-button" @click="ui.toggleHelpPanel(true)">
            <IconSymbol name="help" />
            <span>帮助</span>
          </button>
        </div>
      </div>

      <div
        v-if="pollErrorMessage"
        class="stats-header__banner status-banner status-banner--error"
      >
        <IconSymbol name="error" />
        <div>
          <strong>同步异常</strong>
          <p>{{ pollErrorMessage }}</p>
        </div>
        <button class="ghost-button" type="button" :disabled="isRefreshing" @click="retry">
          <IconSymbol name="refresh" />
          <span>重试</span>
        </button>
      </div>

      <div class="stats-header__grid" v-if="metrics">
        <div class="metric-card">
          <p class="metric-title">总请求数</p>
          <p class="metric-value">{{ metrics.totalRequests }}</p>
        </div>
        <div class="metric-card">
          <p class="metric-title">入站流量</p>
          <p class="metric-value">{{ metrics.totalIn }}</p>
        </div>
        <div class="metric-card">
          <p class="metric-title">出站流量</p>
          <p class="metric-value">{{ metrics.totalOut }}</p>
        </div>
        <div class="metric-card">
          <p class="metric-title">运行时长</p>
          <p class="metric-value">{{ metrics.uptime }}</p>
        </div>
        <div class="metric-card">
          <p class="metric-title">最后更新检查时间</p>
          <p class="metric-value">{{ metrics.lastUpdate }}</p>
        </div>
        <div class="metric-card">
          <p class="metric-title">上次增量</p>
          <p class="metric-value">{{ metrics.lastDelta }}</p>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import IconSymbol from '@/components/IconSymbol.vue';
import { useDashboardStore } from '@/stores/dashboard';
import { useUiStore } from '@/stores/ui';
import { formatBytes, formatDateTime, formatDuration, formatNumber } from '@/utils/format';
import { useRelativeTicker, useRelativeTime } from '@/composables/relativeTime';

const dashboard = useDashboardStore();
const ui = useUiStore();
const isExpanded = ref(false);
const headerHovered = ref(false);
let collapseTimer: number | null = null;

const hasUnread = computed(() => dashboard.hasUnreadUpdates);
const connectionLabel = computed(() => (dashboard.connectionStatus === 'connected' ? '已连接' : '连接中断'));
const connectionBadgeClass = computed(() => [
  'badge',
  dashboard.connectionStatus === 'connected' ? 'badge--success' : 'badge--danger'
]);

const isRefreshing = computed(() => dashboard.loadingLightStats || dashboard.loadingFullStats);
const pollErrorMessage = computed(() => dashboard.pollError);
const relativeTicker = useRelativeTicker();
const lastDeltaAgo = useRelativeTime(() => dashboard.lastDeltaAt ?? null);
const uptimeNow = ref(Date.now());
const { pause: pauseUptime } = useIntervalFn(() => {
  uptimeNow.value = Date.now();
}, 1_000, { immediate: true });

const metrics = computed(() => {
  const stats = dashboard.stats;
  if (!stats) return null;
  void relativeTicker.value;
  const now = uptimeNow.value;
  const sTime = stats.sTime ? Number(stats.sTime) : now;
  const lastUpdate = stats.ts ? formatDateTime(stats.ts) : '—';
  const lastDelta = dashboard.lastDeltaAt ? lastDeltaAgo.value : '—';
  return {
    totalRequests: formatNumber(stats.totReqs ?? 0),
    totalIn: formatBytes(stats.totInTfc ?? 0),
    totalOut: formatBytes(stats.totOutTfc ?? 0),
    uptime: formatDuration(now - sTime),
    lastUpdate,
    lastDelta
  };
});

function refreshNow() {
  dashboard.refreshFullStats();
  dashboard.refreshLightStats();
}

function retry() {
  refreshNow();
}


function expand() {
  if (collapseTimer !== null) {
    window.clearTimeout(collapseTimer);
    collapseTimer = null;
  }
  isExpanded.value = true;
}

function scheduleCollapse(delay = 500) {
  if (collapseTimer !== null) {
    window.clearTimeout(collapseTimer);
  }
  collapseTimer = window.setTimeout(() => {
    if (!headerHovered.value) {
      isExpanded.value = false;
    }
  }, delay);
}

function handleMouseMove(event: MouseEvent) {
  if (event.clientY <= 110) {
    expand();
  } else {
    scheduleCollapse();
  }
}

function handleTouchStart(event: TouchEvent) {
  const touch = event.touches[0];
  if (!touch) {
    return;
  }
  if (touch.clientY <= 120) {
    expand();
  } else {
    scheduleCollapse();
  }
}

function onHeaderEnter() {
  headerHovered.value = true;
  expand();
}

function onHeaderLeave() {
  headerHovered.value = false;
  scheduleCollapse(350);
}

onMounted(() => {
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('touchstart', handleTouchStart, { passive: true });
  scheduleCollapse(0);
});

onBeforeUnmount(() => {
  pauseUptime();
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('touchstart', handleTouchStart);
  if (collapseTimer !== null) {
    window.clearTimeout(collapseTimer);
  }
});
</script>

<style scoped>
.stats-header {
  padding: 1.15rem 1.4rem;
  background: rgba(16, 24, 38, 0.78);
  border-radius: 18px;
  box-shadow: 0 20px 48px rgba(5, 11, 22, 0.5);
  border: 1px solid rgba(90, 115, 180, 0.18);
  backdrop-filter: blur(22px);
  color: #f2f5ff;
  position: relative;
  overflow: hidden;
  transition: max-height 0.35s ease, padding 0.3s ease, transform 0.35s ease, box-shadow 0.3s ease;
  max-height: 320px;
}

.stats-header--collapsed {
  max-height: 74px;
  padding-top: 0.65rem;
  padding-bottom: 0.65rem;
  transform: translateY(-28px);
  box-shadow: 0 16px 36px rgba(5, 11, 22, 0.45);
}

.stats-header__content {
  transition: opacity 0.25s ease;
}

.stats-header--collapsed .stats-header__content {
  opacity: 0;
  pointer-events: none;
}

.stats-header__pinned {
  position: absolute;
  left: 1.4rem;
  right: 1.4rem;
  bottom: 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  opacity: 0;
  transition: opacity 0.25s ease;
  pointer-events: none;
}

.stats-header__pinned-row {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  flex: 0 0 auto;
}

.stats-header__pinned-banner {
  margin-left: auto;
  flex: 1 1 280px;
  display: flex;
  justify-content: flex-end;
}

.stats-header__pinned-banner .status-banner {
  width: min(100%, 420px);
  max-width: 50%;
}

.stats-header--collapsed .stats-header__pinned {
  opacity: 1;
  pointer-events: auto;
}

.stats-header__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  margin-bottom: 1.1rem;
}

.stats-header__title {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.stats-header__title h1 {
  font-size: 1.55rem;
  font-weight: 700;
  margin: 0;
}

.stats-header__badges {
  display: flex;
  gap: 0.5rem;
}

.stats-header__actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.stats-header__banner.status-banner {
  margin-bottom: 1rem;
  width: 100%;
  max-width: 100%;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.65rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
  background: rgba(92, 105, 133, 0.2);
  color: #d7defe;
}

.badge .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.badge--success {
  background: rgba(42, 192, 104, 0.18);
  color: #6af7b2;
}

.badge--danger {
  background: rgba(214, 81, 81, 0.18);
  color: #ff9f9f;
}


.stats-header__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.75rem;
}

.status-banner {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.75rem 1rem;
  border-radius: 14px;
  border: 1px solid rgba(255, 150, 150, 0.3);
  background: rgba(90, 18, 36, 0.45);
  color: #ffd7d7;
  width: auto;
  max-width: 560px;
}

.status-banner p {
  margin: 0.1rem 0 0;
  font-size: 0.83rem;
  opacity: 0.78;
}

.status-banner .ghost-button {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.35rem 0.75rem;
  border-radius: 10px;
  border: 1px solid rgba(255, 158, 158, 0.5);
  background: rgba(215, 64, 64, 0.25);
  color: inherit;
  cursor: pointer;
}

.status-banner--compact {
  padding: 0.55rem 0.75rem;
  gap: 0.6rem;
}

.status-banner--compact p {
  font-size: 0.76rem;
}

.status-banner--compact .ghost-button {
  padding: 0.3rem 0.6rem;
  font-size: 0.74rem;
}

@media (max-width: 640px) {
  .stats-header__pinned-banner {
    flex-basis: 100%;
    justify-content: flex-start;
  }

  .stats-header__pinned-banner .status-banner {
    max-width: 100%;
  }
}

.metric-card {
  background: rgba(20, 32, 52, 0.7);
  border-radius: 12px;
  padding: 0.75rem 0.9rem;
  border: 1px solid rgba(90, 118, 190, 0.15);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.metric-title {
  font-size: 0.7rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(216, 224, 255, 0.55);
  margin: 0 0 0.35rem;
}

.metric-value {
  font-size: 1.12rem;
  font-weight: 600;
  margin: 0;
  color: #fff;
}

.ghost-button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.75rem;
  border-radius: 9px;
  background: rgba(27, 40, 70, 0.6);
  border: 1px solid rgba(92, 115, 180, 0.35);
  color: #e2ecff;
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease, border 0.2s ease;
}


.ghost-button:hover:not(:disabled) {
  background: rgba(90, 135, 250, 0.22);
  border-color: rgba(120, 160, 255, 0.45);
  transform: translateY(-1px);
}

.ghost-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.material-symbols-outlined {
  font-size: 1rem;
}

@media (max-width: 768px) {
  .stats-header {
    padding: 1rem;
  }
  .stats-header__top {
    flex-direction: column;
    align-items: flex-start;
  }
  .stats-header__actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
