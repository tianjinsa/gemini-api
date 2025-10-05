<template>
  <div class="app-shell" :class="shellClasses">
    <StatsHeader />

        <section
          v-if="hasBootstrap"
          ref="gridEl"
          class="dashboard-grid"
          :class="gridClasses"
          :style="gridStyle"
        >
      <div
        v-for="panel in layout.panels"
        :key="panel.id"
        class="panel-stack"
        :class="panelClasses(panel)"
        :style="panel.style"
      >
        <component
          :is="panelComponents[panel.id]"
          :collapsed="!!activePanelId && panel.id !== activePanelId"
          :main-span="panel.mainSpan"
          :stack-direction="stackDirection"
          :ref="panelComponentRefSetters[panel.id]"
          @request-focus="handleFocus(panel.id)"
        />
      </div>
    </section>

    <div v-else class="loading-state">
      <div class="spinner"></div>
      <p>正在加载仪表板数据...</p>
    </div>
    <ToastContainer />
    <PreviewModal />
    <ConfirmDialog />
  <BanManager />
  <AliasManager />
  <HelpPanel />
    <OverlayControl />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, provide, ref, watch } from 'vue';
import { useResizeObserver, useWindowSize } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import { useDashboardStore } from '@/stores/dashboard';
import StatsHeader from '@/components/StatsHeader.vue';
import IpListPanel from '@/components/IpListPanel.vue';
import TopicListPanel from '@/components/TopicListPanel.vue';
import MessagePanel from '@/components/MessagePanel.vue';
import ToastContainer from '@/components/ToastContainer.vue';
import PreviewModal from '@/components/PreviewModal.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import BanManager from '@/components/BanManager.vue';
import AliasManager from '@/components/AliasManager.vue';
import HelpPanel from '@/components/HelpPanel.vue';
import OverlayControl from '@/components/OverlayControl.vue';
import { PANEL_LAYOUT_HOOK_KEY, usePanelLayout, type PanelId } from '@/composables/panelLayout';

const dashboard = useDashboardStore();
const { initialized } = storeToRefs(dashboard);

const hasBootstrap = computed(() => initialized.value);

const panelComponents: Record<PanelId, unknown> = {
  ipList: IpListPanel,
  topicList: TopicListPanel,
  messageList: MessagePanel
};

const panelOrder: PanelId[] = ['ipList', 'topicList', 'messageList'];
const { layout, setViewport, setContainerSize, setFocusedPanel, updatePanelHeader } =
  usePanelLayout(panelOrder);

const activePanelId = computed(() => layout.value.activePanelId);
const stackDirection = computed(() => layout.value.stackDirection);

const gridStyle = computed(() => ({
  '--layout-total': `${layout.value.totalSpan}px`
}));

const shellClasses = computed(() => ({
  'app-shell--vertical': stackDirection.value === 'down'
}));

const gridClasses = computed(() => ({
  'dashboard-grid--vertical': stackDirection.value === 'down',
  'dashboard-grid--horizontal': stackDirection.value === 'right',
  'dashboard-grid--focused': !!activePanelId.value
}));

type PanelComponentApi = {
  resetToCollapsedState: () => void;
};

const panelComponentRefs = {
  ipList: ref<PanelComponentApi | null>(null),
  topicList: ref<PanelComponentApi | null>(null),
  messageList: ref<PanelComponentApi | null>(null)
};

const panelComponentRefSetters: Record<PanelId, (instance: unknown) => void> = {
  ipList(instance) {
    panelComponentRefs.ipList.value = instance as PanelComponentApi | null;
  },
  topicList(instance) {
    panelComponentRefs.topicList.value = instance as PanelComponentApi | null;
  },
  messageList(instance) {
    panelComponentRefs.messageList.value = instance as PanelComponentApi | null;
  }
};

function panelClasses(panel: (typeof layout)['value']['panels'][number]) {
  return [
    `panel-stack--${panel.id}`,
    {
      'panel-stack--focused': panel.id === activePanelId.value,
      'panel-stack--muted': !!activePanelId.value && panel.id !== activePanelId.value,
      'panel-stack--collapsed': !!activePanelId.value && panel.id !== activePanelId.value
    }
  ];
}

function handleFocus(panelId: PanelId) {
  setFocusedPanel(panelId);
  (Object.entries(panelComponentRefs) as [PanelId, typeof panelComponentRefs.ipList][]).forEach(([id, refValue]) => {
    if (id !== panelId) {
      refValue.value?.resetToCollapsedState();
    }
  });
}

const gridEl = ref<HTMLElement | null>(null);

useResizeObserver(gridEl, (entries) => {
  const entry = entries[0];
  if (!entry) return;

  let width = entry.contentRect.width;
  const shellEl = gridEl.value?.closest('.app-shell') as HTMLElement | null;
  if (shellEl) {
    width = width - 1;
  }
  const normalizedWidth = Math.max(0, Math.round(width * 10) / 10);
  const normalizedHeight = Math.max(0, Math.round(entry.contentRect.height * 10) / 10);

  setContainerSize(normalizedWidth, normalizedHeight);
});

provide(PANEL_LAYOUT_HOOK_KEY, {
  ipList: {
    reportHeaderSize(metrics) {
      updatePanelHeader('ipList', metrics.width, metrics.height);
    }
  },
  topicList: {
    reportHeaderSize(metrics) {
      updatePanelHeader('topicList', metrics.width, metrics.height);
    }
  },
  messageList: {
    reportHeaderSize(metrics) {
      updatePanelHeader('messageList', metrics.width, metrics.height);
    }
  }
});

const { width: viewportWidth, height: viewportHeight } = useWindowSize();
watch(
  [viewportWidth, viewportHeight],
  ([width, height]) => {
    setViewport(width ?? 0, height ?? 0);
  },
  { immediate: true }
);

onMounted(async () => {
  await dashboard.initialize();
  await dashboard.refreshLightStats();
});
</script>

<style scoped>
:global(*),
:global(*::before),
:global(*::after) {
  box-sizing: border-box;
}

:global(html),
:global(body) {
  height: 100%;
  overflow: hidden;
}

:global(body) {
  margin: 0;
  background: #070b14;
  color: #f1f6ff;
  font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
}

:global(#app) {
  height: 100%;
  width: 100%;
}

:global(button),
:global(input),
:global(select),
:global(textarea) {
  font-family: inherit;
}

.app-shell {
  height: 100vh;
  width: 100%;
  padding: 1.5rem 1.75rem 2.25rem;
  box-sizing: border-box;
  background: radial-gradient(circle at top right, rgba(28, 45, 78, 0.45), transparent 45%),
    radial-gradient(circle at top left, rgba(20, 42, 92, 0.45), transparent 50%),
    linear-gradient(180deg, #070b14, #0f172a 65%, #0a1222);
  color: #f1f6ff;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  overflow-x: hidden;
  overflow-y: hidden;
}

.app-shell--vertical {
  overflow-y: auto;
}

.dashboard-grid {
  position: relative;
  flex: 1;
  min-height: 0;
  height: 100%;
  margin: 0 auto;
  --vertical-stack-gap: 2.25rem;
}

.dashboard-grid--horizontal {
  /* 向右堆叠：容器宽度固定为100%，为卡片布局提供约束 */
  width: 100%;
  display: block;
}

.dashboard-grid--vertical {
  /* 向下堆叠：容器宽度100%，高度至少等于卡片总高度，并在底部保留间距 */
  width: 100%;
  flex: 1;
  min-height: calc(var(--layout-total, 0px) + var(--vertical-stack-gap));
  padding-bottom: var(--vertical-stack-gap);
}

.panel-stack {
  position: absolute;
  top: 0;
  left: 0;
  bottom: auto;
  display: flex;
  flex-direction: column;
  width: var(--panel-main-size);
  height: 100%;
  border-radius: 18px;
  border: 1px solid rgba(54, 80, 130, 0.25);
  background: rgba(10, 16, 28, 0.85);
  box-shadow: 0 18px 42px rgba(6, 12, 26, 0.28);
  overflow: hidden;
  transition:
    left 0.45s cubic-bezier(0.33, 1, 0.68, 1),
    top 0.45s cubic-bezier(0.33, 1, 0.68, 1),
    height 0.45s cubic-bezier(0.33, 1, 0.68, 1),
    filter 0.3s ease,
    box-shadow 0.4s ease;
  will-change: left, top, width, height;
}

.panel-stack > * {
  flex: 1;
  min-height: 0;
}

.panel-stack::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(5, 8, 14, 0.25), rgba(5, 8, 14, 0.85));
  opacity: 0;
  transition: opacity 0.35s ease;
  pointer-events: none;
}

.panel-stack--muted::after {
  opacity: 1;
}

.panel-stack--focused {
  box-shadow: 0 32px 72px rgba(10, 18, 40, 0.55);
  filter: saturate(1.08) brightness(1.05);
}

.panel-stack--muted {
  filter: saturate(0.6) brightness(0.82);
}

.dashboard-grid--horizontal .panel-stack--collapsed {
  width: var(--panel-collapsed-main, var(--panel-main-size));
}
.dashboard-grid--vertical .panel-stack {
  width: 100%;
  height: var(--panel-main-size, 640px);
  left: 0 !important;
  box-shadow: 0 20px 52px rgba(6, 12, 26, 0.32);
}

.dashboard-grid--vertical .panel-stack--collapsed {
  height: var(--panel-collapsed-main, var(--panel-main-size, 640px));
}

.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  color: rgba(220, 230, 255, 0.8);
}

.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid rgba(150, 170, 220, 0.3);
  border-top-color: rgba(140, 170, 255, 0.9);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.material-symbols-outlined {
  font-size: 1.2rem;
}

@media (max-width: 1320px) {
  .app-shell {
    padding: 1.4rem 1.4rem 2.25rem;
  }
}

@media (max-width: 1024px) {
  .app-shell {
    padding: 1.4rem 1.15rem 2.2rem;
  }
}

@media (max-width: 768px) {
  .app-shell {
    padding: 1.25rem 1rem 2rem;
    gap: 1rem;
  }
}
</style>
