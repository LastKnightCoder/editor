import { Editor } from "slate";

// 拖拽可见性由 check-list-item 的 drag 声明（children: false）承担后，这里不再往
// 文档数据写 disableDrag；paragraph 自身没有其他规范化规则，保留空实现供 getPlugins 组装。
export const normalizeParagraph = (editor: Editor) => editor;
