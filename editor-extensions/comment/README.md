# 批注扩展

`@tau/editor-comment` 持有批注节点、评论列表与编辑浮层、命令和 wrapComment/unwrapComment 操作。/comments 提供批注纯数据工具，/styles.css 提供批注颜色变量。

```ts
import { createEditorKit } from "@tau/editor";
import commentExtension from "@tau/editor-comment";
import "@tau/editor-comment/styles.css";

export const kit = createEditorKit({ extensions: [commentExtension] });
```

- 根入口安装元素类型增强并导出扩展，宿主显式选择是否装配。
- /types 仅提供模型类型，不加载 React 或编辑器运行时。
- 批注没有专用 Markdown 语法，继续通过框架通用 tau-node 载体保真。
- 样式扫描须包含本包 src；另需显式加载批注 styles.css。

生产实现仅消费核心公开 API；命令 id 和持久化 type 不随迁包更名。浮层使用已有 OverlayBackDismiss 仲裁；只读查看不写入文档。
