<template>
  <div class="panel-control" :class="{ 'panel-control--open': isOpen, 'panel-control--active': isActive }">
    <button
      ref="triggerEl"
      class="panel-control__button"
      type="button"
      :disabled="disabled"
  :aria-haspopup="overlayRole"
  :aria-expanded="isOpen"
  :aria-controls="overlayId"
  :aria-label="triggerAriaLabel"
      @click="toggle"
      @keydown="handleTriggerKeydown"
    >
      <IconSymbol v-if="icon" :name="icon" class="panel-control__icon" />
      <span class="panel-control__text" :title="displayLabel">{{ displayLabel }}</span>
      <IconSymbol v-if="showChevron" name="expand_more" class="panel-control__chevron" />
    </button>
  </div>
  <Teleport to="body">
    <transition name="panel-control-overlay">
      <div
        v-if="isOpen"
        :id="overlayId"
        ref="overlayEl"
        class="panel-control-overlay"
        :class="overlayClassList"
        :style="overlayStyle"
        :role="overlayRole"
        @keydown="handleOverlayKeydown"
      >
        <slot name="overlay" :close="close" :update-position="updateOverlayPosition" />
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import IconSymbol from '@/components/IconSymbol.vue';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    icon?: string;
    displayText?: string;
    placeholder?: string;
    active?: boolean;
    disabled?: boolean;
    triggerAriaLabel?: string;
    overlayRole?: 'dialog' | 'listbox' | 'menu';
    overlayClass?: string | string[] | Record<string, boolean>;
    overlayMinWidth?: number;
    showChevron?: boolean;
  }>(),
  {
    icon: undefined,
    displayText: '',
    placeholder: '',
    active: false,
    disabled: false,
    triggerAriaLabel: '展开控件',
    overlayRole: 'dialog',
    overlayClass: undefined,
    overlayMinWidth: 220,
    showChevron: true
  }
);

const emit = defineEmits<{
  (e: 'open'): void;
  (e: 'after-open'): void;
  (e: 'close'): void;
  (e: 'after-close'): void;
}>();

const isOpen = ref(false);
const triggerEl = ref<HTMLButtonElement | null>(null);
const overlayEl = ref<HTMLElement | null>(null);
const overlayStyle = ref<Record<string, string>>({});
const overlayId = `panel-control-overlay-${Math.random().toString(36).slice(2, 10)}`;

const displayLabel = computed(() => (props.displayText && props.displayText.length ? props.displayText : props.placeholder));
const isActive = computed(() => props.active || isOpen.value);
const overlayClassList = computed(() => [props.overlayClass].flat().filter(Boolean));

let listenersAttached = false;

function attachGlobalListeners() {
  if (listenersAttached) return;
  window.addEventListener('resize', updateOverlayPosition, { passive: true });
  window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
  window.addEventListener('pointerdown', handlePointerDown, { capture: true });
  listenersAttached = true;
}

function detachGlobalListeners() {
  if (!listenersAttached) return;
  window.removeEventListener('resize', updateOverlayPosition);
  window.removeEventListener('scroll', handleScroll, true);
  window.removeEventListener('pointerdown', handlePointerDown, true);
  listenersAttached = false;
}

function handleScroll() {
  if (!isOpen.value) return;
  updateOverlayPosition();
}

function handlePointerDown(event: PointerEvent) {
  const target = event.target as Node | null;
  if (!target) return;
  if (triggerEl.value?.contains(target)) return;
  if (overlayEl.value?.contains(target)) return;
  close();
}

function getOverlayWidth(rect: DOMRect, overlayRect: DOMRect | null) {
  const minWidth = props.overlayMinWidth ?? 220;
  const baseWidth = overlayRect?.width ?? rect.width;
  let width = Math.max(minWidth, rect.width, baseWidth);
  const maxWidth = Math.max(minWidth, Math.floor(window.innerWidth - 32));
  width = Math.min(width, maxWidth);
  return width;
}

function updateOverlayPosition() {
  if (!isOpen.value) return;
  const trigger = triggerEl.value;
  const overlay = overlayEl.value;
  if (!trigger || !overlay) return;
  const rect = trigger.getBoundingClientRect();
  const overlayRect = overlay.getBoundingClientRect();
  const gap = 10;
  const width = getOverlayWidth(rect, overlayRect);

  let top = rect.top - overlayRect.height - gap;
  if (top < 16) {
    top = rect.bottom + gap;
  }
  const maxLeft = window.innerWidth - width - 16;
  let left = rect.left;
  if (left > maxLeft) {
    left = Math.max(16, maxLeft);
  }
  if (left < 16) {
    left = 16;
  }

  overlayStyle.value = {
    position: 'fixed',
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    minWidth: `${Math.round(width)}px`
  };
}

async function open() {
  if (props.disabled || isOpen.value) return;
  emit('open');
  isOpen.value = true;
  attachGlobalListeners();
  await nextTick();
  updateOverlayPosition();
  emit('after-open');
}

function close() {
  if (!isOpen.value) return;
  emit('close');
  isOpen.value = false;
  overlayStyle.value = {};
  detachGlobalListeners();
  emit('after-close');
  triggerEl.value?.focus({ preventScroll: true });
}

function toggle() {
  if (isOpen.value) {
    close();
  } else {
    open();
  }
}

function handleTriggerKeydown(event: KeyboardEvent) {
  if (props.disabled) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    toggle();
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    open();
  }
}

function handleOverlayKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
  }
}

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled && isOpen.value) {
      close();
    }
  }
);

onBeforeUnmount(() => {
  detachGlobalListeners();
});

defineExpose({
  open,
  close,
  updateOverlayPosition,
  isOpen
});
</script>
