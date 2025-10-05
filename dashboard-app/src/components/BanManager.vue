<template>
  <teleport to="body">
    <transition name="overlay-dialog">
      <div
        v-if="ui.banManagerOpen"
        class="overlay"
        @pointerdown.self="onBackdropPointerDown"
        @pointerup.self="onBackdropPointerUp"
      >
        <div class="panel">
          <header>
            <h3>IP 封禁管理</h3>
            <div class="actions">
              <button class="ghost" :disabled="refreshing" @click="refresh">刷新</button>
              <button class="icon" @click="close">
                <IconSymbol name="close" />
              </button>
            </div>
          </header>

          <section class="form-section">
            <h4>新增封禁</h4>
            <form @submit.prevent="submit">
              <div class="field">
                <label>IP 地址</label>
                <input v-model.trim="ip" type="text" placeholder="例如 192.168.0.1" required />
              </div>
              <div class="field-inline">
                <div class="field">
                  <label>封禁时长</label>
                  <select v-model="duration">
                    <option v-for="option in durationOptions" :key="option.value ?? 'perm'" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </div>
                <div class="field">
                  <label>原因（可选）</label>
                  <input v-model.trim="reason" type="text" placeholder="记录封禁原因" />
                </div>
                <button class="primary" type="submit" :disabled="submitting">
                  <IconSymbol name="gavel" />
                  封禁
                </button>
              </div>
            </form>
          </section>

          <section class="list-section">
            <h4>已封禁 IP</h4>
            <div v-if="refreshing" class="loading">正在加载...</div>
            <div v-else-if="entries.length === 0" class="empty">暂无封禁记录</div>
            <table v-else>
              <thead>
                <tr>
                  <th>IP</th>
                  <th>解除时间</th>
                  <th>剩余</th>
                  <th>原因</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="entry in entries" :key="entry.ip">
                  <td class="mono">{{ entry.ip }}</td>
                  <td>{{ formatTimestamp(entry.unblockAt) }}</td>
                  <td>{{ formatRemaining(entry.unblockAt) }}</td>
                  <td>{{ entry.reason || '—' }}</td>
                  <td>
                    <button class="danger" @click="unban(entry.ip)">解除封禁</button>
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
import { computed, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useDashboardStore } from '@/stores/dashboard';
import { useUiStore } from '@/stores/ui';
import { formatDateTime, formatDuration } from '@/utils/format';
import { useOverlayDismiss } from '@/composables/overlayDismiss';

const dashboard = useDashboardStore();
const ui = useUiStore();
const { blockedIPs, loadingBlockedIPs } = storeToRefs(dashboard);

const durationOptions = [
  { label: '1 小时', value: 60 * 60 * 1000 },
  { label: '6 小时', value: 6 * 60 * 60 * 1000 },
  { label: '1 天', value: 24 * 60 * 60 * 1000 },
  { label: '7 天', value: 7 * 24 * 60 * 60 * 1000 },
  { label: '30 天', value: 30 * 24 * 60 * 60 * 1000 },
  { label: '永久', value: null }
] as const;

const ip = ref('');
const duration = ref<number | null>(durationOptions[2].value);
const reason = ref('');
const submitting = ref(false);

const refreshing = computed(() => loadingBlockedIPs.value);
const entries = computed(() => blockedIPs.value?.blocked ?? []);
const now = computed(() => blockedIPs.value?.now ?? Date.now());

async function ensureData(force = false) {
  await dashboard.refreshBlockedIPs(force);
}

async function submit() {
  if (!ip.value) return;
  submitting.value = true;
  try {
    await dashboard.banIp(ip.value, duration.value ?? undefined, reason.value || undefined);
    ui.pushToast({ type: 'success', title: '封禁成功', message: `${ip.value} 已被封禁` });
    ip.value = '';
    reason.value = '';
    await ensureData(true);
  } catch (error) {
    ui.pushToast({ type: 'error', title: '封禁失败', message: error instanceof Error ? error.message : String(error) });
  } finally {
    submitting.value = false;
  }
}

async function refresh() {
  await ensureData(true);
}

function close() {
  ui.toggleBanManager(false);
}

const { onBackdropPointerDown, onBackdropPointerUp } = useOverlayDismiss(close);

async function unban(target: string) {
  await dashboard.unbanIp(target);
  ui.pushToast({ type: 'success', title: '已解除封禁', message: `${target} 已解除` });
  await ensureData(true);
}

function formatTimestamp(unblockAt: number | null) {
  if (!unblockAt) return '永久封禁';
  return formatDateTime(unblockAt);
}

function formatRemaining(unblockAt: number | null) {
  if (!unblockAt) return '永久';
  const diff = unblockAt - now.value;
  if (diff <= 0) return '即将解除';
  return formatDuration(diff);
}

watch(
  () => ui.banManagerOpen,
  (open) => {
    if (open) {
      ensureData();
    }
  }
);

onMounted(() => {
  if (ui.banManagerOpen) {
    ensureData();
  }
});
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(8, 12, 22, 0.8);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  z-index: 2350;
}

.panel {
  /* 解释：使用 CSS 的 min() 函数，使面板宽度在不同视口下具有响应性。
     当视口宽度大于等于 960px 时，宽度为 960px（避免过宽）。
     当视口较小（如手机）时，宽度为视口宽度的 96%（96vw），保留两侧间距。 */
  width: min(960px, 96vw);
  max-height: 92vh;
  background: rgba(15, 22, 35, 0.96);
  border-radius: 18px;
  border: 1px solid rgba(110, 150, 255, 0.2);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  color: #e1e9ff;
}

header {
  padding: 1.2rem 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(110, 150, 255, 0.15);
}

header h3 {
  margin: 0;
  font-size: 1.35rem;
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
  padding: 1.3rem 1.6rem;
  overflow-y: auto;
}

.form-section form {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.field-inline {
  display: flex;
  gap: 1rem;
  align-items: flex-end;
}

input,
select {
  background: rgba(18, 26, 42, 0.85);
  border: 1px solid rgba(110, 150, 255, 0.3);
  border-radius: 10px;
  padding: 0.55rem 0.75rem;
  color: inherit;
}

button.primary {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: linear-gradient(135deg, rgba(120, 160, 255, 0.9), rgba(80, 120, 220, 0.95));
  border: none;
  color: #061026;
  padding: 0.55rem 1rem;
  border-radius: 999px;
  cursor: pointer;
}

.list-section table {
  width: 100%;
  border-collapse: collapse;
  background: rgba(18, 26, 42, 0.75);
  border-radius: 14px;
  overflow: hidden;
}

th,
td {
  padding: 0.65rem 0.8rem;
  border-bottom: 1px solid rgba(110, 150, 255, 0.1);
  text-align: left;
  font-size: 0.9rem;
}

th {
  background: rgba(22, 30, 48, 0.85);
  position: sticky;
  top: 0;
  z-index: 1;
}

td.mono {
  font-family: 'Fira Code', 'JetBrains Mono', Consolas, monospace;
}

.loading,
.empty {
  padding: 2rem 0;
  text-align: center;
  color: rgba(200, 212, 255, 0.7);
}

button.danger {
  background: transparent;
  border: 1px solid rgba(255, 142, 158, 0.6);
  border-radius: 999px;
  color: rgba(255, 160, 176, 0.95);
  padding: 0.35rem 0.8rem;
  cursor: pointer;
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
