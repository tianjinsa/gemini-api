import { defineStore } from 'pinia';
import { nanoid } from 'nanoid';
import { reactive, ref } from 'vue';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration: number;
  createdAt: number;
}

export interface PreviewPayload {
  title: string;
  content: string;
  mimeType?: string;
  downloadableName?: string;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export const useUiStore = defineStore('ui', () => {
  const toasts = ref<ToastItem[]>([]);
  const preview = reactive<{ open: boolean; payload: PreviewPayload | null }>({
    open: false,
    payload: null
  });

  const imagePreview = reactive<{ open: boolean; src: string; name?: string }>(
    {
      open: false,
      src: '',
      name: undefined
    }
  );

  const confirmDialog = reactive<{
    open: boolean;
    options: ConfirmOptions | null;
    resolve: ((confirmed: boolean) => void) | null;
  }>({
    open: false,
    options: null,
    resolve: null
  });

  const banManagerOpen = ref(false);
  const aliasManagerOpen = ref(false);
  const helpPanelOpen = ref(false);

  function pushToast(payload: { type: ToastType; title: string; message?: string; duration?: number }) {
    const toast: ToastItem = {
      id: nanoid(8),
      type: payload.type,
      title: payload.title,
      message: payload.message,
      duration: payload.duration ?? 5000,
      createdAt: Date.now()
    };
    toasts.value = [...toasts.value, toast];
    window.setTimeout(() => dismissToast(toast.id), toast.duration);
  }

  function dismissToast(id: string) {
    toasts.value = toasts.value.filter(item => item.id !== id);
  }

  function showPreview(payload: PreviewPayload) {
    preview.open = true;
    preview.payload = payload;
  }

  function closePreview() {
    preview.open = false;
    preview.payload = null;
  }

  function showImagePreview(src: string, name?: string) {
    imagePreview.open = true;
    imagePreview.src = src;
    imagePreview.name = name;
  }

  function closeImagePreview() {
    imagePreview.open = false;
    imagePreview.src = '';
    imagePreview.name = undefined;
  }

  function confirm(options: ConfirmOptions) {
    if (confirmDialog.open && confirmDialog.resolve) {
      confirmDialog.resolve(false);
    }

    return new Promise<boolean>((resolve) => {
      confirmDialog.open = true;
      confirmDialog.options = options;
      confirmDialog.resolve = resolve;
    });
  }

  function resolveConfirm(result: boolean) {
    if (confirmDialog.resolve) {
      confirmDialog.resolve(result);
    }
    confirmDialog.open = false;
    confirmDialog.options = null;
    confirmDialog.resolve = null;
  }

  function toggleBanManager(open?: boolean) {
    banManagerOpen.value = open ?? !banManagerOpen.value;
  }

  function toggleAliasManager(open?: boolean) {
    aliasManagerOpen.value = open ?? !aliasManagerOpen.value;
  }

  function toggleHelpPanel(open?: boolean) {
    helpPanelOpen.value = open ?? !helpPanelOpen.value;
  }

  return {
    toasts,
    preview,
    imagePreview,
    confirmDialog,
    banManagerOpen,
  aliasManagerOpen,
  helpPanelOpen,
    pushToast,
    dismissToast,
    showPreview,
    closePreview,
    showImagePreview,
    closeImagePreview,
    confirm,
    resolveConfirm,
    toggleBanManager,
    toggleAliasManager,
    toggleHelpPanel
  };
});
