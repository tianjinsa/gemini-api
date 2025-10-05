export type LayoutMode = 'right-stack' | 'down-stack';
export type StackDirection = 'right' | 'down';

export type CSSSize = number | string;

export interface CardConfig {
  id: string;
  /**
  * Minimum width required to display the card body content (used in right-stack mode).
  * Accepts pixel numbers or pixel strings such as `600` or `'600px'`.
   * @default 500
   */
  minContentWidth?: CSSSize;
  /**
   * Maximum width the card should expand to in right-stack mode.
  * Accepts pixel numbers or pixel strings such as `960` or `'960px'`.
   */
  maxContentWidth?: CSSSize;
  /**
   * Content height for down-stack mode.
  * Accepts pixel numbers, pixel strings, or viewport-height strings such as `'80vh'`.
   * @default 500
   */
  contentHeight?: CSSSize;
  /**
   * Whether the card should be focused when the layout initializes.
   */
  initialFocus?: boolean;
  /**
   * Custom header width for right-stack layout (desktop mode) in pixels.
   * If not provided, will use measured value from ResizeObserver.
   */
  rightStackHeaderWidth?: number;
  /**
   * Custom header height for down-stack layout (mobile mode) in pixels.
   * If not provided, will use measured value from ResizeObserver.
   */
  downStackHeaderHeight?: number;
  /**
   * Optional explicit z-index ordering for the stacked layout.
   */
  zIndex?: number;
}

/**
 * Configuration for a card group. Each group can have its own styling and layout configuration.
 */
export interface CardGroupConfig {
  /**
   * Unique identifier for the card group
   */
  id: string;
  /**
   * Cards in this group
   */
  cards: CardConfig[];
  /**
   * Optional CSS class name for the group container
   */
  className?: string;
  /**
   * Optional inline styles for the group container
   */
  style?: Record<string, string | number>;
  /**
   * Default stack direction
   * @default 'right'
   */
  defaultStackDirection?: StackDirection;
  /**
   * Whether to allow automatic switching of stack direction when width is insufficient
   * @default true
   */
  autoSwitchDirection?: boolean;
  /**
   * Breakpoint width (in pixels) for automatically switching between right-stack and down-stack modes
   * When viewport width is less than this value, it will switch to down-stack mode
   * @default 960
   */
  breakpointWidth?: number;
  /**
   * Additional spacing in pixels when a card is active/focused.
   * @default 20
   */
  activeBuffer?: number;
}

export interface HeaderSize {
  width: number;
  height: number;
}

export interface CardLayout {
  id: string;
  isFocused: boolean;
  isExpanded: boolean;
  collapsedSize: number;
  expandedSize: number;
  headerSize: HeaderSize;
  style: Record<string, string | number>;
}
