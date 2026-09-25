# todo 渲染器子模块

`TodoToolRenderer`（`query_todos` / `get_todo_dashboard`）的行渲染件与工具函数。

- `TodoRowCard.tsx`：对话内的单条待办。沿用待办页口径（D-048）：`TodoCheck` 圆形勾选、
  `TypeIcon` 类型小图标、笔记 / 日历映射 / 周期规则用 lucide 小图标 + `@tau/ui` Tooltip，
  逾期只染 `text-danger`，meta 行 `text-ink-3`。颜色全走 `--tau-*` 语义类，`isDark` 仅为接口兼容。
- `utils.ts`：输出解析（`parseTodoRendererOutput`）、时间格式化、逾期判断、次要信息项（`getSecondaryInfoItems`）。
- `constants.ts`：类型中文标签。
- `types.ts`：`TodoRowCardProps`。
