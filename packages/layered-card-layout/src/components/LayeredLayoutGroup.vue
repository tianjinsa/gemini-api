<template>
  <div
    ref="rootEl"
    class="vl-layered-group"
    :class="[groupClasses, className]"
    :style="groupStyle"
  >
    <slot
      v-for="card in layout.cards"
      :key="card.id"
      :card="card.config"
      :layout="card"
      :is-focused="card.isFocused"
      :style="card.style"
      :focus="() => handleFocus(card.id)"
      :update-metrics="(width: number, height: number) => updateCardMetrics(card.id, width, height)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import type { CardGroupConfig, HeaderSize, LayoutMode } from '../types';
import { useLayeredLayout } from '../composables/useLayeredLayout';
import { LAYERED_LAYOUT_CONTEXT_KEY } from '../context/layeredLayout';

const props = defineProps<CardGroupConfig>();
const rootEl = ref<HTMLElement | null>(null);

const {
  layout,
  setViewport,
  setContainerSize,
  setFocusedCard,
  updateCardHeader,
  updateCardMetrics
} = useLayeredLayout({
  cards: props.cards,
  defaultStackDirection: props.defaultStackDirection,
  autoSwitchDirection: props.autoSwitchDirection,
  breakpointWidth: props.breakpointWidth,
  activeBuffer: props.activeBuffer
});

const layoutMode = computed<LayoutMode>(() => (layout.value.stackDirection === 'right' ? 'right-stack' : 'down-stack'));

function handleFocus(id: string | null) {
  setFocusedCard(id);
}

provide(LAYERED_LAYOUT_CONTEXT_KEY, {
  mode: layoutMode,
  reportHeaderSize(id: string, size: HeaderSize) {
    updateCardHeader(id, size.width, size.height);
  },
  reportContentSize(id: string, size: HeaderSize) {
    updateCardMetrics(id, size.width, size.height);
  },
  requestFocus(id: string) {
    handleFocus(id);
  }
});

const groupClasses = computed(() => ({
  'vl-layered-group--horizontal': layout.value.stackDirection === 'right',
  'vl-layered-group--vertical': layout.value.stackDirection === 'down'
}));

const groupStyle = computed(() => ({
  ...props.style,
  '--vl-total-span': `${layout.value.totalSpan}px`
}));

let resizeObserver: ResizeObserver | null = null;

function updateViewport() {
  if (typeof window === 'undefined') return;
  setViewport(window.innerWidth, window.innerHeight);
}

onMounted(() => {
  updateViewport();

  if (rootEl.value) {
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setContainerSize(entry.contentRect.width, entry.contentRect.height);
    });
    resizeObserver.observe(rootEl.value);
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateViewport, { passive: true });
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateViewport);
  }
});

watch(
  () => props.cards,
  () => {
    updateViewport();
    if (rootEl.value) {
      const rect = rootEl.value.getBoundingClientRect();
      setContainerSize(rect.width, rect.height);
    }
  },
  { deep: true }
);
</script>

<style scoped>
.vl-layered-group {
  position: relative;
  width: max(100%, var(--vl-total-span, 0px));
  height: 100%;
}

.vl-layered-group--vertical {
  width: 100%;
  height: max(100%, var(--vl-total-span, 0px));
}
</style>
