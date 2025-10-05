<template>
  <teleport to="body">
    <transition name="fade">
      <div
        v-if="state"
        class="overlay"
        @pointerdown.self="onBackdropPointerDown"
        @pointerup.self="onBackdropPointerUp"
      >
        <div class="dialog">
          <h3>{{ state.title }}</h3>
          <p>{{ state.message }}</p>
          <div class="actions">
            <button class="ghost" @click="onCancel">{{ state.cancelLabel ?? '取消' }}</button>
            <button class="danger" @click="onConfirm">{{ state.confirmLabel ?? '确认' }}</button>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useUiStore } from '@/stores/ui';
import { useOverlayDismiss } from '@/composables/overlayDismiss';

const ui = useUiStore();
const { confirmDialog } = storeToRefs(ui);

const state = computed(() => (confirmDialog.value.open ? confirmDialog.value.options : null));

const { onBackdropPointerDown, onBackdropPointerUp } = useOverlayDismiss(onCancel);

function onCancel() {
  ui.resolveConfirm(false);
}

function onConfirm() {
  ui.resolveConfirm(true);
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(9, 12, 20, 0.75);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2500;
}

.dialog {
  background: linear-gradient(160deg, rgba(18, 24, 38, 0.95), rgba(12, 16, 26, 0.98));
  border: 1px solid rgba(110, 140, 220, 0.25);
  border-radius: 16px;
  padding: 1.5rem;
  width: min(420px, 92vw);
  color: #f1f6ff;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
}

.dialog h3 {
  margin: 0 0 0.75rem;
  font-size: 1.25rem;
}

.dialog p {
  margin: 0 0 1.4rem;
  font-size: 0.95rem;
  line-height: 1.55;
  opacity: 0.85;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.8rem;
}

button {
  border-radius: 999px;
  padding: 0.55rem 1.2rem;
  font-size: 0.9rem;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.18s ease;
}

button.ghost {
  background: transparent;
  border-color: rgba(110, 140, 220, 0.35);
  color: #e6edff;
}

button.ghost:hover {
  border-color: rgba(110, 140, 220, 0.65);
}

button.danger {
  background: rgba(246, 90, 120, 0.95);
  border-color: rgba(246, 90, 120, 1);
  color: #fff5f8;
}

button.danger:hover {
  filter: brightness(1.05);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
