import type { InjectionKey, Ref } from 'vue';
import type { HeaderSize, LayoutMode } from '../types';

export interface LayeredLayoutContext {
  mode: Ref<LayoutMode>;
  reportHeaderSize: (id: string, size: HeaderSize) => void;
  reportContentSize?: (id: string, size: HeaderSize) => void;
  requestFocus: (id: string) => void;
}

export const LAYERED_LAYOUT_CONTEXT_KEY: InjectionKey<LayeredLayoutContext> = Symbol('vue-layered-layout-context');
