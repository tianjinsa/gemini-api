<template>
  <teleport to="body">
    <transition name="fade">
      <div
        v-if="preview.open && preview.payload"
        class="overlay"
        @pointerdown.self="onBackdropPointerDown"
        @pointerup.self="onBackdropPointerUp"
      >
        <div class="modal">
          <header>
            <h3>{{ preview.payload.title }}</h3>
            <div class="actions">
              <button v-if="downloadUrl" class="ghost" @click="download">
                <IconSymbol name="download" />
                导出
              </button>
              <button class="icon" @click="onClose">
                <IconSymbol name="close" />
              </button>
            </div>
          </header>
          <section>
            <component :is="renderer" :source="preview.payload.content" />
          </section>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import IconSymbol from '@/components/IconSymbol.vue';
import { defineComponent, h, watch, ref } from 'vue';
import { useUiStore } from '@/stores/ui';
import { useOverlayDismiss } from '@/composables/overlayDismiss';

const ui = useUiStore();
const preview = ui.preview;

const PlainRenderer = defineComponent<{ source: string }>(
  {
    name: 'PlainRenderer',
    props: {
      source: {
        type: String,
        required: true
      }
    },
    setup(props) {
      return () => h('pre', { class: 'plain' }, props.source);
    }
  }
);

// 所有内容都使用纯文本渲染器
const renderer = PlainRenderer;

const downloadUrl = ref<string | null>(null);

const { onBackdropPointerDown, onBackdropPointerUp } = useOverlayDismiss(onClose);

watch(
  () => {
    if (!preview.open || !preview.payload?.downloadableName) return null;
    return {
      content: preview.payload.content,
      mimeType: preview.payload.mimeType
    };
  },
  (value, _old, onCleanup) => {
    if (downloadUrl.value) {
      URL.revokeObjectURL(downloadUrl.value);
      downloadUrl.value = null;
    }

    if (value) {
      const blob = new Blob([value.content], { type: value.mimeType ?? 'text/plain' });
      const url = URL.createObjectURL(blob);
      downloadUrl.value = url;
      onCleanup(() => {
        URL.revokeObjectURL(url);
      });
    }
  }
);

function onClose() {
  ui.closePreview();
}

function download() {
  if (!downloadUrl.value || !preview.payload?.downloadableName) return;
  const a = document.createElement('a');
  a.href = downloadUrl.value;
  a.download = preview.payload.downloadableName;
  a.click();
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(6, 10, 18, 0.85);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  z-index: 2400;
}

.modal {
  width: min(860px, 96vw);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: rgba(12, 18, 30, 0.95);
  border-radius: 18px;
  border: 1px solid rgba(110, 150, 255, 0.18);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

header {
  padding: 1.1rem 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(110, 150, 255, 0.12);
}

header h3 {
  margin: 0;
  font-size: 1.2rem;
  color: #f2f6ff;
}

header .actions {
  display: flex;
  gap: 0.6rem;
  align-items: center;
}

header button {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.45rem 0.8rem;
  border-radius: 10px;
  border: 1px solid transparent;
  background: rgba(50, 80, 150, 0.18);
  color: #dce6ff;
  cursor: pointer;
}

header button.ghost {
  background: rgba(50, 80, 150, 0.12);
  border-color: rgba(80, 110, 185, 0.35);
}

header button.icon {
  padding: 0.35rem;
  background: transparent;
  border: none;
}

section {
  padding: 1.25rem 1.5rem;
  overflow-y: auto;
  color: #d6e2ff;
}

.plain {
  white-space: pre-wrap;
  background: rgba(20, 28, 45, 0.85);
  border-radius: 12px;
  border: 1px solid rgba(60, 88, 150, 0.2);
  padding: 1rem;
  font-family: 'Fira Code', 'JetBrains Mono', Consolas, monospace;
  font-size: 0.9rem;
  line-height: 1.65;
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
