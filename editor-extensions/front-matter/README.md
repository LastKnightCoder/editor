# 文档元数据扩展

`@tau/editor-front-matter` 持有Front Matter 节点、YAML 展示与 description 编辑、纯编解码。持久字段与原有可编辑字段范围保持。

```ts
import { createEditorKit } from "@tau/editor";
import frontMatterExtension from "@tau/editor-front-matter";

export const kit = createEditorKit({ extensions: [frontMatterExtension] });
```

- 根入口安装元素类型增强并导出扩展，宿主显式选择是否装配。
- /types 仅提供模型类型，不加载 React 或编辑器运行时。
- /markdown 导出 frontMatterCodec，显式加入 createMarkdownProcessor 的 codecs；可独立进行无 DOM 类型检查。
- 样式扫描须包含本包 src；复用核心和设计系统的样式契约。

生产实现仅消费核心公开 API；命令 id 和持久化 type 不随迁包更名。
