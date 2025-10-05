import { getCurrentInstance, onBeforeUnmount } from 'vue';

interface OverlayDismissHandlers {
  onBackdropPointerDown: (event: PointerEvent) => void;
  onBackdropPointerUp: (event: PointerEvent) => void;
}

export function useOverlayDismiss(onDismiss: () => void): OverlayDismissHandlers {
  if (typeof window === 'undefined') {
    return {
      onBackdropPointerDown: () => void 0,
      onBackdropPointerUp: () => void 0
    };
  }
  let pointerActive = false;
  let pointerId: number | null = null;

  const reset = () => {
    pointerActive = false;
    pointerId = null;
    window.removeEventListener('pointerup', handleWindowPointerUp, true);
    window.removeEventListener('pointercancel', handleWindowPointerCancel, true);
  };

  const handleWindowPointerUp = (event: PointerEvent) => {
    if (pointerActive && pointerId === event.pointerId) {
      onDismiss();
    }
    reset();
  };

  const handleWindowPointerCancel = () => {
    reset();
  };

  const onBackdropPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    pointerActive = true;
    pointerId = event.pointerId;
    window.addEventListener('pointerup', handleWindowPointerUp, true);
    window.addEventListener('pointercancel', handleWindowPointerCancel, true);
  };

  const onBackdropPointerUp = (event: PointerEvent) => {
    if (event.button !== 0) {
      reset();
      return;
    }
    if (!pointerActive || pointerId !== event.pointerId) {
      reset();
      return;
    }
    onDismiss();
    reset();
  };

  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      reset();
    });
  }

  return {
    onBackdropPointerDown,
    onBackdropPointerUp
  };
}
