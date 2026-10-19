# Tau Blog

博客模板的公共能力，包含数据读取、搜索、正文渲染和内容插件接入。根入口提供 createClient 和 ContentRenderer；模板负责自己的页面、Router、搜索界面、主题和预览布局。

```sh
pnpm add @tau/blog@npm:@xiongtao.xt/tau-blog@0.1.1
```

```tsx
import { createRoot } from "react-dom/client";
import { createClient, ContentRenderer } from "@tau/blog";
import "@tau/blog/styles.css";

async function main() {
  const client = createClient({ manifestUrl: "/data/site.实际摘要.json" });
  const content = await client.readData({ key: "实际正文的 key" });
  createRoot(document.getElementById("root")!).render(<ContentRenderer content={content} />);
}
void main();
```

ContentRenderer 直接接收 readData 的完整返回值，不需要模板拆解发布数据或手动加载插件。正文、预览和引用答案分别维护实例状态和加载清理。HTML 等内容原样使用实际插件；CSS 校验后按原文加载和卸载，不改写选择器或动画名，样式范围由内容插件自身定义。

ContentRenderer 的可选参数为 kit、initValue、extensions、onInit、className、style 和 fallback；未准备完成时默认不渲染内容，可传 fallback 自定等待界面。加载失败交给调用方的 React 错误边界。extensions 数组变化会重建编辑器，请传稳定的引用。

## 默认组合与需要自己装配的部分

不传 kit 时使用 `/editor` 的 defaultExtensions：段落、标题、列表、表格、引用、提示块、折叠块、标签页、代码块、Mermaid/PlantUML、数学公式、图片与图库、表情等通用节点都能直接显示；音视频使用原生 `<video>`/`<audio>`。以下内容需要模板自己装配：

| 内容                       | 不装配时             | 装配方式                                                                                                         |
| -------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 站内链接 `content-link`    | 显示为无法显示的占位 | 模板自写只读扩展：按 `ContentLinkNode` 的目标键解析并生成自己的 URL，规则见 SDK 的 PUBLISH-DATA.md               |
| 网页嵌入 `webview`         | 显示为无法显示的占位 | extensions 加 `webviewExtension`（`@tau/blog/editor`）                                                           |
| 源码块的预览菜单           | 无菜单               | kit 加 `previewMenuExtension`                                                                                    |
| 发布设置里的图片圆角/阴影  | 默认外观             | 用清单 `settings.appearance.image` 调 `createImageExtensions`（`@tau/blog/media`），建 kit 时传 `override: true` |
| 带倍速和标签的音视频播放器 | 原生播放器           | 注册 `IEditorSlots` 的 `VideoPlayer`/`AudioPlayer`                                                               |

```ts
import {
  createEditorKit,
  defaultExtensions,
  previewMenuExtension,
  webviewExtension,
} from "@tau/blog/editor";
import {
  createImageExtensions,
  IEditorSlots,
  createDefaultEditorSlots,
  VideoPlayer,
  AudioPlayer,
} from "@tau/blog/media";

const kit = createEditorKit({
  extensions: [
    ...defaultExtensions,
    previewMenuExtension,
    webviewExtension,
    ...createImageExtensions({ appearance: { borderRadius: "md", shadow: "none" } }),
  ],
  services: [
    register =>
      register(IEditorSlots, {
        ...createDefaultEditorSlots(),
        Video: VideoPlayer,
        Audio: AudioPlayer,
      }),
  ],
  override: true,
});
```

## 样式与主题

`styles.css` 的内容都在级联层里：主题变量在 `theme` 层，编辑器样式与它用到的工具类在 `components` 层。模板自己的 Tailwind 工具类可以覆盖编辑器样式，preflight 不会盖掉编辑器样式。

编辑器颜色取 `--tau-*` 变量。模板可以自己定义这些变量；也可以在 `<html>` 上写 `data-theme="paper" data-mode="light"`，使用包内的 Tau 主题取值（另有 ocean、mint、wisteria、sakura、ink）。

页面 Tooltip、toast、导航、主题及预览容器由模板选择或实现。本包不提供 UI 组件库出口，也不要求页面补齐 Provider；Editor 自身处理拖拽，浮层使用既有 Portal 作用域或默认挂载点。

## 公开入口

根入口、/editor、/media、/styles.css、/theme/tailwind.css 和 /theme/scale.css。/editor 提供通用 Editor、默认组合及正文扩展接口，/media 提供媒体外观和插槽定制；其他 Editor 内部子路径不公开，模板无需另装 Editor/SDK。React/Slate/DnD 使用声明的共享 peer 版本。

内容插件在浏览器里经 `new Function` 求值（求值前校验 SHA-256），站点如设置 CSP 需允许 `unsafe-eval`。PlantUML 图表由 plantuml.com 渲染，源码会发往该服务。

源码在 packages/blog，仓库根目录执行 `node scripts/blog/package-blog.mjs` 构建 npm 归档。
