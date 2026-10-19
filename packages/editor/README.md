# Tau Editor

通用块式编辑器，包含内核、内置扩展、编辑器自身 UI、已编译 CSS 和必要资源。通用入口不读取发布协议；独立 `/renderer` 入口封装发布正文接入。页面、路由和外部预览界面由使用者决定。

```tsx
import { Editor } from "@tau/editor";
import "@tau/editor/styles.css";

<Editor initValue={nodes} readonly />
```

`initValue` 为初始值；切换内容时用新的 React key 建立实例。编辑时通过 `onChange` 取得正文。`extensions` 按节点类型覆盖本实例的默认扩展。默认组合不包含已插件化的 HTML、TikZ、Typst、ABC 和 custom-block。

发布正文使用同一个包的公开入口，不需要手动加载内容插件或接线：

```tsx
import { createClient, ContentRenderer } from "@tau/editor/renderer";
import "@tau/editor/styles.css";

const client = createClient({ manifestUrl: "/data/site.实际摘要.json" });
const content = await client.readData({ key: "实际正文的 key" });
<ContentRenderer content={content} />;
```

`content` 为 `readData` 的完整返回值。组件内部校验并加载插件和样式，按实例限制样式并在切换或卸载时清理；不改变插件贡献的渲染组件，不调用桌面生命周期。缺失插件按通用 Editor 的不可用节点行为显示。HTML 使用插件原有行为，不新增 iframe。高级页面可继续传入通用 `kit`、`initValue`、`extensions` 和外观参数；普通接入只需 `content`。

`/api` 为扩展开发接口；`/contracts`、`/api/services`、`/api/paragraph` 和 `/markdown` 保持无界面用途。`/extensions/<功能>` 提供已使用的扩展入口，`/presets/standard` 保留各应用显式组合。高级应用可继续传入自己的 kit，默认组件不替换其服务与场景装配。

`/source-view` 提供编辑器源码预览组件，`/source` 提供块级/行内源码的通用渲染与操作，`/host-services` 提供通用平台能力契约，`/extensions/media/players` 提供音视频组件。`/ui` 提供编辑器和内容扩展共用的现有 UI 组件实现，供模板映射 C23 的共享模块，不包含应用业务。普通 Tau 插件仍从 `@tau/ui` 引用，由其运行环境注入对应实现。

发布构建：仓库根目录运行 `node scripts/editor/package-editor.mjs`。产物为一个 `@xiongtao.xt/tau-editor` 包，作者通过 npm 别名安装为 `@tau/editor`。内部 UI、主题、公共工具及源码预览的必要闭包随包交付，不需要作者安装内部工作区包。React/Slate/DnD 的共享版本见产物 peerDependencies。
