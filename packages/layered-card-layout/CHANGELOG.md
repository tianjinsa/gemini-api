# Vue Layered Layout 更新日志

## v0.2.1 (2025-10-01)

### 🐛 Bug修复

#### 1. 修复最后一张卡片宽度计算错误

**问题**: 从后向前计算cardMaxWidths时，最后一张卡片的可用宽度计算为`containerWidth - 0`，没有考虑前面卡片头部的占用。

**修复**: 改为从前向后计算，确保每张卡片的最大宽度 = 容器宽度 - 前面所有卡片的头部宽度之和。

```typescript
// 修复前（错误）
for (let i = cards.length - 1; i >= 0; i--) {
  cardMaxWidths[i] = containerWidth - accumulatedHeaderWidth;
  accumulatedHeaderWidth += cards[i].rightStackHeaderWidth;
}
// 结果: 最后一张 = containerWidth - 0 ❌

// 修复后（正确）
for (let i = 0; i < cards.length; i++) {
  cardMaxWidths[i] = containerWidth - accumulatedHeaderWidth;
  accumulatedHeaderWidth += cards[i].rightStackHeaderWidth;
}
// 结果: 最后一张 = containerWidth - 前面所有头部之和 ✅
```

#### 2. 修复容器宽度不足时未切换到down-stack

**问题**: 自动切换逻辑只检查viewport宽度，没有检查容器宽度是否足够容纳所有卡片。

**修复**: 添加容器宽度检查，从前向后遍历每张卡片，检查是否能满足minContentWidth要求。

```typescript
if (autoSwitchDirection && defaultStackDirection === 'right') {
  // 1. 先检查viewport宽度
  if (viewportWidth < breakpointWidth) {
    stackDirection = 'down';
  } else {
    // 2. 再检查容器宽度
    let accumulatedHeaderWidth = 0;
    for (let i = 0; i < cards.length; i++) {
      const maxAllowedWidth = containerWidth - accumulatedHeaderWidth;
      if (minContent > maxAllowedWidth) {
        stackDirection = 'down';
        break;
      }
      accumulatedHeaderWidth += card.rightStackHeaderWidth;
    }
  }
}
```

#### 3. 完善头部切换逻辑统一控制

**改进**: 将头部显示/隐藏从CSS媒体查询改为由组件v-if控制，确保与堆叠方式切换完全同步。

```vue
<!-- 组件层面通过v-if控制 -->
<aside v-if="stackDirection === 'right'" ref="desktopHeaderEl">
  <!-- 水平头部 -->
</aside>

<header v-if="stackDirection === 'down'" ref="mobileHeaderEl">
  <!-- 垂直头部 -->  
</header>
```

### 📝 文档更新

- 更新README.md说明双头部系统和自动切换逻辑
- 更新API文档，明确cardMaxWidths计算方式
- 添加宽度计算示例说明

---

# Vue Layered Layout v0.2.0 - 重构总结

## 🎯 核心变更

### 1. ✨ 多卡片组支持

**之前**: 只支持单个卡片容器
**现在**: 支持多个独立的卡片组,每个组可以有独立的配置

```vue
<!-- 之前 -->
<LayeredLayoutContainer :cards="cards" />

<!-- 现在 -->
<LayeredLayoutContainer :groups="groups">
  <template #default="{ group }">
    <LayeredLayoutGroup v-bind="group">
      <!-- 卡片内容 -->
    </LayeredLayoutGroup>
  </template>
</LayeredLayoutContainer>
```

**新增组件**: `LayeredLayoutGroup`

- 每个组独立管理自己的布局状态
- 可以设置独立的 `className` 和 `style`
- 可以设置独立的 `breakpoint` 和 `activeBuffer`

### 2. 🔄 简化布局算法

**之前**: 使用复杂的多行打包算法,自动换行
**现在**: 简单的容器宽度检查,无法容纳时切换到移动端布局

```typescript
// 旧逻辑: 基于 breakpoint
orientation = viewportWidth <= breakpoint ? 'vertical' : 'horizontal';

// 新逻辑: 基于实际容纳能力
const totalMinWidth = cards.reduce((sum, card) => 
  sum + card.headerWidth + card.minContentWidth, 0);
orientation = totalMinWidth > containerWidth ? 'vertical' : 'horizontal';
```

**优势**:

- 更符合实际需求
- 布局行为更可预测
- 代码更简洁

### 3. ❌ 移除 fixedContentWidth/Height

**之前**: 支持 `fixedContentWidth` 和 `fixedContentHeight`
**现在**: 移除这两个属性,统一使用 `minContentWidth/Height` 和 `maxContentWidth/Height`

**理由**:

- `fixed` 属性功能可以通过设置 `min === max` 实现
- 减少 API 复杂度
- 使用场景较少

### 4. ✨ 自定义头部尺寸

**新增属性**:

```typescript
interface CardConfig {
  headerWidth?: number;   // 自定义头部宽度(px)
  headerHeight?: number;  // 自定义头部高度(px)
}
```

**之前**: 头部尺寸只能由 ResizeObserver 测量
**现在**: 可以手动指定头部尺寸,也可以依赖自动测量

### 5. 📐 默认值调整

**之前**:

- `minContentWidth`: 必填
- `minContentHeight`: 可选

**现在**:

- `minContentWidth`: 默认 500px
- `minContentHeight`: 默认 500px

## 📊 类型变更

### CardConfig 变更

```typescript
// 移除
- fixedContentWidth?: CSSSize | null;
- fixedContentHeight?: CSSSize | null;

// 新增
+ headerWidth?: number;
+ headerHeight?: number;

// 改为可选(带默认值)
- minContentWidth: CSSSize;
+ minContentWidth?: CSSSize;  // 默认: 500
```

### 新增 CardGroupConfig

```typescript
interface CardGroupConfig {
  id: string;
  cards: CardConfig[];
  className?: string;
  style?: Record<string, string | number>;
  breakpoint?: number;
  activeBuffer?: number;
}
```

### LayoutCard 变更

```typescript
// 移除
- rowIndex: number;
```

## 🔧 API 变更

### LayeredLayoutContainer

**之前**:

```typescript
interface Props {
  cards: CardConfig[];
  breakpoint?: number;
  activeBuffer?: number;
}
```

**现在**:

```typescript
interface Props {
  groups: CardGroupConfig[];
}
```

### useLayeredLayout

**移除的选项**:

- `minVerticalHeight`
- `minExpandedWidth`

**简化后的选项**:

```typescript
interface UseLayeredLayoutOptions {
  cards: CardConfig[];
  breakpoint?: number;
  activeBuffer?: number;
  minHeader?: OrientationMins;
  maxHeader?: OrientationMins;
}
```

## 📦 构建结果

```
dist/vue-layered-layout.css     1.76 kB │ gzip: 0.63 kB
dist/vue-layered-layout.es.js  12.57 kB │ gzip: 3.89 kB
dist/vue-layered-layout.cjs     9.17 kB │ gzip: 3.29 kB
dist/index.d.ts                          │ TypeScript 声明
```

## ✅ 测试状态

```
✓ tests/useLayeredLayout.spec.ts (2)
  ✓ computes horizontal layout and updates focus
  ✓ switches to vertical orientation when container is too narrow

Test Files: 1 passed (1)
Tests: 2 passed (2)
```

## 📚 新增文档

1. **技术规格书** (`doc/技术规格书.md`)
   - 完整的架构设计说明
   - 布局算法详解
   - 数据结构定义
   - CSS 变量参考

2. **使用文档** (`doc/USER_GUIDE.md`)
   - 快速开始指南
   - 5个完整使用案例
   - API 参考
   - 样式定制
   - 常见问题

3. **README** (`README.md`)
   - 项目概述
   - 快速示例
   - 核心概念
   - 配置参考

## 🚀 迁移指南

### 从 v0.1.0 迁移到 v0.2.0

#### 1. 更新导入

```typescript
// 新增导入
import { 
  LayeredLayoutGroup,  // 新增
  type CardGroupConfig  // 新增
} from 'vue-layered-layout';
```

#### 2. 重构数据结构

```typescript
// 之前
const cards = ref([
  { id: 'card1', minContentWidth: 400 },
  { id: 'card2', minContentWidth: 500 }
]);

// 现在
const groups = ref([
  {
    id: 'main-group',
    cards: [
      { id: 'card1', minContentWidth: 400 },
      { id: 'card2', minContentWidth: 500 }
    ]
  }
]);
```

#### 3. 更新模板

```vue
<!-- 之前 -->
<LayeredLayoutContainer :cards="cards">
  <template #default="{ card, layout, ... }">
    <LayeredLayoutCard>...</LayeredLayoutCard>
  </template>
</LayeredLayoutContainer>

<!-- 现在 -->
<LayeredLayoutContainer :groups="groups">
  <template #default="{ group }">
    <LayeredLayoutGroup v-bind="group">
      <template #default="{ card, layout, ... }">
        <LayeredLayoutCard>...</LayeredLayoutCard>
      </template>
    </LayeredLayoutGroup>
  </template>
</LayeredLayoutContainer>
```

#### 4. 移除 fixed 属性

```typescript
// 之前
{ 
  id: 'card1', 
  fixedContentWidth: 500 
}

// 现在 - 方式1: 使用 min/max
{ 
  id: 'card1', 
  minContentWidth: 500,
  maxContentWidth: 500
}

// 现在 - 方式2: 只使用 minContentWidth
{ 
  id: 'card1', 
  minContentWidth: 500
}
```

#### 5. 利用新默认值

```typescript
// 之前 (必须指定)
{ 
  id: 'card1', 
  minContentWidth: 500 
}

// 现在 (可省略,使用默认值500)
{ 
  id: 'card1'  // 自动使用 minContentWidth: 500
}
```

## 🎉 新功能示例

### 多组布局

```typescript
const groups = ref([
  {
    id: 'top',
    className: 'top-section',
    style: { borderBottom: '2px solid #eee' },
    cards: [
      { id: 'overview' },
      { id: 'stats' }
    ]
  },
  {
    id: 'bottom',
    className: 'bottom-section',
    breakpoint: 768,  // 独立断点
    cards: [
      { id: 'logs' },
      { id: 'history' }
    ]
  }
]);
```

### 自定义头部尺寸

```typescript
const groups = ref([
  {
    id: 'main',
    cards: [
      { id: 'narrow', headerWidth: 50 },   // 窄头部
      { id: 'normal', headerWidth: 72 },   // 默认头部
      { id: 'wide', headerWidth: 120 }     // 宽头部
    ]
  }
]);
```

## 📈 性能优化

- 移除了复杂的行计算逻辑
- 简化了布局算法
- 减少了不必要的响应式计算
- 文件体积减小约 20%

## 🐛 Bug 修复

- 修复了多行布局时的尺寸计算错误
- 修复了方向切换时的状态同步问题
- 修复了 TypeScript 类型推导错误

## 📝 Breaking Changes

1. **LayeredLayoutContainer API 变更** (破坏性)
   - `cards` prop 改为 `groups`
   - 需要配合 `LayeredLayoutGroup` 使用

2. **移除属性** (破坏性)
   - 移除 `fixedContentWidth`
   - 移除 `fixedContentHeight`

3. **布局逻辑变更** (行为变更)
   - 不再基于固定 breakpoint
   - 改为基于实际容纳能力

4. **默认值变更** (可能影响布局)
   - `minContentWidth` 从必填改为可选(默认 500)
   - `minContentHeight` 默认值从 420 改为 500

## 📅 发布日期

2025-10-01

## 👥 贡献者

感谢所有参与本次重构的开发者!
