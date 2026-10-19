# Tau Editor

通用块式编辑器，包含内核、内置扩展、编辑器自身 UI、已编译 CSS 和必要资源。不读取发布清单、不加载内容插件产物，也不决定站点路由或预览。

```tsx
import { Editor } from "@tau/editor";
import "@tau/editor/styles.css";

<Editor initValue={nodes} readonly />
```

`initValue` 为初始值；切换内容时用新的 React key 建立实例。编辑时通过 `onChange` 取得正文。`extensions` 按节点类型覆盖本实例的默认扩展。默认组合不包含已插件化的 HTML、TikZ、Typst、ABC 和 custom-block。

`/api` 为扩展开发接口；`/contracts`、`/api/services`、`/api/paragraph` 和 `/markdown` 保持无界面用途。`/extensions/<功能>` 提供已使用的扩展入口，`/presets/standard` 保留各应用显式组合。高级应用可继续传入自己的 kit，默认组件不替换其服务与场景装配。

`/source-view` 提供编辑器源码预览组件，`/source` 提供块级/行内源码的通用渲染与操作，`/host-services` 提供通用平台能力契约，`/extensions/media/players` 提供音视频组件。`/ui` 提供编辑器和内容扩展共用的现有 UI 组件实现，供模板映射 C23 的共享模块，不包含应用业务。普通 Tau 插件仍从 `@tau/ui` 引用，由其运行环境注入对应实现。

发布构建：仓库根目录运行 `node scripts/editor/package-editor.mjs`。产物为一个 `@xiongtao.xt/tau-editor` 包，作者通过 npm 别名安装为 `@tau/editor`。内部 UI、主题、公共工具及源码预览的必要闭包随包交付，不需要作者安装内部工作区包。React/Slate/DnD 的共享版本见产物 peerDependencies。
