import { computed } from 'vue';
import type { InjectionKey } from 'vue';
import {
  useLayeredLayout,
  type CardConfig,
  type LayoutCard,
  type LayoutResult as CoreLayoutResult
} from 'vue-layered-layout';

export type PanelId = 'ipList' | 'topicList' | 'messageList';

export interface PanelLayoutHooks {
  reportHeaderSize: (metrics: { width: number; height: number }) => void;
}

export const PANEL_LAYOUT_HOOK_KEY: InjectionKey<Record<PanelId, PanelLayoutHooks>> = Symbol('panel-layout-hooks');

interface LayoutPanel extends LayoutCard {
  id: PanelId;
}

interface LayoutResult {
  stackDirection: 'right' | 'down';
  panels: LayoutPanel[];
  totalSpan: number;
  activePanelId: PanelId | null;
}

const DEFAULT_PANEL_CONFIG: Record<PanelId, CardConfig> = {
  ipList: {
    id: 'ipList',
    minContentWidth: 500,
    contentHeight: "60vh",
    zIndex: 1
  },
  topicList: {
    id: 'topicList',
    minContentWidth: 560,
    contentHeight: "60vh",
    zIndex: 2
  },
  messageList: {
    id: 'messageList',
    minContentWidth: 720,
    contentHeight: "80vh",
    zIndex: 3
  }
};

function cloneCardConfig(config: CardConfig): CardConfig {
  return {
    ...config
  };
}

export function usePanelLayout(order: PanelId[]) {
  const cards = order.map((id) => cloneCardConfig(DEFAULT_PANEL_CONFIG[id]));

  const instance = useLayeredLayout({
    cards,
    defaultStackDirection: 'right',
    autoSwitchDirection: true,
    // breakpointWidth会自动根据卡片的minContentWidth计算，不需要手动指定
    activeBuffer: 20
  });

  const layout = computed<LayoutResult>(() => {
    const value: CoreLayoutResult = instance.layout.value;
    return {
      stackDirection: value.stackDirection,
      panels: value.cards.map((card) => ({
        ...card,
        id: card.id as PanelId
      })),
      totalSpan: value.totalSpan,
      activePanelId: value.activeCardId ? (value.activeCardId as PanelId) : null
    };
  });

  return {
    layout,
    setViewport: instance.setViewport,
    setContainerSize: instance.setContainerSize,
    setFocusedPanel: instance.setFocusedCard,
    updatePanelMetrics: instance.updateCardMetrics,
    updatePanelHeader: instance.updateCardHeader
  };
}
