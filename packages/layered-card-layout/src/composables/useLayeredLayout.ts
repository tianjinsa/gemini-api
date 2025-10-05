import { computed, reactive } from 'vue';
import type { CardConfig, StackDirection } from '../types';

export interface OrientationMins {
  horizontal: number;
  vertical: number;
}

interface InternalCardState {
  id: string;
  zIndex: number;
  rightStackHeaderWidth: number;
  downStackHeaderHeight: number;
  isFocused: boolean;
  contentWidth: number;
  contentHeight: number;
  config: CardConfig;
}

export interface LayoutCard extends InternalCardState {
  activeMin: number;
  mainSpan: number;
  style: Record<string, string>;
}

export interface LayoutResult {
  stackDirection: StackDirection;
  cards: LayoutCard[];
  totalSpan: number;
  activeCardId: string | null;
}

export interface UseLayeredLayoutOptions {
  cards: CardConfig[];
  defaultStackDirection?: StackDirection;
  autoSwitchDirection?: boolean;
  breakpointWidth?: number;
  activeBuffer?: number;
  minHeader?: OrientationMins;
  maxHeader?: OrientationMins;
}

const DEFAULT_ACTIVE_BUFFER = 20;
const DEFAULT_MIN_CONTENT_SIZE = 500;
const DEFAULT_MIN_HEADER_HORIZONTAL = 72;
const DEFAULT_MIN_HEADER_VERTICAL = 56;
const DEFAULT_MAX_HEADER_HORIZONTAL = 960;
const DEFAULT_MAX_HEADER_VERTICAL = 640;
const DEFAULT_VIEWPORT_WIDTH = 1440;
const DEFAULT_VIEWPORT_HEIGHT = 900;
const HEADER_EPSILON = 0.75;
const VIEWPORT_EPSILON = 1;
const CONTENT_EPSILON = 6;
const SIZE_EPSILON = 0.75;
const STACK_DIRECTION_HYSTERESIS = 64;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const hasSignificantChange = (previous: number, next: number, epsilon = SIZE_EPSILON) => Math.abs(previous - next) > epsilon;

const NUMERIC_PATTERN = /^-?\d+(\.\d+)?$/;

function parsePixelValue(value: string): number | null {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, numeric);
}

function resolvePxLength(value: number | string | null | undefined, fallback: number): number {
  if (value == null) return fallback;
  if (typeof value === 'number') {
    return value >= 0 ? value : fallback;
  }

  const str = String(value).trim().toLowerCase();
  if (!str) return fallback;

  if (NUMERIC_PATTERN.test(str)) {
    const parsed = parsePixelValue(str);
    return parsed ?? fallback;
  }

  if (str.endsWith('px')) {
    const parsed = parsePixelValue(str.slice(0, -2));
    return parsed ?? fallback;
  }

  return fallback;
}

interface ResolveContentHeightOptions {
  viewportHeight: number;
  fallback: number;
}

function resolveContentHeightSize(
  value: number | string | null | undefined,
  { viewportHeight, fallback }: ResolveContentHeightOptions
): number {
  if (value == null) return fallback;
  if (typeof value === 'number') {
    return value >= 0 ? value : fallback;
  }

  const str = String(value).trim().toLowerCase();
  if (!str) return fallback;

  if (NUMERIC_PATTERN.test(str)) {
    const parsed = parsePixelValue(str);
    return parsed ?? fallback;
  }

  if (str.endsWith('px')) {
    const parsed = parsePixelValue(str.slice(0, -2));
    return parsed ?? fallback;
  }

  if (str.endsWith('vh')) {
    const base = viewportHeight > 0 ? viewportHeight : typeof window !== 'undefined' ? window.innerHeight : DEFAULT_VIEWPORT_HEIGHT;
    const ratio = parsePixelValue(str.slice(0, -2));
    if (base <= 0 || ratio == null) return fallback;
    return Math.max(0, (ratio / 100) * base);
  }

  return fallback;
}

export function useLayeredLayout(options: UseLayeredLayoutOptions) {
  const cards = options.cards;
  const activeBuffer = options.activeBuffer ?? DEFAULT_ACTIVE_BUFFER;
  const defaultStackDirection = options.defaultStackDirection ?? 'right';
  const autoSwitchDirection = options.autoSwitchDirection ?? true;
  const minHeader: OrientationMins = options.minHeader ?? {
    horizontal: DEFAULT_MIN_HEADER_HORIZONTAL,
    vertical: DEFAULT_MIN_HEADER_VERTICAL
  };
  const maxHeader: OrientationMins = options.maxHeader ?? {
    horizontal: DEFAULT_MAX_HEADER_HORIZONTAL,
    vertical: DEFAULT_MAX_HEADER_VERTICAL
  };

  const initialActiveId = cards.find((card) => card.initialFocus)?.id ?? (cards.length > 0 ? cards[cards.length - 1].id : null);

  const state = reactive<{
    viewport: {
      width: number;
      height: number;
    };
    container: {
      width: number;
      height: number;
    };
    cards: InternalCardState[];
  }>({
    viewport: {
      width: 1440,
      height: 900
    },
    container: {
      width: 1280,
      height: 800
    },
    cards: cards.map<InternalCardState>((card, index) => ({
      id: card.id,
      zIndex: card.zIndex ?? index + 1,
      rightStackHeaderWidth: card.rightStackHeaderWidth ?? minHeader.horizontal,
      downStackHeaderHeight: card.downStackHeaderHeight ?? minHeader.vertical,
      isFocused: card.initialFocus ?? false,
      contentWidth: resolvePxLength(card.minContentWidth, DEFAULT_MIN_CONTENT_SIZE),
      contentHeight: resolveContentHeightSize(card.contentHeight, {
        viewportHeight: DEFAULT_VIEWPORT_HEIGHT,
        fallback: DEFAULT_MIN_CONTENT_SIZE
      }),
      config: card
    }))
  });

  // 计算breakpointWidth：如果用户提供了就使用，否则自动计算
  let breakpointWidth: number;
  if (options.breakpointWidth != null) {
    breakpointWidth = options.breakpointWidth;
  } else {
    // 从后向前累计头部宽度，计算每张卡片所需的最小宽度，取最大值
    let maxRequiredWidth = 0;
    let accumulatedHeaderWidth = 0;
    
    for (let i = state.cards.length - 1; i >= 0; i--) {
      const card = state.cards[i];
      const minContent = resolvePxLength(card.config.minContentWidth, DEFAULT_MIN_CONTENT_SIZE);
      const requiredWidth = minContent + accumulatedHeaderWidth;
      maxRequiredWidth = Math.max(maxRequiredWidth, requiredWidth);
      accumulatedHeaderWidth += card.rightStackHeaderWidth;
    }
    
    breakpointWidth = maxRequiredWidth;
  }

  let lastStackDirection: StackDirection = defaultStackDirection;

  const layout = computed<LayoutResult>(() => {
    const containerWidth = state.container.width || state.viewport.width || DEFAULT_VIEWPORT_WIDTH;
    const containerHeight = state.container.height || state.viewport.height || DEFAULT_VIEWPORT_HEIGHT;
    const viewportWidth = state.viewport.width || DEFAULT_VIEWPORT_WIDTH;
    const viewportHeight = state.viewport.height || DEFAULT_VIEWPORT_HEIGHT;

    let stackDirection: StackDirection = defaultStackDirection;

    if (autoSwitchDirection && defaultStackDirection === 'right') {
      const downThreshold = Math.max(0, breakpointWidth - STACK_DIRECTION_HYSTERESIS);
      const upThreshold = breakpointWidth + STACK_DIRECTION_HYSTERESIS;

      const requiresDownStack = () => {
        let accumulatedHeaderWidth = 0;
        for (let i = 0; i < state.cards.length; i++) {
          const card = state.cards[i];
          const minContent = resolvePxLength(card.config.minContentWidth, DEFAULT_MIN_CONTENT_SIZE);
          const maxAllowedWidth = containerWidth - accumulatedHeaderWidth;
          if (minContent > maxAllowedWidth + SIZE_EPSILON) {
            return true;
          }
          accumulatedHeaderWidth += card.rightStackHeaderWidth;
        }
        return false;
      };

      const viewportIsNarrow = viewportWidth < downThreshold;
      const containerIsNarrow = containerWidth < downThreshold;

      if (lastStackDirection === 'down') {
        const viewportIsWideEnough = viewportWidth > upThreshold;
        const containerIsWideEnough = containerWidth > upThreshold && !requiresDownStack();
        stackDirection = viewportIsWideEnough && containerIsWideEnough ? 'right' : 'down';
      } else {
        stackDirection = viewportIsNarrow || containerIsNarrow || requiresDownStack() ? 'down' : 'right';
      }
    }

    lastStackDirection = stackDirection;

    let offset = 0;
    let maxExtent = 0;

    const cardMaxWidths: number[] = [];
    if (stackDirection === 'right') {
      let accumulatedHeaderWidth = 0;
      for (let i = 0; i < state.cards.length; i++) {
        cardMaxWidths[i] = Math.max(0, containerWidth - accumulatedHeaderWidth);
        accumulatedHeaderWidth += state.cards[i].rightStackHeaderWidth;
      }
    }

    const computedCards: LayoutCard[] = state.cards.map((cardState, index) => {
      const { config } = cardState;
      const isRightStack = stackDirection === 'right';
      const headerSize = isRightStack ? cardState.rightStackHeaderWidth : cardState.downStackHeaderHeight;

      let mainSize: number;
      if (isRightStack) {
        const minContent = resolvePxLength(config.minContentWidth, DEFAULT_MIN_CONTENT_SIZE);
        const maxAllowedWidth = Math.max(0, cardMaxWidths[index] ?? containerWidth);
        let candidate = minContent;

        if (config.minContentWidth != null) {
          candidate = Math.max(candidate, resolvePxLength(config.minContentWidth, 0));
        }

        const resolvedMaxContent = config.maxContentWidth != null
          ? resolvePxLength(config.maxContentWidth, Infinity)
          : Infinity;

        if (Number.isFinite(resolvedMaxContent)) {
          candidate = Math.min(candidate, resolvedMaxContent);
        }

        if (index === state.cards.length - 1) {
          const stretchTarget = Math.min(maxAllowedWidth, resolvedMaxContent);
          candidate = Math.max(candidate, stretchTarget);
        }

        mainSize = Math.min(candidate, maxAllowedWidth);
      } else {
        const contentHeight = resolveContentHeightSize(config.contentHeight, {
          viewportHeight,
          fallback: DEFAULT_MIN_CONTENT_SIZE
        });
        mainSize = Math.min(contentHeight, containerHeight);
      }

      const collapsedSpan = headerSize;
      const activeMin = cardState.isFocused ? mainSize + activeBuffer : collapsedSpan;

      const style: Record<string, string> = {
        zIndex: String(cardState.zIndex)
      };

      if (isRightStack) {
        style.left = `${offset}px`;
        style.top = '0px';
        style.width = `${mainSize}px`;
        style.height = '100%';
      } else {
        style.left = '0px';
        style.top = `${offset}px`;
        style.width = '100%';
        style.height = `${mainSize}px`;
      }

      style['--panel-header-size'] = `${headerSize}px`;
      style['--panel-main-size'] = `${mainSize}px`;
      style['--panel-collapsed-main'] = `${collapsedSpan}px`;
      style['--panel-active-min'] = `${activeMin}px`;

      maxExtent = Math.max(maxExtent, offset + mainSize);
      offset += activeMin;

      return {
        ...cardState,
        activeMin,
        mainSpan: mainSize,
        style
      };
    });

    return {
      stackDirection,
      cards: computedCards,
      totalSpan: maxExtent,
      activeCardId: state.cards.find((card) => card.isFocused)?.id ?? initialActiveId
    };
  });

  function setViewport(width: number, height: number) {
    const normalizedWidth = width || (typeof window !== 'undefined' ? window.innerWidth : DEFAULT_VIEWPORT_WIDTH);
    const normalizedHeight = height || (typeof window !== 'undefined' ? window.innerHeight : DEFAULT_VIEWPORT_HEIGHT);

    if (hasSignificantChange(state.viewport.width, normalizedWidth, VIEWPORT_EPSILON)) {
      state.viewport.width = normalizedWidth;
    }

    if (hasSignificantChange(state.viewport.height, normalizedHeight, VIEWPORT_EPSILON)) {
      state.viewport.height = normalizedHeight;
    }
  }

  function setContainerSize(width: number, height: number) {
    if (isFiniteNumber(width) && width > 0 && hasSignificantChange(state.container.width, width, VIEWPORT_EPSILON)) {
      state.container.width = width;
    }
    if (isFiniteNumber(height) && height > 0 && hasSignificantChange(state.container.height, height, VIEWPORT_EPSILON)) {
      state.container.height = height;
    }
  }

  function setFocusedCard(id: string | null) {
    state.cards.forEach((card) => {
      card.isFocused = id ? card.id === id : false;
    });
  }

  function updateCardMetrics(id: string, width: number, height: number) {
    const card = state.cards.find((item) => item.id === id);
    if (!card) return;

    if (isFiniteNumber(width) && width > 0 && hasSignificantChange(card.contentWidth, width, CONTENT_EPSILON)) {
      card.contentWidth = width;
    }

    if (isFiniteNumber(height) && height > 0 && hasSignificantChange(card.contentHeight, height, CONTENT_EPSILON)) {
      card.contentHeight = height;
    }
  }

  function updateCardHeader(id: string, width: number, height: number) {
    const card = state.cards.find((item) => item.id === id);
    if (!card) return;

    if (isFiniteNumber(width) && width > 0) {
      const clamped = clamp(width, minHeader.horizontal, maxHeader.horizontal);
      if (hasSignificantChange(card.rightStackHeaderWidth, clamped, HEADER_EPSILON)) {
        card.rightStackHeaderWidth = clamped;
      }
    }

    if (isFiniteNumber(height) && height > 0) {
      const clamped = clamp(height, minHeader.vertical, maxHeader.vertical);
      if (hasSignificantChange(card.downStackHeaderHeight, clamped, HEADER_EPSILON)) {
        card.downStackHeaderHeight = clamped;
      }
    }
  }

  return {
    layout,
    setViewport,
    setContainerSize,
    setFocusedCard,
    updateCardMetrics,
    updateCardHeader
  };
}
