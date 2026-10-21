# Tau Blog

博客模板的公共能力：数据读取、搜索和发布正文渲染。模板负责自己的页面、路由、搜索界面、主题和预览布局；正文怎么显示由本包负责，模板不需要了解编辑器、节点类型或宿主设置。

```sh
pnpm add @tau/blog@npm:@xiongtao.xt/tau-blog@0.4.0
```

`project-card-list` 保留项目内的网格卡片、图标、标题、两行摘要及悬停样式，整张卡片通过 `hrefFor` 跳转到对应文档；无需模板注册扩展。

```tsx
import { createRoot } from "react-dom/client";
import { createClient, ContentRenderer } from "@tau/blog";
import "@tau/blog/styles.css";

async function main() {
  const client = createClient({ manifestUrl: "/data/site.实际摘要.json" });
  const content = await client.readData({ key: "实际正文的 key" });
  createRoot(document.getElementById("root")!).render(
    <ContentRenderer content={content} hrefFor={target => `/?content=${target.key}`} />
  );
}
void main();
```

## ContentRenderer

宿主能发布的内容都会完整显示：内置节点、内容插件、网页嵌入、源码预览、音视频播放器、发布设置里的图片外观和站内链接。模板只回答属于自己的问题。

| 参数                  | 说明                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `content`             | `readData` 的返回值                                                                                                                   |
| `nodes`               | 同一份数据里的其他正文段（如求索的描述、答案）；默认渲染主正文                                                                        |
| `hrefFor(target)`     | 站内链接目标对应的页面地址；不传或返回空时链接只显示文字                                                                              |
| `renderLink(props)`   | 自定义站内链接的展示，如悬停预览。props 为 `identity`、`target`、`href`、`title`、`text`、`children`，`children` 必须放进返回的元素里 |
| `onOutline(headings)` | 正文就绪后回调顶层标题 `{ level, title }[]`，供目录使用                                                                               |
| `fallback`            | 插件和样式准备完成前显示的内容；默认不显示                                                                                            |
| `className` / `style` | 正文容器的样式                                                                                                                        |

加载失败交给调用方的 React 错误边界。正文、预览和引用答案可以同时挂载多个渲染器，各自维护状态，卸载时清理插件样式。`hrefFor`、`renderLink` 请传稳定的引用，避免每次渲染都重建链接。

## 样式与主题

`styles.css` 的内容都在级联层里：主题变量在 `theme` 层，编辑器样式在 `components` 层。模板自己的 Tailwind 工具类可以覆盖编辑器样式，preflight 不会盖掉它们。

编辑器颜色取 `--tau-*` 变量。模板可以自己定义这些变量，也可以在 `<html>` 上写 `data-theme="paper" data-mode="light"`，使用包内的 Tau 主题（另有 ocean、mint、wisteria、sakura、ink）。`/theme/tailwind.css` 与 `/theme/scale.css` 提供同一套 Tailwind 语义类和尺度变量，供模板自己的页面使用。

## 其他

公开入口只有根入口、`/styles.css`、`/theme/tailwind.css` 和 `/theme/scale.css`。React、Slate 和 DnD 使用声明的共享 peer 版本。

内容插件在浏览器里经 `new Function` 求值（求值前校验 SHA-256），站点如设置 CSP 需允许 `unsafe-eval`。PlantUML 图表由 plantuml.com 渲染，源码会发往该服务。

源码在 packages/blog，仓库根目录执行 `node scripts/blog/package-blog.mjs` 构建 npm 归档。
