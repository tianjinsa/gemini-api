<template>
  <component
    :is="tag"
    ref="rootEl"
    class="vl-layered-card"
    :class="{
      'vl-layered-card--focused': isFocused
    }"
    :style="style"
    @mouseenter="requestFocus"
    @focusin="requestFocus"
    @pointerdown.capture="requestFocus"
  >
    <div ref="headerEl" class="vl-layered-card__header">
      <slot name="header" />
    </div>
    <div ref="bodyEl" class="vl-layered-card__body">
      <slot name="body" />
    </div>
  </component>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { HeaderSize, LayoutMode } from '../types';
import { LAYERED_LAYOUT_CONTEXT_KEY, type LayeredLayoutContext } from '../context/layeredLayout';

export interface LayeredLayoutCardProps {
  cardId: string;
  isFocused: boolean;
  tag?: string;
  style?: Record<string, string | number>;
}

const props = withDefaults(defineProps<LayeredLayoutCardProps>(), {
  tag: 'section'
});

const layoutContext = inject<LayeredLayoutContext | null>(LAYERED_LAYOUT_CONTEXT_KEY, null);

const rootEl = ref<HTMLElement | null>(null);
const headerEl = ref<HTMLElement | null>(null);
const bodyEl = ref<HTMLElement | null>(null);

const layoutMode = computed<LayoutMode>(() => layoutContext?.mode.value ?? 'right-stack');

let headerObserver: ResizeObserver | null = null;
let bodyObserver: ResizeObserver | null = null;

function normalizeSize(size: HeaderSize): HeaderSize {
  return {
    width: Number.isFinite(size.width) ? Math.round(size.width) : 0,
    height: Number.isFinite(size.height) ? Math.round(size.height) : 0
  };
}

function notifyHeader(size: HeaderSize) {
  layoutContext?.reportHeaderSize(props.cardId, normalizeSize(size));
}

function notifyBody(size: HeaderSize) {
  layoutContext?.reportContentSize?.(props.cardId, normalizeSize(size));
}

function extractSize(entry: ResizeObserverEntry): HeaderSize {
  const boxSize = Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0] : entry.borderBoxSize;
  const width = boxSize ? boxSize.inlineSize : entry.contentRect.width;
  const height = boxSize ? boxSize.blockSize : entry.contentRect.height;
  return { width, height };
}

function setupHeaderObserver() {
  if (!headerEl.value) return;
  headerObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    const size = extractSize(entry);
    notifyHeader(size);
  });
  headerObserver.observe(headerEl.value);
}

function setupBodyObserver() {
  if (!bodyEl.value) return;
  bodyObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    const size = extractSize(entry);
    notifyBody(size);
  });
  bodyObserver.observe(bodyEl.value);
}

function teardownObservers() {
  headerObserver?.disconnect();
  headerObserver = null;
  bodyObserver?.disconnect();
  bodyObserver = null;
}

function requestFocus() {
  layoutContext?.requestFocus(props.cardId);
}

onMounted(() => {
  setupHeaderObserver();
  setupBodyObserver();
});

onBeforeUnmount(() => {
  teardownObservers();
});

watch(layoutMode, () => {
  // Force re-measure on orientation changes.
  teardownObservers();
  setupHeaderObserver();
  setupBodyObserver();
});

defineExpose({
  getRootElement: () => rootEl.value
});
</script>

<style scoped>
.vl-layered-card {
  position: absolute;
  inset: 0 auto auto 0;
  display: flex;
  flex-direction: column;
  /* width和height由内联style控制 */
}

.vl-layered-card__header {
  flex: 0 0 auto;
}

.vl-layered-card__body {
  flex: 1 1 auto;
  min-height: 0;
}

.vl-layered-card--focused {
  z-index: 10;
}
</style>
