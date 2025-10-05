<template>
  <div
    ref="rootEl"
    class="panel-select"
    :class="{
      'panel-select--open': isOpen,
      'panel-select--active': isActive,
      'panel-select--disabled': disabled
    }"
    @keydown="handleKeydown"
  >
    <button
      ref="triggerEl"
      class="panel-select__trigger"
      type="button"
      :aria-expanded="isOpen"
      aria-haspopup="listbox"
      :aria-label="buttonAriaLabel"
      :disabled="disabled"
      @click="toggleDropdown"
    >
      <IconSymbol :name="icon" class="panel-select__icon" />
  <span class="panel-select__label" v-text="displayLabel" />
  <IconSymbol name="expand_more" class="panel-select__chevron" />
    </button>
    <transition name="panel-select-dropdown">
      <ul
        v-if="isOpen"
        ref="dropdownEl"
        class="panel-select__dropdown"
        role="listbox"
        tabindex="-1"
        :aria-activedescendant="activeOptionId"
      >
        <li
          v-for="(option, index) in normalizedOptions"
          :id="optionId(option.value)"
          :key="option.value"
          class="panel-select__option"
          :class="{
            'panel-select__option--disabled': option.disabled,
            'panel-select__option--highlight': highlightIndex === index
          }"
          role="option"
          :aria-selected="option.value === modelValue"
          @mouseenter="onHover(index)"
          @mouseleave="onHover(null)"
          @click="() => selectOption(option)"
        >
          <span>{{ option.label }}</span>
          <IconSymbol v-if="option.value === modelValue" name="check_circle" />
        </li>
      </ul>
    </transition>
  </div>
</template>

<script setup lang="ts">
import IconSymbol from '@/components/IconSymbol.vue';
import { computed, nextTick, ref, watch } from 'vue';
import { onClickOutside } from '@vueuse/core';

type OptionItem = {
  value: string;
  label: string;
  disabled?: boolean;
};

const props = defineProps({
  modelValue: {
    type: String,
    required: true
  },
  options: {
    type: Array as () => OptionItem[],
    required: true
  },
  icon: {
    type: String,
    default: 'sort'
  },
  placeholder: {
    type: String,
    default: '选择排序'
  },
  ariaLabel: {
    type: String,
    default: '选择排序方式'
  },
  disabled: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const rootEl = ref<HTMLElement | null>(null);
const triggerEl = ref<HTMLButtonElement | null>(null);
const dropdownEl = ref<HTMLUListElement | null>(null);
const isOpen = ref(false);
const highlightIndex = ref<number | null>(null);

const normalizedOptions = computed(() => props.options);

const currentOption = computed(() => normalizedOptions.value.find((item) => item.value === props.modelValue) ?? null);

const currentLabel = computed(() => currentOption.value?.label ?? '');
const displayLabel = computed(() => currentLabel.value || props.placeholder);

const isActive = computed(() => isOpen.value || Boolean(currentLabel.value));

const buttonAriaLabel = computed(() => {
  if (currentLabel.value) {
    return `${props.ariaLabel}：${currentLabel.value}`;
  }
  return props.ariaLabel;
});

const activeOptionId = computed(() =>
  highlightIndex.value != null ? optionId(normalizedOptions.value[highlightIndex.value]?.value ?? '') : undefined
);

function optionId(value: string) {
  return value ? `panel-select-option-${value}` : undefined;
}

function openDropdown() {
  if (props.disabled || isOpen.value) return;
  isOpen.value = true;
  setInitialHighlight();
  nextTick(() => {
    dropdownEl.value?.focus({ preventScroll: true });
  });
}

function closeDropdown() {
  if (!isOpen.value) return;
  isOpen.value = false;
  highlightIndex.value = null;
  nextTick(() => triggerEl.value?.focus({ preventScroll: true }));
}

function toggleDropdown() {
  if (isOpen.value) {
    closeDropdown();
  } else {
    openDropdown();
  }
}

function setInitialHighlight() {
  const idx = normalizedOptions.value.findIndex((item) => item.value === props.modelValue && !item.disabled);
  if (idx !== -1) {
    highlightIndex.value = idx;
    return;
  }
  const firstAvailable = normalizedOptions.value.findIndex((item) => !item.disabled);
  highlightIndex.value = firstAvailable !== -1 ? firstAvailable : null;
}

function moveHighlight(delta: number) {
  if (highlightIndex.value == null) {
    setInitialHighlight();
    return;
  }
  const total = normalizedOptions.value.length;
  let nextIndex = highlightIndex.value;
  for (let i = 0; i < total; i += 1) {
    nextIndex = (nextIndex + delta + total) % total;
    const option = normalizedOptions.value[nextIndex];
    if (!option?.disabled) {
      highlightIndex.value = nextIndex;
      break;
    }
  }
}

function selectOption(option: OptionItem) {
  if (option.disabled) {
    return;
  }
  if (option.value !== props.modelValue) {
    emit('update:modelValue', option.value);
  }
  closeDropdown();
}

function handleKeydown(event: KeyboardEvent) {
  if (props.disabled) return;
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      if (!isOpen.value) {
        openDropdown();
      } else {
        moveHighlight(1);
      }
      break;
    case 'ArrowUp':
      event.preventDefault();
      if (!isOpen.value) {
        openDropdown();
      } else {
        moveHighlight(-1);
      }
      break;
    case 'Enter':
    case ' ': {
      event.preventDefault();
      if (!isOpen.value) {
        openDropdown();
        break;
      }
      const idx = highlightIndex.value;
      if (idx != null) {
        const option = normalizedOptions.value[idx];
        if (option && !option.disabled) {
          selectOption(option);
        }
      }
      break;
    }
    case 'Escape':
      if (isOpen.value) {
        event.preventDefault();
        closeDropdown();
      }
      break;
    case 'Tab':
      closeDropdown();
      break;
    default:
      break;
  }
}

function onHover(index: number | null) {
  highlightIndex.value = index;
}

onClickOutside(rootEl, () => {
  closeDropdown();
});

watch(
  () => props.modelValue,
  (value) => {
    if (!normalizedOptions.value.some((option) => option.value === value)) {
      highlightIndex.value = null;
    }
  }
);

</script>
