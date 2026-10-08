import type { CellPlugin } from "../types";

export const missingPlugin: CellPlugin<unknown> = {
  type: "unsupported",
  name: "未提供字段插件",
  editable: false,
  Renderer: ({ column }) => (
    <span className="text-ink-3 text-tau-meta px-2">未提供 {column.type} 字段插件</span>
  ),
};
