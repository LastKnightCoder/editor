# 自定义组件块

在文档中嵌入可交互的 React 组件，用来演示 CSS / DOM / Canvas 效果，或做一个能直接操作的小工具。组件会跟随应用主题切换明暗与配色。

## 插入与编辑

1. 在正文空行输入 `/`，或打开块菜单，搜索「React 组件」（也可搜「组件」「自定义」）插入空白组件。
2. 新块自动进入源码编辑，修改后下方实时预览；编写完成点击「完成」退出编辑。
3. 鼠标悬停在组件上，右上角操作条提供「编辑」「全屏」「删除」；全屏模式可缩放预览、收起或显示源码，按 `Esc` 关闭。
4. 源码有语法或运行错误时，预览下方显示错误信息，修正后自动恢复。

## 编写组件

源码是一段 TSX，必须声明名为 `Component` 的无参组件，不写 `import` / `export`：

```jsx
const { useState } = React;

const Component = () => {
  const [count, setCount] = useState(0);
  return (
    <div className="flex items-center gap-3">
      <ui.Button variant="secondary" size="sm" onClick={() => setCount(c => c + 1)}>
        点击 +1
      </ui.Button>
      <span className="text-tau-body text-ink-2">已点击 {count} 次</span>
    </div>
  );
};
```

可直接使用以下绑定：

| 绑定          | 用途                                                                             |
| ------------- | -------------------------------------------------------------------------------- |
| `React`       | hooks 从这里解构，如 `const { useState, useEffect } = React`                     |
| `ui`          | 应用设计系统控件：`Button`、`Input`、`Switch`、`Select`、`Tooltip`、`Popover` 等 |
| `icons`       | lucide 图标，如 `<icons.Copy className="size-4" />`                              |
| `toast`       | 轻提示，如 `toast.success("已复制")`                                             |
| `useTokens()` | 取当前主题实际色值，供 Canvas、SVG 使用：`useTokens().color("accent")`           |

样式要点：

- 优先用 Tailwind 类名，类名需完整写在源码里，不要拼接字符串（`bg-tag-${i}` 不会生效）。
- 颜色使用主题语义类（`text-ink-1`、`border-line-1`、`bg-accent-soft` 等），这样切换主题时组件自动适配；不要写死 hex 或 `bg-blue-500` 这类调色板颜色。
- Tailwind 写不了的样式放在块内 `<style>`，并包在 `@scope { }` 中，避免影响页面其他部分。
- 组件会因编辑、滚动、切换主题反复挂载，定时器、事件监听、`ResizeObserver` 记得在 effect 清理函数中释放。
- 组件内不能发起网络请求，也不能读写 `localStorage` 或块外的 DOM。

## 让 AI 帮你写

启用插件后，Skill 页面会多出「自定义组件块」。在对话里让 AI 做一个交互演示，它会按这份规范写出组件；完整的编写规范也可以在 Skill 页面查看。

## 导入导出

组件在 Markdown 中保存为 `custom-block` 代码块，导出、复制和再导入都会保留完整源码。

## 小提醒

- 需要 Tau 0.59.0 或更高版本。
- 启用或停用插件后，重启应用才会生效。停用期间，文档里的组件不会丢失，重新启用后照常显示。
