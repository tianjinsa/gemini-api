# vue-layered-layout

一个面向 Vue 3 的响应式层叠布局组件库，提供灵活的卡片堆叠布局系统，支持向右堆叠和向下堆叠两种模式的自动切换。

## 特性

- **双向堆叠布局**：支持向右堆叠（right-stack）和向下堆叠（down-stack）两种布局模式
- **智能自动切换**：根据容器宽度和viewport宽度自动切换堆叠方式  
- **双头部支持**：每张卡片可同时配置水平头部和垂直头部，组件自动选择显示
- **自动断点计算**：可选的breakpointWidth，未提供时自动根据卡片配置计算
- **TypeScript** - 完整的类型定义
- **高性能** - 使用 ResizeObserver 实现高效的尺寸监听
- **非侵入式** - 纯布局原语，不强制特定 UI 风格

## 安装

```bash
npm install vue-layered-layout
```

## 更多文档

- [使用指南](./doc/USER_GUIDE.md) - 完整的使用指南和示例
- [技术规格书](./doc/技术规格书.md) - 详细的技术规格和设计文档
- [更新日志](./CHANGELOG.md) - 版本更新历史

## 许可证

MIT License  2025-present
