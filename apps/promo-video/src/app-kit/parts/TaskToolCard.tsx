/**
 * 待办与日程工具（query_todos / create_calendar_event 等）的结果卡：摘自 tool-call-renderers/AssistantTaskRenderer.tsx
 * 与 ui.tsx（ToolCard）。标题只有「待办」「日程」「操作结果」三种；勾选圈同 features/todos TodoCheck。
 */
import type { CSSProperties } from "react";

function ToolCard({ title, children, style }: { title: string; children: React.ReactNode; style?: CSSProperties }) {
  return (
    <div style={style} className="border-line-1 bg-surface rounded-tau-md my-2 w-full max-w-full min-w-0 overflow-hidden border">
      <div className="px-3.5 pt-3 pb-1">
        <div className="text-tau-body text-ink-1 font-medium">{title}</div>
      </div>
      <div className="space-y-3 px-3.5 pt-2 pb-3.5">{children}</div>
    </div>
  );
}

const Muted = ({ children }: { children: React.ReactNode }) => <div className="text-tau-sm text-ink-3">{children}</div>;

/** query_todos 的结果：未完成的待办 */
export function TodoListCard({ todos, style }: { todos: { title: string; meta: string }[]; style?: CSSProperties }) {
  return (
    <ToolCard title="待办" style={style}>
      {todos.map(todo => (
        <div key={todo.title} className="flex items-start gap-2.5">
          <span className="border-ink-3 mt-1 grid size-[17px] shrink-0 place-items-center rounded-full border-[1.5px]" />
          <div className="min-w-0 flex-1">
            <div className="text-tau-body text-ink-1">{todo.title}</div>
            <Muted>{todo.meta}</Muted>
          </div>
        </div>
      ))}
    </ToolCard>
  );
}

/** 写操作回执：每个 item 一组「已完成 · 标题 / 新增 1 项日程」，右侧可撤销 */
export function TaskResultCard({ results, style }: { results: { title: string; effect: string }[]; style?: CSSProperties }) {
  return (
    <ToolCard title="操作结果" style={style}>
      {results.map(r => (
        <div key={r.title} className="space-y-1">
          <div className="text-tau-sm text-ink-2 flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">已完成 · {r.title}</span>
            <span className="text-tau-meta text-ink-2 inline-flex h-[28px] shrink-0 items-center rounded-[10px] px-[13px] font-[550]">撤销</span>
          </div>
          <Muted>{r.effect}</Muted>
        </div>
      ))}
    </ToolCard>
  );
}
