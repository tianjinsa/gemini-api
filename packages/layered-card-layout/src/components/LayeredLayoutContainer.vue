<template>
  <div class="vl-layered-container">
    <slot
      v-for="group in groups"
      :key="group.id"
      :group="group"
    />
  </div>
</template>

<script setup lang="ts">
import type { CardGroupConfig } from '../types';

export interface LayeredLayoutContainerProps {
  /**
   * Array of card groups. Each group manages its own cards independently.
   */
  groups: CardGroupConfig[];
}

const props = defineProps<LayeredLayoutContainerProps>();
</script>

<style scoped>
.vl-layered-container {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
  height: 100%;
}
</style>
