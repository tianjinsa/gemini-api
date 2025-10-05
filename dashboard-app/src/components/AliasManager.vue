<template>
  <teleport to="body">
    <transition name="overlay-dialog">
      <div
        v-if="ui.aliasManagerOpen"
        class="overlay"
        @pointerdown.self="onBackdropPointerDown"
        @pointerup.self="onBackdropPointerUp"
      >
        <div class="panel">
          <header>
            <h3>别名密钥管理</h3>
            <div class="actions">
              <button class="ghost" :disabled="refreshing" @click="refresh()">刷新</button>
              <button class="icon" @click="close">
                <IconSymbol name="close" />
              </button>
            </div>
          </header>

          <section>
            <div v-if="refreshing" class="loading">正在加载别名密钥...</div>
            <div v-else-if="entries.length === 0" class="empty">暂无别名密钥</div>
            <table v-else>
              <thead>
                <tr>
                  <th>别名</th>
                  <th>创建时间</th>
                  <th>最近使用</th>
                  <th>使用次数</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="entry in entries" :key="entry.aliasName">
                  <td class="mono">{{ entry.aliasName }}</td>
                  <td>{{ formatDate(entry.ctAt) }}</td>
                  <td>{{ formatDate(entry.upAt || entry.firstUsedAt) }}</td>
                  <td>{{ entry.usageCount }}</td>
                  <td>
                    <div class="row-actions">
                      <button class="ghost" @click="copy(entry.aliasName)">
                        <IconSymbol name="content_copy" />
                        复制
                      </button>
                      <button class="danger" @click="remove(entry.aliasName)">
                        <IconSymbol name="delete" />
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import IconSymbol from '@/components/IconSymbol.vue';
import { computed, onMounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useUiStore } from '@/stores/ui';
import { useDashboardStore } from '@/stores/dashboard';
import { formatDateTime } from '@/utils/format';
import { useOverlayDismiss } from '@/composables/overlayDismiss';

const ui = useUiStore();
const dashboard = useDashboardStore();
const { aliasKeys, loadingAliasKeys } = storeToRefs(dashboard);

const entries = computed(() => aliasKeys.value?.aliasKeys ?? []);
const refreshing = computed(() => loadingAliasKeys.value);

function close() {
  ui.toggleAliasManager(false);
}

const { onBackdropPointerDown, onBackdropPointerUp } = useOverlayDismiss(close);

async function refresh(force = true) {
  await dashboard.refreshAliasKeys(force);
}

async function remove(aliasName: string) {
  const confirmed = await ui.confirm({
    title: '删除别名',
    message: `确定要删除别名 ${aliasName} 吗？`
  });
  if (!confirmed) return;
  await dashboard.removeAlias(aliasName);
  ui.pushToast({ type: 'success', title: '删除成功', message: `${aliasName} 已删除` });
  await refresh(true);
}

async function copy(aliasName: string) {
  try {
    await navigator.clipboard.writeText(aliasName);
    ui.pushToast({ type: 'success', title: '已复制', message: aliasName });
  } catch (error) {
    ui.pushToast({ type: 'error', title: '复制失败', message: error instanceof Error ? error.message : String(error) });
  }
}

function formatDate(ts: number | null | undefined) {
  if (!ts) return '—';
  return formatDateTime(ts);
}

watch(
  () => ui.aliasManagerOpen,
  (open) => {
    if (open) refresh(false);
  }
);

onMounted(() => {
  if (ui.aliasManagerOpen) refresh(false);
});
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 24, 0.82);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  z-index: 2350;
}

.panel {
  width: min(840px, 95vw);
  max-height: 90vh;
  background: rgba(18, 22, 34, 0.96);
  border-radius: 18px;
  border: 1px solid rgba(110, 150, 255, 0.2);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  color: #e2e9ff;
}

header {
  padding: 1.1rem 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(110, 150, 255, 0.15);
}

header h3 {
  margin: 0;
  font-size: 1.3rem;
}

header .actions {
  display: flex;
  gap: 0.6rem;
}

header button {
  border-radius: 999px;
  padding: 0.45rem 0.9rem;
  border: 1px solid transparent;
  background: rgba(40, 64, 120, 0.25);
  color: inherit;
  cursor: pointer;
}

header button.ghost {
  background: transparent;
  border-color: rgba(110, 150, 255, 0.35);
}

header button.icon {
  background: transparent;
  border: none;
  padding: 0.25rem;
}

section {
  padding: 1.4rem 1.6rem;
  overflow-y: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  background: rgba(22, 28, 45, 0.78);
  border-radius: 14px;
  overflow: hidden;
}

th,
td {
  padding: 0.65rem 0.85rem;
  border-bottom: 1px solid rgba(110, 150, 255, 0.12);
  text-align: left;
  font-size: 0.92rem;
}

th {
  background: rgba(26, 32, 48, 0.88);
}

td.mono {
  font-family: 'Fira Code', 'JetBrains Mono', Consolas, monospace;
}

.row-actions {
  display: flex;
  gap: 0.6rem;
}

button.ghost,
button.danger {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border-radius: 999px;
  padding: 0.3rem 0.75rem;
  cursor: pointer;
  border: 1px solid transparent;
}

button.ghost {
  background: transparent;
  border-color: rgba(110, 150, 255, 0.4);
  color: inherit;
}

button.danger {
  background: transparent;
  border-color: rgba(255, 140, 140, 0.55);
  color: rgba(255, 152, 152, 0.95);
}

.loading,
.empty {
  padding: 2rem 0;
  text-align: center;
  color: rgba(200, 212, 255, 0.72);
}

.overlay-dialog-enter-active,
.overlay-dialog-leave-active {
  transition: opacity 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.overlay-dialog-enter-from,
.overlay-dialog-leave-to {
  opacity: 0;
}

.overlay-dialog-enter-active .panel,
.overlay-dialog-leave-active .panel {
  transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}

.overlay-dialog-enter-from .panel {
  transform: scale(0.92) translateY(24px);
  opacity: 0;
}

.overlay-dialog-leave-to .panel {
  transform: scale(0.96) translateY(18px);
  opacity: 0;
}
</style>
