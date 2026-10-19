/**
 * 小管家排待办的一轮对话：用户消息 → query_todos（待办卡）→ create_calendar_event（操作结果卡）→ 回答。
 * 外壳同 AssistDock（DockShell），工具执行中显示默认 ToolRow，完成后换成专门的结果卡。
 */
import { appear, DockShell, ToolRow, UserBubble } from "./AssistDock";
import { TaskResultCard, TodoListCard } from "./TaskToolCard";
import { AI_ASSIST } from "../../mock/deepwork";

export type TaskAssistState = {
  open: number;
  user: number;
  /** 两次工具调用：0 未出现，(0,1) 执行中，1 完成 */
  tools: [number, number];
  /** 回答逐字流出 0→1 */
  answer: number;
  draft?: string;
};

export function TaskAssistDock({ state }: { state: TaskAssistState }) {
  const A = AI_ASSIST;
  const [query, create] = state.tools;
  const chars = [...A.answer];
  return (
    <DockShell open={state.open} title={A.title} model={A.model} draft={state.draft}>
      {state.user > 0 && <UserBubble text={A.ask} t={state.user} />}
      <div className="text-tau-body-lg text-ink-1 flex w-full min-w-0 flex-col items-start pt-2 pb-2">
        <div className="my-1.5 flex w-full flex-col gap-0.5">
          {query > 0 && (query < 1 ? <ToolRow name="query_todos" done={false} note="" style={appear(Math.min(1, query * 4))} /> : <TodoListCard todos={A.todos} style={appear(1)} />)}
          {create > 0 &&
            (create < 1 ? (
              <ToolRow name="create_calendar_event" done={false} note="" style={appear(Math.min(1, create * 4))} />
            ) : (
              <TaskResultCard results={A.todos.map(t => ({ title: t.title, effect: "新增 1 项日程" }))} style={appear(1)} />
            ))}
        </div>
        {state.answer > 0 && <p className="my-2 leading-[1.7]">{chars.slice(0, Math.round(chars.length * state.answer)).join("")}</p>}
      </div>
    </DockShell>
  );
}
