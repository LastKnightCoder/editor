# 桌面插件窗口开发

用 `definePlugin({ windows })` 声明窗口。主窗口用 `context.windows.open()` 打开，窗口组件通过 `PluginWindowProps` 接收参数、关闭函数、生命周期和通信接口。能力仅在提供窗口宿主的桌面前台可用，调用前检查 `context.windows`。

## 声明窗口与样式

```tsx
import { definePlugin, type PluginWindowProps } from "@tau/plugins";

function Preview({ params }: PluginWindowProps) {
  return (
    <article className="preview">
      <h2>{String(params.title ?? "预览")}</h2>
    </article>
  );
}

export default definePlugin({
  id: "example.preview",
  name: "预览",
  version: "1.0.0",
  windows: [
    {
      id: "preview",
      title: "预览",
      options: { kind: "normal", width: 720, height: 480 },
      component: Preview,
    },
  ],
  create: () => ({
    activate(context) {
      context.commands.register({
        id: "open-preview",
        title: "打开预览",
        async run() {
          await context.windows?.open("preview", { title: "预览" });
          return null;
        },
      });
    },
  }),
});
```

`open` 从用户点击或按键触发。参数接受字符串、有限数字和布尔值。重复打开同一 ID 会聚焦已有窗口并整体更新参数。返回的句柄可关闭本次物理实例。普通窗使用系统标题栏，小窗用 `kind: "compact"` 和固定尺寸，可声明 `alwaysOnTop`。全屏用 `kind: "fullscreen"`。

宿主在组件挂载前设置主题和字体，偏好变化时自动更新。通常直接使用 `@tau/ui` 或消费语义变量。以下 CSS 会跟随窗口外观，作者无需读取设置或绑定事件。

```css
.preview {
  background: var(--tau-bg-page);
  color: var(--tau-ink-1);
  font: var(--tau-text-body) var(--tau-font);
}
```

使用 Tailwind 的插件沿用现有构建流程，通过 `@tau/plugins/tailwind.css` 将带插件前缀的语义类编译进包内 CSS。宿主提供这些类所消费的 token。需要固定深色的窗口可声明 `theme: "dark"`，主题族和字体继续跟随用户偏好。画布等自绘内容可以用 `system.get("system.appearance")` 读取生效值，或用 `system.subscribe("system.appearance", listener)` 监听后续更新。

## 状态和即时消息

主窗口通过 `context.windows.communication`，独立窗口通过 `props.communication` 使用同一接口。两者按插件和工作区隔离。插件定义键、消息名和 JSON 数据结构，`system.` 前缀由宿主保留。

| 接口                                   | 行为                                                                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `state.get(key)`                       | 获取当前值。未设置返回 `undefined`。                                                                                               |
| `state.set(key, value)`                | 整体写入 JSON 值。状态随插件工作区会话保留，可被后来打开的窗口读取。                                                               |
| `state.subscribe(key, listener)`       | 首次回调交付当前值，之后接收变化。返回可释放的订阅。                                                                               |
| `messages.on(name, listener)`          | 接收上线后的即时消息。回调收到载荷和发送窗口类型。                                                                                 |
| `messages.send(name, payload, target)` | `"main"` 发给其他在线主窗口端点，`"all"` 发给同插件的其他在线端点，`{ windowId }` 定向发送。返回提交投递的数量，无在线目标返回 0。 |

组件卸载可主动释放订阅和监听，宿主在停用、切库或窗口关闭时统一清理。即时消息无历史回放。需要跨应用重启保留的数据走现有插件存储。模块与时序见[桌面插件窗口架构](/docs/architecture/desktop.md#桌面插件窗口)及[通信图](/docs/architecture/plugin-windows.html)。
