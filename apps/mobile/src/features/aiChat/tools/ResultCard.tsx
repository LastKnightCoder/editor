// 写入结果卡：新建 / 修改 / 完成 / 删除待办与日程成功后，卡片就是那条待办或日程本身。
// 修改只列变了的字段（旧值划掉）；删除整条划掉，没有「查看」。

import type { ReactNode } from "react";
import { CalendarClock, ChevronRight, CircleCheck, Hash, Trash2 } from "lucide-react";
import type { ToolCallExecutionState } from "@tau/shared/chat-renderers";
import { cn } from "@tau/ui";
import { getNavigator } from "../../../router";
import { formatDue, formatEventRange, parseObject, str } from "./format";
import { Chip, TodoMark } from "./parts";
import { presentTool } from "./presenters";

type Data = Record<string, unknown>;

/** 改动前后：before 缺失（老会话）或字段没变时只显示新值 */
function Changed(props: { before?: string | null; after: string | null; icon?: ReactNode }) {
  if (!props.after) return null;
  if (props.before === undefined || props.before === props.after)
    return <Chip icon={props.icon}>{props.after}</Chip>;
  return (
    <>
      {props.before && <Chip old>{props.before}</Chip>}
      <Chip icon={props.icon} changed>
        {props.after}
      </Chip>
    </>
  );
}

function Card(props: {
  done: string;
  danger?: boolean;
  onView?: () => void;
  mark: ReactNode;
  title: string;
  gone?: boolean;
  muted?: boolean;
  oldTitle?: string;
  chips: ReactNode;
}) {
  return (
    <div className="bg-surface my-1.5 rounded-[18px] px-3.5 py-3">
      <div className="text-tau-sm text-ink-3 flex items-center gap-1.5">
        {props.danger ? (
          <Trash2 size={15} aria-hidden className="text-danger" />
        ) : (
          <CircleCheck size={15} aria-hidden className="text-ok" />
        )}
        <span className="flex-1">{props.done}</span>
        {props.onView && (
          <button
            type="button"
            onClick={props.onView}
            className="text-accent-text -my-2 -mr-1.5 flex h-9 items-center px-1.5 font-semibold"
          >
            查看
            <ChevronRight size={14} aria-hidden />
          </button>
        )}
      </div>
      <div className="mt-2 flex items-start gap-2.5">
        <span className="mt-[3px] flex">{props.mark}</span>
        <div className="min-w-0 flex-1">
          {props.oldTitle && (
            <div className="text-tau-sm text-ink-3 truncate line-through">{props.oldTitle}</div>
          )}
          <div
            className={cn(
              "text-tau-body leading-[1.45] break-words",
              props.gone
                ? "text-ink-3 font-medium line-through"
                : props.muted
                  ? "text-ink-3 font-semibold"
                  : "text-ink-1 font-semibold"
            )}
          >
            {props.title}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 empty:hidden">
            {props.chips}
          </div>
        </div>
      </div>
    </div>
  );
}

function TodoCard(props: { toolName: string; item: Data; before?: Data; done: string }) {
  const { item, before } = props;
  const id = Number(str(item.taskRef));
  const gone = props.toolName === "delete_todo";
  const completed = item.completed === true;
  const reopened = props.toolName === "set_todo_completed" && !completed;
  const title = str(item.title) || "未命名待办";
  const beforeTitle = before ? str(before.title) : undefined;
  return (
    <Card
      done={reopened ? "已改回未完成" : props.done}
      danger={gone}
      onView={
        !gone && Number.isSafeInteger(id)
          ? () => getNavigator().push("todoDetail", { todoId: id })
          : undefined
      }
      mark={<TodoMark completed={completed} gone={gone} />}
      title={title}
      gone={gone}
      muted={completed}
      oldTitle={beforeTitle && beforeTitle !== title ? beforeTitle : undefined}
      chips={
        gone ? null : (
          <>
            <Changed
              icon={<CalendarClock aria-hidden />}
              before={before ? formatDue(before.dueAt) : undefined}
              after={formatDue(item.dueAt)}
            />
            {str(item.group) && <Chip icon={<Hash aria-hidden />}>{str(item.group)}</Chip>}
          </>
        )
      }
    />
  );
}

const eventRange = (event: Data) => formatEventRange(event.start, event.end, event.allDay === true);

function EventCard(props: { toolName: string; event: Data; before?: Data; done: string }) {
  const { event, before } = props;
  const id = Number(str(event.eventId));
  const gone = props.toolName === "delete_calendar_event";
  const title = str(event.title) || "未命名日程";
  const beforeTitle = before ? str(before.title) : undefined;
  const range = eventRange(event);
  return (
    <Card
      done={props.done}
      danger={gone}
      onView={
        !gone && Number.isSafeInteger(id)
          ? () => getNavigator().push("calendarEventDetail", { eventId: id })
          : undefined
      }
      mark={
        <span
          aria-hidden
          className={cn("h-[22px] w-1 rounded-full", gone ? "bg-line-2" : "bg-tag-2")}
        />
      }
      title={title}
      gone={gone}
      oldTitle={beforeTitle && beforeTitle !== title ? beforeTitle : undefined}
      chips={
        gone ? (
          range && <Chip old>{range}</Chip>
        ) : (
          <>
            <Changed
              icon={<CalendarClock aria-hidden />}
              before={before ? eventRange(before) : undefined}
              after={range}
            />
            {str(event.calendar) && <Chip>{str(event.calendar)}</Chip>}
          </>
        )
      }
    />
  );
}

/** 输出里没有可展示的待办 / 日程时返回 null，由调用方回落为时间线行 */
export function ResultCard(props: { execution: ToolCallExecutionState }) {
  const { execution } = props;
  const output = parseObject(execution.output);
  const done = presentTool(execution).write?.done ?? "已完成";
  const before = execution.metadata?.before as Data | undefined;
  const item = output?.item as Data | undefined;
  const event = output?.event as Data | undefined;
  if (item)
    return <TodoCard toolName={execution.toolName} item={item} before={before} done={done} />;
  if (event)
    return <EventCard toolName={execution.toolName} event={event} before={before} done={done} />;
  return null;
}
