<template>
  <teleport to="body">
    <transition name="fade">
      <div
        v-if="imagePreview.open"
        class="overlay"
        @pointerdown.self="onBackdropPointerDown"
        @pointerup.self="onBackdropPointerUp"
      >
        <div class="modal">
          <header>
            <h3>{{ imagePreview.name ?? '图片预览' }}</h3>
            <button class="icon" @click="close">
              <IconSymbol name="close" />
            </button>
          </header>
          <div class="content">
            <img :src="imagePreview.src" :alt="imagePreview.name ?? 'attachment'" />
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import IconSymbol from '@/components/IconSymbol.vue';
import { useUiStore } from '@/stores/ui';
import { useOverlayDismiss } from '@/composables/overlayDismiss';

const ui = useUiStore();
const imagePreview = ui.imagePreview;

const { onBackdropPointerDown, onBackdropPointerUp } = useOverlayDismiss(close);

function close() {
  ui.closeImagePreview();
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  z-index: 2400;
}

.modal {
  background: rgba(12, 16, 26, 0.95);
  border-radius: 16px;
  border: 1px solid rgba(110, 150, 255, 0.2);
  width: min(900px, 95vw);
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid rgba(110, 150, 255, 0.15);
  color: #f0f4ff;
}

header button {
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0.2rem;
}

.content {
  padding: 1.5rem;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: auto;
}

img {
  max-width: 100%;
  max-height: 78vh;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
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
