# 分割线扩展

`@tau/editor-divide-line` 持有分割线节点、块面板、插入操作 insertDivideLine 和编解码。连续分割线在非顶层的归并规则保持原行为。

```ts
import { createEditorKit } from "@tau/editor";
import divideLineExtension from "@tau/editor-divide-line";

export const kit = createEditorKit({ extensions: [divideLineExtension] });
```

- 根入口安装元素类型增强并导出扩展，宿主显式选择是否装配。
- /types 仅提供模型类型，不加载 React 或编辑器运行时。
- /markdown 导出 divideLineCodec，显式加入 createMarkdownProcessor 的 codecs；可独立进行无 DOM 类型检查。
- 样式扫描须包含本包 src；复用核心和设计系统的样式契约。

生产实现仅消费核心公开 API；命令 id 和持久化 type 不随迁包更名。
