<template>
  <div class="toast-container">
    <transition-group name="toast" tag="div">
      <div v-for="toast in ui.toasts" :key="toast.id" class="toast" :class="toast.type">
        <div class="toast__icon">
          <IconSymbol :name="icon(toast.type)" />
        </div>
        <div class="toast__body">
          <strong>{{ toast.title }}</strong>
          <p v-if="toast.message">{{ toast.message }}</p>
        </div>
        <button class="toast__close" @click="ui.dismissToast(toast.id)">
          <IconSymbol name="close" />
        </button>
      </div>
    </transition-group>
  </div>
</template>

<script setup lang="ts">
import IconSymbol from '@/components/IconSymbol.vue';
import { useUiStore } from '@/stores/ui';

const ui = useUiStore();

function icon(type: string) {
  switch (type) {
    case 'success':
      return 'check_circle';
    case 'error':
      return 'error';
    case 'warning':
      return 'warning';
    default:
      return 'info';
  }
}
</script>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  z-index: 2000;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

.toast {
  min-width: 220px;
  max-width: 320px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.8rem;
  padding: 0.75rem 0.9rem;
  border-radius: 14px;
  backdrop-filter: blur(12px);
  border: 1px solid rgba(110, 140, 220, 0.2);
  background: rgba(12, 18, 30, 0.88);
  color: #e9f1ff;
}

.toast.success {
  border-color: rgba(90, 230, 170, 0.35);
}

.toast.error {
  border-color: rgba(255, 140, 140, 0.35);
}

.toast.warning {
  border-color: rgba(255, 210, 120, 0.35);
}

.toast__icon span {
  font-size: 1.4rem;
}

.toast__body strong {
  display: block;
  font-size: 0.95rem;
  margin-bottom: 0.2rem;
}

.toast__body p {
  margin: 0;
  font-size: 0.8rem;
  opacity: 0.8;
}

.toast__close {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0.2rem;
}
</style>
