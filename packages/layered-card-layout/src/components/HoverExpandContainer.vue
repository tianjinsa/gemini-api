<template>
  <div
    ref="rootEl"
    class="vl-hover-expand"
    @mouseenter="onTriggerEnter"
    @mouseleave="onTriggerLeave"
    @focusin="onTriggerEnter"
    @focusout="onFocusOut"
  >
    <div ref="triggerEl" class="vl-hover-expand__trigger">
      <slot name="trigger" />
    </div>
    <Teleport to="body">
      <transition name="vl-hover-expand" @after-leave="onAfterLeave">
        <div
          v-if="portalVisible"
          ref="cloneEl"
          class="vl-hover-expand__clone"
          :class="{ 'is-expanded': isExpanded }"
          :style="cloneStyle"
          @mouseenter="onCloneEnter"
          @mouseleave="onCloneLeave"
        >
          <div class="vl-hover-expand__content">
            <slot name="content" />
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';

const rootEl = ref<HTMLElement | null>(null);
const triggerEl = ref<HTMLElement | null>(null);
const cloneEl = ref<HTMLElement | null>(null);

const portalVisible = ref(false);
const isExpanded = ref(false);
const triggerRect = ref<DOMRect | null>(null);
let hoverTimer: number | null = null;

function measureTrigger() {
  const el = triggerEl.value;
  if (!el) return;
  triggerRect.value = el.getBoundingClientRect();
}

const cloneStyle = computed(() => {
  if (!triggerRect.value) {
    return {} as Record<string, string>;
  }
  const rect = triggerRect.value;
  return {
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    top: `${rect.top + window.scrollY}px`,
    left: `${rect.left + window.scrollX}px`
  };
});

function openPortal() {
  if (portalVisible.value) {
    measureTrigger();
    isExpanded.value = true;
    return;
  }
  portalVisible.value = true;
  measureTrigger();
  nextTick(() => {
    requestAnimationFrame(() => {
      isExpanded.value = true;
    });
  });
}

function closePortal() {
  isExpanded.value = false;
}

function scheduleClose() {
  if (hoverTimer) {
    window.clearTimeout(hoverTimer);
  }
  hoverTimer = window.setTimeout(() => {
    closePortal();
  }, 80);
}

function cancelClose() {
  if (hoverTimer) {
    window.clearTimeout(hoverTimer);
    hoverTimer = null;
  }
}

function onTriggerEnter() {
  cancelClose();
  openPortal();
}

function onTriggerLeave() {
  scheduleClose();
}

function onCloneEnter() {
  cancelClose();
}

function onCloneLeave() {
  scheduleClose();
}

function onFocusOut(event: FocusEvent) {
  if (!rootEl.value?.contains(event.relatedTarget as Node | null)) {
    closePortal();
  }
}

function onAfterLeave() {
  portalVisible.value = false;
}

onBeforeUnmount(() => {
  if (hoverTimer) {
    window.clearTimeout(hoverTimer);
    hoverTimer = null;
  }
});
</script>

<style scoped>
.vl-hover-expand {
  position: relative;
  display: inline-flex;
}

.vl-hover-expand__trigger {
  display: inline-flex;
  align-items: center;
}

.vl-hover-expand__clone {
  position: absolute;
  z-index: 999;
  transform-origin: top left;
  pointer-events: auto;
  opacity: 0;
  transition:
    transform 0.2s ease,
    opacity 0.2s ease,
    box-shadow 0.2s ease;
  box-shadow: 0 12px 32px rgba(6, 12, 26, 0.32);
  border-radius: 12px;
  background: rgba(13, 21, 40, 0.94);
  overflow: hidden;
}

.vl-hover-expand__clone.is-expanded {
  opacity: 1;
  transform: translate3d(0, 0, 0) scale(1.02);
}

.vl-hover-expand__content {
  width: 100%;
  height: 100%;
}

.vl-hover-expand-enter-from,
.vl-hover-expand-leave-to {
  opacity: 0;
}

.vl-hover-expand-enter-active,
.vl-hover-expand-leave-active {
  transition: opacity 0.16s ease;
}
</style>
