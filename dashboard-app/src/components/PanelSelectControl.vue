<template>
  <PanelFloatingControl
    :icon="icon"
    :display-text="displayText"
    :placeholder="placeholder"
    :active="isActive"
    :disabled="disabled"
  :trigger-aria-label="ariaLabel"
    overlay-role="listbox"
    overlay-class="panel-control-overlay--select"
    :overlay-min-width="overlayWidth"
    @open="handleOpen"
    @after-open="focusFirstOption"
  >
    <template #overlay="{ close, updatePosition }">
      <ul
        ref="optionsEl"
        class="panel-select-overlay"
        role="listbox"
        :aria-activedescendant="activeOptionId"
        tabindex="-1"
        @keydown="(event) => handleKeydown(event, close, updatePosition)"
      >
        <li
          v-for="(option, index) in normalizedOptions"
          :key="option.value"
          :id="optionId(option.value)"
          class="panel-select-overlay__item"
        >
          <button
            type="button"
            :class="{
              'panel-select-overlay__button': true,
              'panel-select-overlay__button--active': option.value === modelValue,
              'panel-select-overlay__button--highlight': highlightIndex === index,
              'panel-select-overlay__button--disabled': option.disabled
            }"
            :disabled="option.disabled"
            :data-option-index="index"
            @click="selectOption(option.value, close)"
          >
            <span>{{ option.label }}</span>
            <IconSymbol v-if="option.value === modelValue" name="check" />
          </button>
        </li>
      </ul>
    </template>
  </PanelFloatingControl>
</template>

<script setup lang="ts">
import IconSymbol from '@/components/IconSymbol.vue';
import PanelFloatingControl from '@/components/PanelFloatingControl.vue';
import { computed, ref, watch } from 'vue';

type OptionItem = {
  value: string;
  label: string;
  disabled?: boolean;
};

const props = withDefaults(
  defineProps<{
    modelValue: string;
    options: OptionItem[];
    placeholder?: string;
    icon?: string;
    ariaLabel?: string;
    disabled?: boolean;
    overlayWidth?: number;
  }>(),
  {
    placeholder: '选择',
    icon: 'sort',
    ariaLabel: '选择排序方式',
    disabled: false,
    overlayWidth: 220
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const optionsEl = ref<HTMLUListElement | null>(null);
const highlightIndex = ref<number | null>(null);

const normalizedOptions = computed(() => props.options);

const currentOption = computed(() => normalizedOptions.value.find((item) => item.value === props.modelValue) ?? null);
const displayText = computed(() => currentOption.value?.label ?? props.placeholder);
const isActive = computed(() => currentOption.value != null);
const activeOptionId = computed(() => (highlightIndex.value != null ? optionId(normalizedOptions.value[highlightIndex.value]?.value ?? '') : undefined));

watch(
  () => props.modelValue,
  (value) => {
    const index = normalizedOptions.value.findIndex((option) => option.value === value);
    if (index !== -1) {
      highlightIndex.value = index;
    }
  },
  { immediate: true }
);

function optionId(value: string) {
  return value ? `panel-select-option-${value}` : undefined;
}

function handleOpen() {
  const index = normalizedOptions.value.findIndex((option) => option.value === props.modelValue && !option.disabled);
  highlightIndex.value = index !== -1 ? index : normalizedOptions.value.findIndex((option) => !option.disabled);
}

function focusFirstOption() {
  if (!optionsEl.value) return;
  if (highlightIndex.value != null) {
    const target = optionsEl.value.querySelector<HTMLButtonElement>(
      `button[data-option-index="${highlightIndex.value}"]`
    );
    if (target) {
      target.focus({ preventScroll: true });
      return;
    }
  }
  const fallback = optionsEl.value.querySelector<HTMLButtonElement>('button:not(:disabled)');
  fallback?.focus({ preventScroll: true });
}

function moveHighlight(delta: number) {
  if (!normalizedOptions.value.length) return;
  let index = highlightIndex.value ?? -1;
  for (let i = 0; i < normalizedOptions.value.length; i += 1) {
    index = (index + delta + normalizedOptions.value.length) % normalizedOptions.value.length;
    const option = normalizedOptions.value[index];
    if (!option?.disabled) {
      highlightIndex.value = index;
      return;
    }
  }
}

function handleKeydown(event: KeyboardEvent, close: () => void, updatePosition: () => void) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      moveHighlight(1);
      updatePosition();
      break;
    case 'ArrowUp':
      event.preventDefault();
      moveHighlight(-1);
      updatePosition();
      break;
    case 'Home':
      event.preventDefault();
      highlightIndex.value = normalizedOptions.value.findIndex((option) => !option.disabled);
      updatePosition();
      break;
    case 'End':
      event.preventDefault();
      for (let i = normalizedOptions.value.length - 1; i >= 0; i -= 1) {
        if (!normalizedOptions.value[i]?.disabled) {
          highlightIndex.value = i;
          break;
        }
      }
      updatePosition();
      break;
    case 'Enter':
    case ' ': {
      event.preventDefault();
      if (highlightIndex.value != null) {
        const option = normalizedOptions.value[highlightIndex.value];
        if (option && !option.disabled) {
          selectOption(option.value, close);
        }
      }
      break;
    }
    case 'Escape':
      close();
      break;
    default:
      break;
  }
}

function selectOption(value: string, close: () => void) {
  if (props.disabled) return;
  if (value !== props.modelValue) {
    emit('update:modelValue', value);
  }
  close();
}
</script>
