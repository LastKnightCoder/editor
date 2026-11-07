# 表格扩展

`@tau/editor/extensions/table` 拥有表格、行、单元格及其完整行为：结构不变式、按下标的行列变换、合并单元格、格选区、行列手柄、导航热键、复制与编解码。

```ts
import { createEditorKit } from "@tau/editor";
import { tableExtensions } from "@tau/editor/extensions/table";
import { tableMarkdownCodecs } from "@tau/editor/extensions/table/markdown";

export const kit = createEditorKit({ extensions: tableExtensions });
```

- tableExtensions 保持 tableExtension/tableRowExtension/tableCellExtension 的组合顺序，三个节点不拆为不同包。
- /markdown 提供 tableMarkdownCodecs 与三个独立 codec，显式加入 processor.codecs；纯入口不加载 React 或 DOM。导出保留 GFM 列对齐（`:---:`），格内竖线转义为 `\|`、软换行写成 `<br>`，导入还原。GFM 没有合并语法：被覆盖格导出为空，Markdown 往返不保留合并。
- 模型：`TableElement.align` 每列一项，全部未指定时省略；左对齐按未指定存储。
- 合并单元格：表格始终是满格矩形，路径下标即逻辑坐标。合并区域由左上格（原点格）的 `rowSpan` / `colSpan` 定义（等于 1 时省略），区域内其余格是被覆盖格：节点保留、内容为空、不带跨度，渲染为 `hidden`。被覆盖状态由 `span.ts` 的 `buildCoverMap` 推导（行优先扫描、先占先得），不单独存储；`/span` 子入口导出这些纯函数供宿主序列化使用。
- 结构不变式（`normalize.ts`）：table → row → cell 三层严格，每行补齐到最大列数，没有行时回到空段落，格内块级内容解包为行内，align 长度跟随列数；跨度截到表格边界，被覆盖格去掉跨度，其中出现的内容移到原点格末尾（软换行分隔）。
- 变换（`transforms.ts`）：`insertRows / insertColumns / deleteRows / deleteColumns / moveRow / moveColumn / setColumnAlign / clearCells / removeTable / selectCell` 均按「表格路径 + 下标」寻址，只用细粒度 Slate 变换；只读或路径失效时不写入并返回 false。删光行或列时整表回到空段落。`mergeCells` 先把矩形扩到包住碰到的区域，再把非空内容按阅读顺序以软换行拼进左上格；`splitCells` 拆开与矩形相交的区域，内容留在左上格。行列变换感知合并：插入点落在区域内部时跨度增长；删除区域一部分时跨度收缩，原点行 / 列被删时内容与剩余跨度移到区域剩下的第一行 / 列；移动会切开区域时 `moveRow / moveColumn` 返回 false（`moveSplitsMerge` 可预判）；`fillCells` 写入前拆开目标区域内的合并；`selectCell` 落到被覆盖格时改为原点格。
- 格选区（`selection.ts`）：选区两端落在同表不同格即按矩形理解，普通格选区扩到包住碰到的合并区域，端点落在原点格；`selectRows / selectColumns` 保存类型与原始逻辑矩形，端点映射到合并原点不改变所选行列范围。删除：整行 / 整列删行列，其余清空内容；输入覆盖所选格；文本格式只作用于矩形内；复制写入子表片段（跨度截到矩形内）、TSV 与 HTML 表格（`rowspan` / `colspan`）。由受信任层插件 `withTableCellSelection` 承载（ER-005）。
- 交互：悬停格子时该列顶边、该行左边出现手柄，点击选中并弹出行 / 列菜单（菜单打开时 ⌫ 删除所选行列），拖动排序（会切开合并区域时放置线变红、松手不移动并提示先拆分）；右侧 / 底部「+」追加列与行。格选区覆盖 ≥2 格时右下角出现「合并 n 格」角标，恰好选中一个合并格时变为「拆分单元格」；手柄菜单所选行列含合并格时提供「拆分合并单元格」。列边界取每列任意一个不跨列的格，整列被跨列格占据时按跨列格均分。表格级的复制、删除走块手柄的通用菜单。菜单接宿主返回仲裁。
- 粘贴（`paste.ts`，插件 `withTablePaste`）：格内粘贴 HTML 表格 / TSV / 编辑器子表从光标格起填充并扩行扩列（HTML 的 `rowspan` / `colspan` 与子表的跨度一并还原，完全被覆盖的空行保留），普通多行文本保留为软换行；正文粘贴主体为表格的 HTML 生成新表。粘贴与拆分只拆开直接接触原始目标矩形的合并区域，菜单计数使用同一口径，不递归扩大拆分范围。
- 热键：`Tab`/`⇧Tab` 按阅读顺序跳到下一个 / 上一个原点格（末格 Tab 新增行）、`Enter` 从当前合并格底边的下一行同列（末行新增）、`⇧Enter` 格内软换行、`↑`/`↓` 越过当前合并格的上 / 下边（格内有软换行时交给原生行内移动，首末行跳出表格）、合并格内 `Esc` 选中整格。

样式由宿主扫描 src；不另设 CSS 文件，只消费 `--ed-*` token。
