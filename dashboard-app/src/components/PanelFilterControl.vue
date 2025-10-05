<template>
  <PanelFloatingControl
    :icon="icon"
    :display-text="displayText"
    :placeholder="placeholder"
    :active="isActive"
  :disabled="disabled"
  :trigger-aria-label="ariaLabel"
    overlay-role="dialog"
    overlay-class="panel-control-overlay--filter"
    :overlay-min-width="overlayWidth"
    :show-chevron="false"
    @open="handleOpen"
    @after-open="handleAfterOpen"
    @after-close="handleAfterClose"
  >
    <template #overlay="{ close }">
      <form class="panel-filter-overlay" @submit.prevent="close">
        <IconSymbol :name="icon" class="panel-filter-overlay__icon" />
        <input
          ref="inputEl"
          v-model="draftValue"
          :placeholder="placeholder"
          :aria-label="ariaLabel"
          :disabled="disabled"
          @input="onInput"
          @keydown.enter.exact.prevent="close()"
          @keydown.esc.prevent="close()"
        />
        <button
          v-if="draftValue.length"
          class="panel-filter-overlay__clear"
          type="button"
          @click="clear"
        >
          清除
        </button>
      </form>
    </template>
  </PanelFloatingControl>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import IconSymbol from '@/components/IconSymbol.vue';
import PanelFloatingControl from '@/components/PanelFloatingControl.vue';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    icon?: string;
    disabled?: boolean;
    ariaLabel?: string;
    overlayWidth?: number;
  }>(),
  {
    placeholder: '搜索',
    icon: 'search',
    disabled: false,
    ariaLabel: '过滤列表',
    overlayWidth: 280
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const draftValue = ref(props.modelValue);
const inputEl = ref<HTMLInputElement | null>(null);

const normalizedValue = computed(() => props.modelValue.trim());
const isActive = computed(() => normalizedValue.value.length > 0);
const displayText = computed(() => (normalizedValue.value.length > 0 ? normalizedValue.value : props.placeholder));

watch(
  () => props.modelValue,
  (value) => {
    if (value !== draftValue.value) {
      draftValue.value = value;
    }
  }
);

function commit(value: string) {
  emit('update:modelValue', value.trim());
}

function onInput() {
  commit(draftValue.value);
}

function clear() {
  draftValue.value = '';
  commit('');
  nextTick(() => {
    inputEl.value?.focus({ preventScroll: true });
  });
}

function handleOpen() {
  draftValue.value = props.modelValue;
}

async function handleAfterOpen() {
  await nextTick();
  inputEl.value?.focus({ preventScroll: true });
  inputEl.value?.select();
}

function handleAfterClose() {
  commit(draftValue.value);
}
</script>
