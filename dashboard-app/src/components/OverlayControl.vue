<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="overlay-control"
      :class="overlayClasses"
      :style="overlayStyle"
      role="dialog"
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
      @focusin="handleFocusIn"
      @focusout="handleFocusOut"
      @transitionend="onTransitionEnd"
    >
      <div class="overlay-control__surface">
        <IconSymbol :name="icon" :class="iconClasses" />
        <input
          v-if="variant === 'filter'"
          ref="filterInputRef"
          class="overlay-control__field overlay-control__input"
          type="text"
          :value="value"
          :placeholder="label"
          :aria-label="label"
          @input="onFilterInput"
          @keydown.enter.prevent="onFilterCommit"
          @keydown.esc.prevent="onFilterCancel"
          @blur="onFilterCommit"
        />
        <select
          v-else
          ref="selectRef"
          class="overlay-control__field overlay-control__select"
          :value="value"
          :aria-label="label"
          @change="onSortChange"
        >
          <option
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            :disabled="option.disabled === true"
          >
            {{ option.label }}
          </option>
        </select>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import IconSymbol from '@/components/IconSymbol.vue';
import { useControlOverlayStore } from '@/stores/controlOverlay';

const overlayStore = useControlOverlayStore();

const visible = computed(() => overlayStore.visible);
const expanded = computed(() => overlayStore.expanded);
const closing = computed(() => overlayStore.closing);
const rect = computed(() => overlayStore.rect);
const icon = computed(() => overlayStore.icon);
const variant = computed(() => overlayStore.variant);
const label = computed(() => overlayStore.label);
const relocating = computed(() => overlayStore.relocating);
const value = computed({
  get: () => overlayStore.value,
  set: (next: string) => overlayStore.updateValue(next)
});
const options = computed(() => overlayStore.options);
const align = computed(() => overlayStore.align);
const collapsedWidth = computed(() => overlayStore.collapsedWidth);
const expandedWidth = computed(() => overlayStore.expandedWidth);

const filterInputRef = ref<HTMLInputElement | null>(null);
const selectRef = ref<HTMLSelectElement | null>(null);

const overlayClasses = computed(() => [
  `overlay-control--${variant.value}`,
  {
    'overlay-control--expanded': expanded.value,
    'overlay-control--relocating': relocating.value
  }
]);

const iconClasses = computed(() => ({
  'overlay-control__icon': true
}));

const FIELD_OFFSET = 56;

const overlayStyle = computed(() => {
  const anchorRect = rect.value;
  const baseCollapsed = collapsedWidth.value || anchorRect.width || 0;
  const collapsed = baseCollapsed > 0 ? baseCollapsed : 0;
  const requestedExpanded = expandedWidth.value || collapsed;
  const safeExpanded = requestedExpanded > 0 ? Math.max(requestedExpanded, collapsed) : collapsed;

  const anchorLeft = anchorRect.left;
  const anchorRight = anchorRect.left + anchorRect.width;

  const expandedLeftBase = align.value === 'right'
    ? anchorRight - safeExpanded
    : anchorLeft;

  const collapsedLeftBase = align.value === 'right'
    ? anchorRight - collapsed
    : anchorLeft;

  let expandedLeft = expandedLeftBase;
  let collapsedLeft = collapsedLeftBase;

  if (typeof window !== 'undefined') {
    const viewportWidth = window.innerWidth ?? safeExpanded;
    const maxExpandedLeft = Math.max(viewportWidth - safeExpanded, 0);
    const maxCollapsedLeft = Math.max(viewportWidth - collapsed, 0);
    expandedLeft = Math.min(Math.max(expandedLeftBase, 0), maxExpandedLeft);
    collapsedLeft = Math.min(Math.max(collapsedLeftBase, 0), maxCollapsedLeft);
  }

  const isExpanded = expanded.value && !closing.value;
  const targetWidth = isExpanded ? safeExpanded : collapsed;
  const targetLeft = isExpanded ? expandedLeft : collapsedLeft;

  const collapsedFieldWidth = Math.max(collapsed - FIELD_OFFSET, 0);
  const expandedFieldWidth = Math.max(safeExpanded - FIELD_OFFSET, 0);
  const targetFieldWidth = isExpanded ? expandedFieldWidth : collapsedFieldWidth;

  return {
    top: `${anchorRect.top}px`,
    left: `${targetLeft}px`,
    width: `${targetWidth}px`,
    height: `${anchorRect.height}px`,
    '--overlay-field-width': `${Math.max(targetFieldWidth, 0)}px`
  };
});

function handleMouseEnter() {
  overlayStore.beginInteraction();
}

function handleMouseLeave() {
  overlayStore.scheduleClose();
}

function handleFocusIn() {
  overlayStore.beginInteraction();
}

function handleFocusOut(event: FocusEvent) {
  const current = event.currentTarget as HTMLElement | null;
  const next = event.relatedTarget as Node | null;
  if (current && next && current.contains(next)) {
    return;
  }
  overlayStore.scheduleClose(200);
}

function onTransitionEnd(event: TransitionEvent) {
  if (closing.value && (event.propertyName === 'width' || event.propertyName === 'left')) {
    overlayStore.finalize();
  }
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (!visible.value) return;
  if (event.key === 'Escape') {
    overlayStore.cancel();
  }
  if (event.key === 'Enter' && variant.value === 'filter') {
    overlayStore.requestClose();
  }
}

function handleWindowScroll() {
  if (!visible.value) return;
  overlayStore.refreshAnchorRect();
}

function focusContent() {
  nextTick(() => {
    const targetEl = variant.value === 'filter' ? filterInputRef.value : selectRef.value;
    targetEl?.focus({ preventScroll: true });
    if (targetEl instanceof HTMLInputElement) {
      const length = targetEl.value.length;
      targetEl.setSelectionRange(length, length);
    }
  });
}

function onFilterInput(event: Event) {
  overlayStore.updateValue((event.target as HTMLInputElement).value);
}

function onFilterCommit() {
  overlayStore.commit();
}

function onFilterCancel() {
  overlayStore.cancel();
}

function onSortChange(event: Event) {
  const next = (event.target as HTMLSelectElement).value;
  overlayStore.commit(next);
}

watch(visible, (next) => {
  if (next) {
    focusContent();
  }
});

watch(expanded, (isExpanded, wasExpanded) => {
  if (isExpanded && !wasExpanded) {
    focusContent();
  }
});

watch(relocating, (isRelocating) => {
  if (isRelocating) {
    focusContent();
  }
});

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown, true);
  window.addEventListener('resize', handleWindowScroll, true);
  window.addEventListener('scroll', handleWindowScroll, true);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown, true);
  window.removeEventListener('resize', handleWindowScroll, true);
  window.removeEventListener('scroll', handleWindowScroll, true);
});
</script>

<style scoped>
.overlay-control {
  position: fixed;
  z-index: 9000;
  pointer-events: all;
  transition: width 0.24s cubic-bezier(0.35, 0.9, 0.3, 1);
  will-change: width;
  overflow: hidden;
}

.overlay-control--relocating {
  transition:
    width 0.24s cubic-bezier(0.35, 0.9, 0.3, 1),
    top 0.28s cubic-bezier(0.33, 1, 0.68, 1),
    left 0.28s cubic-bezier(0.33, 1, 0.68, 1);
  will-change: width, left;
}

.overlay-control__surface {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  height: 100%;
  padding: 0.35rem 0.55rem;
  border-radius: 12px;
  border: 1px solid rgba(110, 150, 240, 0.45);
  background: rgba(14, 22, 38, 0.96);
  box-shadow: 0 18px 38px rgba(0, 0, 0, 0.35);
  width: 100%;
  white-space: nowrap;
}

.overlay-control__icon {
  font-size: 1rem;
  flex-shrink: 0;
}


.overlay-control--relocating .overlay-control__icon,
.overlay-control--relocating .overlay-control__field {
  opacity: 0;
  animation: overlay-control-content 0.2s ease forwards;
}

.overlay-control__field {
  flex: 1;
  min-width: 0;
  width: var(--overlay-field-width, 100%);
  transition: width 0.24s cubic-bezier(0.35, 0.9, 0.3, 1);
}

.overlay-control__input,
.overlay-control__select {
  border: none;
  background: transparent;
  color: #f3f7ff;
  font: inherit;
  outline: none;
  width: 100%;
}

.overlay-control__input::placeholder {
  color: rgba(200, 216, 255, 0.55);
}

.overlay-control :deep(option) {
  background: #0f1626;
  color: #f3f7ff;
}

@keyframes overlay-control-content {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

</style>
