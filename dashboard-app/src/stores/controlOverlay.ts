import { defineStore } from 'pinia';
import { reactive, ref, shallowRef } from 'vue';

export type OverlayControlVariant = 'filter' | 'sort';

export interface OverlayOptionItem {
  value: string;
  label: string;
  disabled?: boolean;
}

interface OverlayRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface OpenOverlayPayload {
  controlId: string;
  anchorEl: HTMLElement;
  variant: OverlayControlVariant;
  label: string;
  icon: string;
  value: string;
  options?: OverlayOptionItem[];
  expandedWidth?: number;
  collapsedWidth?: number;
  align?: 'left' | 'right';
  onInput?: (value: string) => void;
  onCommit?: (value: string) => void;
  onCancel?: () => void;
}

let measurementCanvas: HTMLCanvasElement | null = null;
let measurementContext: CanvasRenderingContext2D | null = null;

function estimateSortWidth(options: OverlayOptionItem[], collapsed: number) {
  const base = Math.max(collapsed * 1.6, 220);
  if (typeof window === 'undefined') {
    return base;
  }

  if (!measurementCanvas) {
    measurementCanvas = document.createElement('canvas');
  }
  if (!measurementContext) {
    measurementContext = measurementCanvas.getContext('2d');
  }
  const ctx = measurementContext;
  if (!ctx) {
    return base;
  }

  const computed = window.getComputedStyle(document.body);
  const font = computed.font || '14px "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.font = font;

  let maxLabelWidth = 0;
  options.forEach((option) => {
    if (!option?.label) return;
    const metrics = ctx.measureText(option.label);
    maxLabelWidth = Math.max(maxLabelWidth, metrics.width);
  });

  const padding = 96;
  return Math.max(base, Math.ceil(maxLabelWidth + padding));
}

const ANCHOR_HIDDEN_CLASS = 'control-button--overlay-hidden';
const DATA_ATTR_SENTINEL = '__overlay__none__';

export const useControlOverlayStore = defineStore('controlOverlay', () => {
  const rect = reactive<OverlayRect>({ top: 0, left: 0, width: 0, height: 0 });
  const visible = ref(false);
  const expanded = ref(false);
  const closing = ref(false);

  const controlId = ref('');
  const variant = ref<OverlayControlVariant>('filter');
  const label = ref('');
  const icon = ref('');
  const value = ref('');
  const options = ref<OverlayOptionItem[]>([]);
  const align = ref<'left' | 'right'>('left');
  const collapsedWidth = ref(0);
  const expandedWidth = ref(220);
  const hasCustomCollapsedWidth = ref(false);
  const hasCustomExpandedWidth = ref(false);

  const anchorEl = shallowRef<HTMLElement | null>(null);
  const relocating = ref(false);

  let relocateTimer: number | null = null;

  const onInput = shallowRef<((value: string) => void) | null>(null);
  const onCommit = shallowRef<((value: string) => void) | null>(null);
  const onCancel = shallowRef<(() => void) | null>(null);

  function assignRect(target: HTMLElement) {
    const next = target.getBoundingClientRect();
    rect.top = next.top;
    rect.left = next.left;
    rect.width = next.width;
    rect.height = next.height;
  }

  let closeIntent: number | null = null;

  function clearCloseIntent() {
    if (closeIntent !== null) {
      window.clearTimeout(closeIntent);
      closeIntent = null;
    }
  }

  function stopRelocating() {
    if (relocateTimer !== null) {
      window.clearTimeout(relocateTimer);
      relocateTimer = null;
    }
    relocating.value = false;
  }

  function startRelocating(duration = 260) {
    stopRelocating();
    relocating.value = true;
    relocateTimer = window.setTimeout(() => {
      relocating.value = false;
      relocateTimer = null;
    }, duration);
  }

  function hideAnchorElement(target: HTMLElement | null) {
    if (!target) return;
    const dataset = target.dataset;
    if (!dataset.overlayPrevAria) {
      dataset.overlayPrevAria = target.getAttribute('aria-hidden') ?? DATA_ATTR_SENTINEL;
    }
    if (!dataset.overlayPrevTabindex) {
      dataset.overlayPrevTabindex = target.getAttribute('tabindex') ?? DATA_ATTR_SENTINEL;
    }
    target.setAttribute('aria-hidden', 'true');
    target.setAttribute('tabindex', '-1');
    dataset.overlayHidden = 'true';
    target.classList.add(ANCHOR_HIDDEN_CLASS);
  }

  function restoreAnchorElement(target: HTMLElement | null) {
    if (!target) return;
    const dataset = target.dataset;
    target.classList.remove(ANCHOR_HIDDEN_CLASS);
    if (dataset.overlayHidden) {
      delete dataset.overlayHidden;
    }
    if (dataset.overlayPrevAria) {
      if (dataset.overlayPrevAria === DATA_ATTR_SENTINEL) {
        target.removeAttribute('aria-hidden');
      } else {
        target.setAttribute('aria-hidden', dataset.overlayPrevAria);
      }
      delete dataset.overlayPrevAria;
    } else {
      target.removeAttribute('aria-hidden');
    }
    if (dataset.overlayPrevTabindex) {
      if (dataset.overlayPrevTabindex === DATA_ATTR_SENTINEL) {
        target.removeAttribute('tabindex');
      } else {
        target.setAttribute('tabindex', dataset.overlayPrevTabindex);
      }
      delete dataset.overlayPrevTabindex;
    } else {
      target.removeAttribute('tabindex');
    }
  }

  function open(payload: OpenOverlayPayload) {
    const previousAnchor = anchorEl.value;
    const anchorChanged = previousAnchor !== null && previousAnchor !== payload.anchorEl;
    const wasVisible = visible.value;

    if (anchorChanged) {
      restoreAnchorElement(previousAnchor);
    }

    anchorEl.value = payload.anchorEl;
    assignRect(payload.anchorEl);

    hideAnchorElement(payload.anchorEl);

    controlId.value = payload.controlId;
    variant.value = payload.variant;
    label.value = payload.label;
    icon.value = payload.icon;
    value.value = payload.value;
    options.value = payload.options?.slice() ?? [];
    align.value = payload.align ?? 'left';
    const collapsed = payload.collapsedWidth ?? rect.width;
    collapsedWidth.value = collapsed;
    hasCustomCollapsedWidth.value = payload.collapsedWidth != null;

    if (payload.expandedWidth != null) {
      expandedWidth.value = Math.max(payload.expandedWidth, collapsed);
      hasCustomExpandedWidth.value = true;
    } else if (payload.variant === 'sort') {
      expandedWidth.value = Math.max(estimateSortWidth(options.value, collapsed), collapsed);
      hasCustomExpandedWidth.value = false;
    } else {
      expandedWidth.value = Math.max(rect.width * 4, 220, collapsed);
      hasCustomExpandedWidth.value = false;
    }

    onInput.value = payload.onInput ?? null;
    onCommit.value = payload.onCommit ?? null;
    onCancel.value = payload.onCancel ?? null;

    clearCloseIntent();
    const shouldRelocate = anchorChanged && wasVisible;
    closing.value = false;

    if (shouldRelocate) {
      startRelocating();
      expanded.value = true;
      visible.value = true;
    } else {
      stopRelocating();
      expanded.value = false;
      visible.value = true;
    }
  }

  function updateValue(next: string) {
    value.value = next;
    onInput.value?.(next);
  }

  function commit(nextValue?: string) {
    const payload = nextValue ?? value.value;
    value.value = payload;
    onCommit.value?.(payload);
    requestClose();
  }

  function beginInteraction() {
    if (!visible.value) return;
    clearCloseIntent();
    closing.value = false;
    expanded.value = true;
  }

  function scheduleClose(delay = 160) {
    if (!visible.value) return;
    clearCloseIntent();
    closeIntent = window.setTimeout(() => {
      closeIntent = null;
      requestClose();
    }, delay);
  }

  function requestClose(immediate = false) {
    if (!visible.value) return;
    clearCloseIntent();
    if (closing.value && !immediate) {
      return;
    }
    if (immediate) {
      expanded.value = false;
      closing.value = false;
      visible.value = false;
      finalize();
      return;
    }
    if (closing.value) return;
    expanded.value = false;
    closing.value = true;
  }

  function cancel() {
    onCancel.value?.();
    requestClose();
  }

  function finalize() {
    clearCloseIntent();
    stopRelocating();
    if (anchorEl.value) {
      restoreAnchorElement(anchorEl.value);
    }
    anchorEl.value = null;
    visible.value = false;
    closing.value = false;
    expanded.value = false;
    controlId.value = '';
    hasCustomCollapsedWidth.value = false;
    hasCustomExpandedWidth.value = false;
    onInput.value = null;
    onCommit.value = null;
    onCancel.value = null;
  }

  function refreshAnchorRect() {
    if (!anchorEl.value) return;
    assignRect(anchorEl.value);
    if (!hasCustomCollapsedWidth.value) {
      collapsedWidth.value = rect.width;
    }
    if (!hasCustomExpandedWidth.value) {
      if (variant.value === 'sort') {
        expandedWidth.value = Math.max(estimateSortWidth(options.value, collapsedWidth.value), collapsedWidth.value);
      } else {
        expandedWidth.value = Math.max(rect.width * 4, 220, collapsedWidth.value);
      }
    }
  }

  return {
    rect,
    visible,
    expanded,
    closing,
    relocating,
    controlId,
    variant,
    label,
    icon,
    value,
    options,
    align,
    collapsedWidth,
    expandedWidth,
    open,
    updateValue,
    commit,
    requestClose,
    cancel,
    finalize,
    refreshAnchorRect,
    beginInteraction,
    scheduleClose
  };
});
