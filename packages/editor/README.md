# Tau Editor

通用块式编辑器源码，包含内核、内置扩展、编辑器自身 UI 和样式。它不依赖发布 SDK 或博客渲染器；发布正文接入由独立 packages/blog 维护。

```tsx
import { Editor } from "@tau/editor";
import "@tau/editor/styles.css";

<Editor initValue={nodes} readonly />;
```

`initValue` 为初始值；切换内容时用新的 React key 建立实例。编辑时通过 `onChange` 取得正文。`extensions` 按节点类型覆盖本实例的默认扩展。默认组合不包含已插件化的 HTML、TikZ、Typst、ABC 和 custom-block。

嵌套编辑器默认继承父实例的 kit；需要独立默认组合时可传 inheritKit={false}，不影响显式传入的 kit。发布渲染器使用此通用选项隔离正文实例，编辑器不需要了解发布协议。

kit 只决定编辑器组合，不决定环境是否存在。默认与自定义 kit 都由 Editor 统一保证拖拽环境，复用外层拖拽实例；UI 原语使用已有 Portal 作用域或默认挂载点，Editor 不另外创建 UiProvider，调用方无需补线。

`/api` 为扩展开发接口；`/contracts`、`/api/services`、`/api/paragraph` 和 `/markdown` 保持无界面用途。`/extensions/<功能>` 提供已使用的扩展入口，`/presets/standard` 保留各应用显式组合。高级应用可继续传入自己的 kit，默认组件不替换其服务与场景装配。

`/source-view` 提供编辑器源码预览组件，`/source` 提供块级/行内源码的通用渲染与操作，`/host-services` 提供通用平台能力契约，`/extensions/media/players` 提供音视频组件。`/ui` 提供编辑器和扩展共用的 UI 组件，不包含应用业务。

各端继续通过工作区 @tau/editor 接入这份通用源码；对外博客渲染交付改由 scripts/blog/package-blog.mjs 构建一个 tau-blog 包。必要实现按依赖闭包随包交付，不复制源码，也不要求模板额外安装 Editor。已发布的 tau-editor 版本仅保留为历史交付。
