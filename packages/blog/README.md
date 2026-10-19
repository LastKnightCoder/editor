# Tau Blog

博客模板的公共能力，包含数据读取、搜索、正文渲染和内容插件接入。根入口提供 createClient 和 ContentRenderer；模板负责自己的页面、Router、搜索界面、主题和预览布局。

```sh
pnpm add @tau/blog@npm:@xiongtao.xt/tau-blog@0.1.0
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

源码在 packages/blog，依赖 packages/editor 的通用公开能力和数据 SDK。必要的 Editor、内部 UI、字体及类型闭包随此包交付，模板只安装这一个渲染包。React/Slate/DnD 使用声明的共享 peer 版本。

公开入口只有根入口、/editor、/media、/styles.css、/theme/tailwind.css 和 /theme/scale.css。/editor 提供已使用的通用 Editor、默认组合及正文扩展接口，/media 提供媒体外观和插槽定制；其他 Editor 内部子路径不自动公开，模板无需另装 Editor/SDK。

ContentRenderer 的可选参数为 kit、initValue、extensions、onInit、className、style 和 fallback；未准备完成时默认不渲染内容，可传 fallback 自定等待界面。加载失败交给调用方的 React 错误边界；两个模板的 Content 组件只维护这部分展示，不包含加载协议。

页面 Tooltip、toast、导航、主题及预览容器由模板选择或实现。本包不提供 UI 组件库出口，也不要求页面补齐 Provider；Editor 自身处理拖拽，浮层使用既有 Portal 作用域或默认挂载点。

仓库根目录执行 node scripts/blog/package-blog.mjs 构建 npm 归档。此前已发布的 tau-editor 版本作为历史版本保留，这份交付使用 tau-blog 名称。
