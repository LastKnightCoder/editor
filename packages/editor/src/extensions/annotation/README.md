# 行内注释扩展

`@tau/editor/extensions/annotation` 持有注释节点、脚注编解码、插入命令和查看/编辑浮层，公开 insertAnnotation/isAnnotationActive。

```ts
import { createEditorKit } from "@tau/editor";
import annotationExtension from "@tau/editor/extensions/annotation";

export const kit = createEditorKit({ extensions: [annotationExtension] });
```

- 根入口安装元素类型增强并导出扩展，宿主显式选择是否装配。
- /types 仅提供模型类型，不加载 React 或编辑器运行时。
- /markdown 导出 annotationCodec，显式加入 createMarkdownProcessor 的 codecs；可独立进行无 DOM 类型检查。
- 样式扫描须包含本模块 src；复用核心和设计系统的样式契约。

生产实现仅消费核心公开 API；命令 id 和持久化 type 不随迁包更名。浮层使用已有 OverlayBackDismiss 仲裁；只读查看不写入文档。
