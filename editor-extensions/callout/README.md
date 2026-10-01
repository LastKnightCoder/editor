# Callout扩展

`@tau/editor-callout` 持有完整节点、模型、插入/退出/规范化、复制、转换菜单、渲染和纯 codec。

```ts
import { createEditorKit } from "@tau/editor";
import extension from "@tau/editor-callout";
import "@tau/editor-callout/styles.css";

export const kit = createEditorKit({ extensions: [extension] });
```

- 根入口默认导出扩展，并公开 insertCallout；无选区/只读时插入不写入。
- /types 提供模型，块级子节点类型引用核心公开映射；它与无 DOM 的 codec 检查范围分开。
- /markdown 提供 calloutCodec，由宿主显式加入处理器。纯 codec 验证内容往返和叶子文本位置，非 void 容器不承诺额外的元素级映射。
- 宿主样式扫描包含 src。五类配色变量、mask 图标和 SVG 资源由 /styles.css 提供，宿主显式导入；标题更新和类型菜单重新验证当前节点。

核心只提供通用的空段落退出容器和子节点修复机制；具体类型、退出条件、转换规则和命令 id 归本包，不靠其他容器扩展隐式安装。原数据字段与既有 Markdown 输出保留。
