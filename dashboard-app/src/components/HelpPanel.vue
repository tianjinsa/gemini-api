<template>
  <teleport to="body">
    <transition name="fade">
      <div
        v-if="ui.helpPanelOpen"
        class="overlay"
        @pointerdown.self="onBackdropPointerDown"
        @pointerup.self="onBackdropPointerUp"
      >
        <div class="panel">
          <header>
            <h3>操作帮助</h3>
            <button class="icon" @click="close">
              <IconSymbol name="close" />
            </button>
          </header>
          <section>
            <article>
              <h4>基础用法</h4>
              <ul>
                <li>左侧 IP 面板支持按请求数、流量等排序，单击选择后即可加载相关主题。</li>
                <li>主题列表支持快速筛选，可通过右上角搜索框按主题 ID 或别名过滤。</li>
                <li>消息面板会自动缓存已加载的数据，再次打开时秒级响应，顶部按钮可强制刷新。</li>
              </ul>
            </article>
            <article>
              <h4>操作快捷键</h4>
              <ul>
                <li><kbd>R</kbd>：刷新当前主题消息。</li>
                <li><kbd>Shift</kbd> + <kbd>R</kbd>：请求全量增量同步。</li>
                <li><kbd>Ctrl</kbd> + <kbd>F</kbd>：定位浏览器原生搜索，结合消息折叠功能快速定位。</li>
              </ul>
              <p class="hint">提示：快捷键操作会在浏览器焦点位于页面内时生效。</p>
            </article>
            <article>
              <h4>封禁与别名</h4>
              <ul>
                <li>封禁和别名管理在右上角菜单中打开，支持实时刷新。</li>
                <li>封禁记录支持自定义时长和原因，解除后相关状态实时更新。</li>
                <li>别名密钥展示实时使用次数，删除操作需二次确认以避免误删。</li>
              </ul>
            </article>
            <article>
              <h4>异常处理</h4>
              <ul>
                <li>若出现请求失败，可通过右上角的告警信息查看错误详情并重试。</li>
                <li>消息附件若体积较大，可分块加载文本内容；原始 JSON 支持下载保存。</li>
                <li>若发现数据与服务端不一致，可点击“强制全量刷新”重新同步缓存。</li>
              </ul>
            </article>
          </section>
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

const { onBackdropPointerDown, onBackdropPointerUp } = useOverlayDismiss(close);

function close() {
  ui.toggleHelpPanel(false);
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(8, 12, 20, 0.8);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2.5rem;
  z-index: 2300;
}

.panel {
  width: min(720px, 94vw);
  max-height: 90vh;
  background: rgba(18, 24, 36, 0.96);
  border-radius: 20px;
  border: 1px solid rgba(110, 150, 255, 0.2);
  overflow: hidden;
  color: #e3ecff;
  display: flex;
  flex-direction: column;
}

header {
  padding: 1.1rem 1.6rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(110, 150, 255, 0.15);
}

header button {
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0.25rem;
}

section {
  padding: 1.4rem 1.8rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

article h4 {
  margin: 0 0 0.6rem;
  font-size: 1.05rem;
}

ul {
  margin: 0;
  padding-left: 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.hint {
  margin-top: 0.6rem;
  font-size: 0.85rem;
  color: rgba(203, 214, 255, 0.7);
}

kbd {
  display: inline-block;
  padding: 0.15rem 0.35rem;
  border-radius: 4px;
  border: 1px solid rgba(110, 150, 255, 0.35);
  background: rgba(24, 32, 50, 0.7);
  font-size: 0.8rem;
  font-family: 'Fira Code', 'JetBrains Mono', Consolas, monospace;
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
