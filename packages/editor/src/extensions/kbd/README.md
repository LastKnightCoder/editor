# 键盘标签扩展

`@tau/editor/extensions/kbd` 持有键盘标签节点、工具条、命令和 wrapKbd/unwrapKbd 操作。HTML 标签认领由 codec.inlineHtmlWrapper 声明，框架只处理配对及位置映射。

```ts
import { createEditorKit } from "@tau/editor";
import kbdExtension from "@tau/editor/extensions/kbd";

export const kit = createEditorKit({ extensions: [kbdExtension] });
```

- 根入口安装元素类型增强并导出扩展，宿主显式选择是否装配。
- /types 仅提供模型类型，不加载 React 或编辑器运行时。
- /markdown 导出 kbdCodec，显式加入 createMarkdownProcessor 的 codecs；可独立进行无 DOM 类型检查。
- 样式扫描须包含本模块 src；复用核心和设计系统的样式契约。

生产实现仅消费核心公开 API；命令 id 和持久化 type 不随迁包更名。
