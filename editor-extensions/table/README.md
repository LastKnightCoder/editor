# 表格扩展

`@tau/editor-table` 拥有表格、行、单元格及其完整行为：增删行列、单元格导航、行拖拽、跨单元格删除防护、复制、块面板、菜单和编解码。

```ts
import { createEditorKit } from "@tau/editor";
import { tableExtensions } from "@tau/editor-table";
import { tableMarkdownCodecs } from "@tau/editor-table/markdown";

export const kit = createEditorKit({ extensions: tableExtensions });
```

- tableExtensions 保持 tableExtension/tableRowExtension/tableCellExtension 的原组合顺序，三个节点不拆为不同包。
- /markdown 提供 tableMarkdownCodecs 与三个独立 codec，显式加入 processor.codecs；纯入口不加载 React 或 DOM。
- /types 提供模型，行内子节点使用核心公开映射。渲染模型声明与纯 codec 的无 DOM 检查范围分开。
- 根入口提供 insertTable 及原行列操作；命令 id 不变。插入需要有效选区与正整数尺寸，只读不执行写入操作。
- 删除最后一列后回到空段落并恢复光标；末格导航复用末行退出规则，后方没有块时补可编辑段落。
- 菜单仅当前表格生效，并接宿主返回仲裁。行拖拽按原节点重新查路径，拒绝跨编辑器、跨表、标题行与失效目标。

样式由宿主扫描 src；不另设 CSS 文件。行手柄位于首个单元格内，通过包内上下文复用核心通用 DragHandle，避免在 tr 下直接放 div。删除防护继续使用已授权的受信任 Slate plugin，不扩充新的生命周期协议。
