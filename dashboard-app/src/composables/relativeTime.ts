import { computed, ref, toValue } from 'vue';
import { createGlobalState, useIntervalFn, type MaybeRefOrGetter } from '@vueuse/core';
import { formatRelative } from '@/utils/format';

const useRelativeNow = createGlobalState(() => {
  const now = ref(Date.now());
  useIntervalFn(() => {
    now.value = Date.now();
  }, 30_000, { immediate: true });
  return now;
});

export const useRelativeTicker = useRelativeNow;

export function useRelativeTime(source: MaybeRefOrGetter<number | string | Date | null | undefined>) {
  const now = useRelativeNow();
  return computed(() => {
    // Establish reactive dependency on the shared ticker
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    now.value;
    const target = toValue(source);
    if (target === null || target === undefined) {
      return '—';
    }
    return formatRelative(target);
  });
}
