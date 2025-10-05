<template>
  <span
    class="material-symbols-outlined icon-symbol"
    role="img"
    aria-hidden="true"
    v-bind="attrs"
  >
    {{ glyph }}
  </span>
</template>

<script setup lang="ts">
import { computed, useAttrs } from 'vue';

defineOptions({ inheritAttrs: false });

type IconName =
  | 'assistant'
  | 'check_circle'
  | 'chevron_left'
  | 'chevron_right'
  | 'close'
  | 'content_copy'
  | 'description'
  | 'data_object'
  | 'delete'
  | 'download'
  | 'error'
  | 'expand_more'
  | 'filter_alt'
  | 'gavel'
  | 'gpp_maybe'
  | 'help'
  | 'info'
  | 'key'
  | 'image'
  | 'list'
  | 'attach_file'
  | 'open_in_new'
  | 'psychology'
  | 'psychology_alt'
  | 'refresh'
  | 'search'
  | 'sort'
  | 'sync'
  | 'visibility'
  | 'warning'
  | 'zoom_in';

type IconMap = Record<IconName | 'default', string>;

const attrs = useAttrs();

const props = defineProps<{ name: string }>();

const ICONS: IconMap = {
  assistant: '🤖',
  check_circle: '✔',
  chevron_left: '‹',
  chevron_right: '›',
  close: '✕',
  content_copy: '⧉',
  description: '📝',
  data_object: '{}',
  delete: '🗑',
  download: '⬇',
  error: '⛔',
  expand_more: '⌄',
  filter_alt: '⛃',
  gavel: '🔨',
  gpp_maybe: '⚠',
  help: '？',
  info: 'ℹ',
  key: '🔑',
  image: '🖼',
  list: '≡',
  attach_file: '📎',
  open_in_new: '↗',
  psychology: '🧠',
  psychology_alt: '🧠',
  refresh: '⟳',
  search: '🔍',
  sort: '⇅',
  sync: '⟳',
  visibility: '👁',
  warning: '⚠',
  zoom_in: '＋',
  default: '•'
};

const glyph = computed(() => ICONS[props.name as IconName] ?? ICONS.default);
</script>

<style scoped>
.icon-symbol {
  font-family: 'Segoe UI Symbol', 'Segoe UI Emoji', 'Noto Color Emoji', system-ui, sans-serif;
  font-size: 1.2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  user-select: none;
}
</style>
