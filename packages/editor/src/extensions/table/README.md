# 表格扩展

`@tau/editor/extensions/table` 拥有表格、行、单元格及其完整行为：结构不变式、按下标的行列变换、格选区、行列手柄、导航热键、复制与编解码。

```ts
import { createEditorKit } from "@tau/editor";
import { tableExtensions } from "@tau/editor/extensions/table";
import { tableMarkdownCodecs } from "@tau/editor/extensions/table/markdown";

export const kit = createEditorKit({ extensions: tableExtensions });
```

- tableExtensions 保持 tableExtension/tableRowExtension/tableCellExtension 的组合顺序，三个节点不拆为不同包。
- /markdown 提供 tableMarkdownCodecs 与三个独立 codec，显式加入 processor.codecs；纯入口不加载 React 或 DOM。导出保留 GFM 列对齐（`:---:`），格内竖线转义为 `\|`、软换行写成 `<br>`，导入还原。
- 模型：`TableElement.align` 每列一项，全部未指定时省略；左对齐按未指定存储。
- 结构不变式（`normalize.ts`）：table → row → cell 三层严格，每行补齐到最大列数，没有行时回到空段落，格内块级内容解包为行内，align 长度跟随列数。
- 变换（`transforms.ts`）：`insertRows / insertColumns / deleteRows / deleteColumns / moveRow / moveColumn / setColumnAlign / clearCells / removeTable / selectCell` 均按「表格路径 + 下标」寻址，只用细粒度 Slate 变换；只读或路径失效时不写入并返回 false。删光行或列时整表回到空段落。
- 格选区（`selection.ts`）：选区两端落在同表不同格即按矩形理解；`selectRows / selectColumns` 产生带类型的整行 / 整列选区。删除：整行 / 整列删行列，其余清空内容；输入覆盖所选格；文本格式只作用于矩形内；复制写入子表片段、TSV 与 HTML 表格。由受信任层插件 `withTableCellSelection` 承载（ER-005）。
- 交互：悬停格子时该列顶边、该行左边出现手柄，点击选中并弹出行 / 列菜单（菜单打开时 ⌫ 删除所选行列），拖动排序；右侧 / 底部「+」追加列与行。表格级的复制、删除走块手柄的通用菜单。菜单接宿主返回仲裁。
- 粘贴（`paste.ts`，插件 `withTablePaste`）：格内粘贴 HTML 表格 / TSV / 编辑器子表从光标格起填充并扩行扩列，普通多行文本保留为软换行；正文粘贴主体为表格的 HTML 生成新表。
- 热键：`Tab`/`⇧Tab` 左右格（末格 Tab 新增行）、`Enter` 下一行同列（末行新增）、`⇧Enter` 格内软换行、`↑`/`↓` 上下格（格内有软换行时交给原生行内移动，首末行跳出表格）。

样式由宿主扫描 src；不另设 CSS 文件，只消费 `--ed-*` token。
