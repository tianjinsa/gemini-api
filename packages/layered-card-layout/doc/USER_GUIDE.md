# Vue Layered Layout - 使用文档

## 📦 安装

```bash
npm install vue-layered-layout
```

或者在 `package.json` 中使用本地路径:

```json
{
  "dependencies": {
    "vue-layered-layout": "file:../packages/layered-card-layout"
  }
}
```

## 🚀 快速开始

### 基础示例

```vue
<template>
  <LayeredLayoutContainer :groups="groups">
    <template #default="{ group }">
      <LayeredLayoutGroup v-bind="group">
        <template #default="{ card, layout, focus, updateMetrics }">
          <LayeredLayoutCard
            :card-id="card.id"
            :style="layout.style"
            :is-focused="layout.isFocused"
            @focus="focus"
            @update-metrics="updateMetrics"
          >
            <template #header>
              <h3>{{ card.id }}</h3>
            </template>
            <template #body>
              <p>这是 {{ card.id }} 的内容</p>
            </template>
          </LayeredLayoutCard>
        </template>
      </LayeredLayoutGroup>
    </template>
  </LayeredLayoutContainer>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import {
  LayeredLayoutContainer,
  LayeredLayoutGroup,
  LayeredLayoutCard,
  type CardGroupConfig
} from 'vue-layered-layout';
import 'vue-layered-layout/style.css';

const groups = ref<CardGroupConfig[]>([
  {
    id: 'main',
    cards: [
      { id: 'card-1' },
      { id: 'card-2', initialFocus: true },
      { id: 'card-3' }
    ]
  }
]);
</script>
```

## 📖 核心概念

### 1. 卡片组 (Card Group)

卡片组是独立的布局单元,每个组管理自己的卡片集合和布局状态。

```typescript
interface CardGroupConfig {
  id: string;                    // 唯一标识
  cards: CardConfig[];           // 卡片配置数组
  className?: string;            // 自定义 CSS 类名
  style?: Record<string, any>;   // 内联样式
  breakpoint?: number;           // 断点宽度 (默认: 960)
                                 // 说明：以像素为单位。当容器宽度小于该值时，布局会更倾向于“垂直/堆叠”模式；
                                 // 当容器宽度大于或等于该值时，会尝试使用“水平”布局（前提是所有卡片按其头部宽度 + 最小内容宽度能放下）。
                                 // 单位：number（px）。示例： breakpoint: 768 会在容器宽度 < 768px 时更早切换到竖向布局。
                                 // 用法提示：将其设置为很小的值可“禁用”提前切换；设置为较大值可强制更早切换。
  activeBuffer?: number;         // 激活缓冲 (默认: 20)
                                 // 说明：以像素为单位，用于在计算“聚焦/激活”卡片是否有足够空间展开时增加的额外缓冲区。
                                 // 在水平布局中，当某个卡片被聚焦需要扩展到其激活尺寸时，系统会检查剩余可用空间是否 >= 需要的扩展空间 + activeBuffer。
                                 // 增大该值会使卡片更难进入“激活/展开”状态（需要更多可用空间）；设为 0 表示不使用缓冲。
                                 // 单位：number（px）。示例： activeBuffer: 30 表示需要额外 30px 的缓冲空间才能允许聚焦卡片扩展。
}
```

### 2. 卡片配置 (Card Config)

```typescript
interface CardConfig {
  id: string;
  minContentWidth?: number | `${number}px`;   // 最小内容区宽度(默认: 500)
  maxContentWidth?: number | `${number}px`;   // 最大内容区宽度
  contentHeight?: number | `${number}px` | `${number}vh`; // 垂直布局内容高度(默认: 500)
  initialFocus?: boolean;        // 是否在初始化时聚焦
  rightStackHeaderWidth?: number;   // 水平布局下的头部宽度(px)
  downStackHeaderHeight?: number;   // 垂直布局下的头部高度(px)
  zIndex?: number;               // 层级控制
}

// ⚠️ 单位规则提示
// - minContentWidth / maxContentWidth 仅支持像素(number 或 '600px')
// - contentHeight 支持像素(number 或 '500px')，以及基于视口高度的 '80vh'
// - 不再支持百分比或 vw 单位
type CSSSize = number | string;

> 使用 `vh` 时请确保在窗口尺寸变化时调用 `setViewport(width, height)`（库的容器组件已内置监听）。布局会根据最新的视口高度重新计算卡片的展开高度。
```

### 3. 布局方向

布局方向**自动**根据容器宽度决定:

- **水平布局**: 当容器宽度 ≥ 所有卡片的 `(headerWidth + minContentWidth)` 之和
- **垂直布局**: 当容器宽度 < 所需最小宽度时

## 📘 使用案例

### 案例 1: 单卡片组 - 基础用法

```vue
<script setup lang="ts">
const groups = ref([
  {
    id: 'dashboard',
    cards: [
      { 
        id: 'users', 
        minContentWidth: 400,
        initialFocus: true 
      },
      { 
        id: 'stats', 
        minContentWidth: 500 
      },
      { 
        id: 'logs', 
        minContentWidth: 600,
        maxContentWidth: 800
      }
    ]
  }
]);
</script>
```

### 案例 2: 多卡片组 - 不同区域

```vue
<template>
  <LayeredLayoutContainer :groups="groups">
    <template #default="{ group }">
      <LayeredLayoutGroup 
        v-bind="group"
        :class="group.className"
      >
        <template #default="{ card, layout, focus, updateMetrics }">
          <LayeredLayoutCard
            :card-id="card.id"
            :style="layout.style"
            :is-focused="layout.isFocused"
            @focus="focus"
            @update-metrics="updateMetrics"
          >
            <template #header>
              <div class="card-header">
                {{ card.id }}
              </div>
            </template>
            <template #body>
              <div class="card-body">
                <!-- 根据 card.id 渲染不同内容 -->
                <component :is="getComponent(card.id)" />
              </div>
            </template>
          </LayeredLayoutCard>
        </template>
      </LayeredLayoutGroup>
    </template>
  </LayeredLayoutContainer>
</template>

<script setup lang="ts">
const groups = ref([
  {
    id: 'top-section',
    className: 'top-panels',
    style: { 
      borderBottom: '2px solid #e0e0e0',
      paddingBottom: '10px'
    },
    cards: [
      { id: 'overview', minContentWidth: 500 },
      { id: 'metrics', minContentWidth: 600 }
    ]
  },
  {
    id: 'bottom-section',
    className: 'bottom-panels',
    breakpoint: 768,  // 更早切换到移动端
    activeBuffer: 30, // 更大的激活缓冲
    cards: [
      { id: 'details', minContentWidth: 700 },
      { id: 'history', minContentWidth: 600 }
    ]
  }
]);
</script>

<style scoped>
.top-panels {
  background: #f5f5f5;
}

.bottom-panels {
  background: #fafafa;
}
</style>
```

### 案例 3: 使用 CSS 单位

```vue
<script setup lang="ts">
const groups = ref([
  {
    id: 'responsive',
    cards: [
      { 
        id: 'sidebar', 
        minContentWidth: 320,      // 像素值
        maxContentWidth: '400px'   // 字符串形式像素
      },
      { 
        id: 'main', 
        minContentWidth: 640,      // 像素值
        contentHeight: '80vh'      // 视口高度的 80%
      },
      { 
        id: 'aside', 
        minContentWidth: 300        // 纯数字默认为 px
      }
    ]
  }
]);
</script>
```

### 案例 4: 自定义头部尺寸

```vue
<script setup lang="ts">
const groups = ref([
  {
    id: 'custom-headers',
    cards: [
      { 
        id: 'narrow', 
        headerWidth: 50,     // 窄头部
        minContentWidth: 400 
      },
      { 
        id: 'normal', 
        headerWidth: 72,     // 默认头部
        minContentWidth: 500 
      },
      { 
        id: 'wide', 
        headerWidth: 120,    // 宽头部
        minContentWidth: 600 
      }
    ]
  }
]);
</script>
```

### 案例 5: 动态添加/删除卡片

```vue
<script setup lang="ts">
const groups = ref([
  {
    id: 'dynamic',
    cards: [
      { id: 'card-1' },
      { id: 'card-2' }
    ]
  }
]);

function addCard() {
  const newId = `card-${groups.value[0].cards.length + 1}`;
  groups.value[0].cards.push({
    id: newId,
    minContentWidth: 500,
    initialFocus: true  // 新卡片自动聚焦
  });
}

function removeCard(id: string) {
  const index = groups.value[0].cards.findIndex(c => c.id === id);
  if (index !== -1) {
    groups.value[0].cards.splice(index, 1);
  }
}
</script>
```

## 🎨 样式定制

### CSS 变量

组件暴露以下 CSS 变量可供覆盖:

```css
.vl-layered-group {
  --vl-total-span: /* 计算的总跨度 */;
}

.vl-layered-card {
  --panel-header-size: /* 头部尺寸 */;
  --panel-main-size: /* 主体尺寸 */;
  --panel-collapsed-main: /* 折叠尺寸 */;
  --panel-active-min: /* 激活最小尺寸 */;
}
```

### 自定义卡片样式

```vue
<style scoped>
:deep(.vl-layered-card) {
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  transition: all 0.3s ease;
}

:deep(.vl-layered-card.is-focused) {
  box-shadow: 0 4px 16px rgba(0,0,0,0.2);
  transform: translateY(-2px);
}

:deep(.vl-card-header) {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 16px;
  cursor: pointer;
}

:deep(.vl-card-body) {
  background: white;
  padding: 20px;
  overflow-y: auto;
}
</style>
```

## 📚 API 参考

### LayeredLayoutContainer

**Props:**

- `groups: CardGroupConfig[]` - 卡片组配置数组

**Slots:**

- `default` - 接收 `{ group: CardGroupConfig }` 作为插槽 props

### LayeredLayoutGroup

**Props:**

- 继承 `CardGroupConfig` 的所有属性

**Slots:**

- `default` - 接收以下插槽 props:
  - `card: CardConfig` - 卡片配置
  - `layout: LayoutCard` - 布局信息
  - `focus: () => void` - 聚焦函数
  - `updateMetrics: (w: number, h: number) => void` - 更新尺寸

### LayeredLayoutCard

**Props:**

- `cardId: string` - 卡片 ID
- `style: Record<string, any>` - 样式对象
- `isFocused: boolean` - 是否聚焦

**Events:**

- `@focus` - 点击头部时触发
- `@update-metrics` - 尺寸变化时触发

**Slots:**

- `header` - 头部内容
- `body` - 主体内容

## 🔧 高级用法

### 与状态管理集成

```typescript
// store/panels.ts
import { defineStore } from 'pinia';

export const usePanelStore = defineStore('panels', {
  state: () => ({
    groups: [
      {
        id: 'main',
        cards: [
          { id: 'panel-1', initialFocus: true },
          { id: 'panel-2' }
        ]
      }
    ] as CardGroupConfig[]
  }),
  
  actions: {
    addPanel(groupId: string, panelConfig: CardConfig) {
      const group = this.groups.find(g => g.id === groupId);
      if (group) {
        group.cards.push(panelConfig);
      }
    },
    
    removePanel(groupId: string, panelId: string) {
      const group = this.groups.find(g => g.id === groupId);
      if (group) {
        const index = group.cards.findIndex(c => c.id === panelId);
        if (index !== -1) {
          group.cards.splice(index, 1);
        }
      }
    }
  }
});
```

### 响应式内容

```vue
<template>
  <LayeredLayoutCard>
    <template #body>
      <div ref="contentRef" class="dynamic-content">
        <!-- 内容会自动触发 ResizeObserver -->
        <component :is="currentView" />
      </div>
    </template>
  </LayeredLayoutCard>
</template>
```

## ⚠️ 注意事项

1. **必须导入样式**: 记得导入 `'vue-layered-layout/style.css'`
2. **唯一 ID**: 确保每个卡片的 `id` 在组内唯一
3. **最小尺寸**: `minContentWidth` 默认为 500px, `contentHeight` 默认为 500px
4. **容器尺寸**: 确保父容器有明确的宽高,否则布局可能异常
5. **CSS 单位**: `minContentWidth/maxContentWidth` 仅支持像素值; `contentHeight` 可使用像素或 `vh`

## 🐛 常见问题

### Q: 卡片不显示或布局异常?

A: 检查:

1. 是否导入了样式文件
2. 父容器是否有明确的 width/height
3. 卡片 ID 是否唯一

### Q: 如何禁用自动布局切换?

A: 设置一个很小的 breakpoint,或者将所有卡片的 minContentWidth 设置得很小,使其始终能放下。

### Q: 如何实现卡片的拖拽排序?

A: 库本身不提供拖拽功能,但可以配合 `vue-draggable` 等库,在 `cards` 数组上实现排序。

## 📄 许可证

MIT
