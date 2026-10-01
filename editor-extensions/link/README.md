# 链接扩展

`@tau/editor-link` 持有链接模型、渲染、编辑浮层、工具条/快捷键和 wrapLink/unwrapLink 操作。链接打开消费 @tau/shared/host-services 的 IOpenerService。

```ts
import { createEditorKit } from "@tau/editor";
import linkExtension from "@tau/editor-link";

export const kit = createEditorKit({ extensions: [linkExtension] });
```

- 根入口安装元素类型增强并导出扩展，宿主显式选择是否装配。
- /types 仅提供模型类型，不加载 React 或编辑器运行时。
- /markdown 导出 linkCodec，显式加入 createMarkdownProcessor 的 codecs；可独立进行无 DOM 类型检查。
- 样式扫描须包含本包 src；复用核心和设计系统的样式契约。

生产实现仅消费核心公开 API；命令 id 和持久化 type 不随迁包更名。浮层使用已有 OverlayBackDismiss 仲裁；只读查看不写入文档。
