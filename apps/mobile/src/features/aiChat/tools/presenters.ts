import type { ToolDisplayContext, ToolMessageKey } from "../tools.messages";
// 每个工具在对话里怎么说：类别图标、「动作 + 对象」标题、右侧结果数、确认与结果卡的动词。
// 宿主工具按名字查表，插件与 MCP 工具回落为插头图标 + 可读的工具名。

import {
  BookOpen,
  Calendar,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  CalendarX,
  CircleCheck,
  Database,
  FileText,
  Image,
  ListTodo,
  MessageCircleQuestion,
  Plug,
  Search,
  SquarePen,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { ToolCallExecutionState } from "@tau/shared/chat-renderers";
import {
  formatCount,
  dayLabel,
  formatDayRange,
  humanizeToolName,
  list,
  num,
  parseLocalText,
  parseObject,
  str,
} from "./format";
import { referenceKindOf } from "../referenceKinds";

type Data = Record<string, unknown>;

interface ToolSpec {
  icon: LucideIcon;
  /** 动作，如「搜索笔记」；有对象时显示为「搜索笔记「同步」」 */
  labelKey: ToolMessageKey;
  /** 有对象时换用的短动作，如「读取「同步冲突策略」」 */
  subjectLabelKey?: ToolMessageKey;
  subject?(input: Data, output: Data | null, context: ToolDisplayContext): string | undefined;
  /** 成功后右侧的结果，如「5 篇」 */
  meta?(output: Data, input: Data, context: ToolDisplayContext): string | undefined;
  /** 写入类：确认卡标题与结果卡动词 */
  write?: {
    confirm(input: Data, context: ToolDisplayContext): string;
    doneKey: ToolMessageKey;
    danger?: boolean;
  };
}

const countOr = (
  value: unknown,
  unit: ToolMessageKey,
  empty: ToolMessageKey,
  context: ToolDisplayContext
) => {
  const count = num(value);
  return count === undefined
    ? undefined
    : count > 0
      ? context.t(unit, { count, number: formatCount(count, context.locale) })
      : context.t(empty);
};
const imageCount = (output: Data, context: ToolDisplayContext) => {
  const count = list(output.images).length;
  return count
    ? context.t("count.images", { count, number: formatCount(count, context.locale) })
    : undefined;
};
const titleOf = (input: Data) => str(input.title)?.trim() || undefined;
const patchTitle = (input: Data) => str((input.patch as Data | undefined)?.title)?.trim();

const SPECS: Record<string, ToolSpec> = {
  get_current_date: {
    icon: Calendar,
    labelKey: "tool.get_current_date",
    meta: (output, _input, context) => {
      const parsed = parseLocalText(output.date);
      return parsed ? dayLabel(parsed.date, { ...context, relative: false }) : undefined;
    },
  },
  search_knowledge: {
    icon: Search,
    labelKey: "tool.search_knowledge",
    subject: input => str(input.query)?.trim(),
    meta: (output, _input, context) =>
      countOr(output.count, "count.notes", "count.noSearch", context),
  },
  get_content_markdown: {
    icon: FileText,
    labelKey: "tool.get_content_markdown",
    subjectLabelKey: "tool.read",
    subject: (_input, output) => str((output?.entity as Data | undefined)?.title)?.trim(),
    meta: (output, _input, context) => {
      const length = num(output.length);
      return length === undefined
        ? undefined
        : context.t("count.chars", { count: length, number: formatCount(length, context.locale) });
    },
  },
  sql_query: {
    icon: Database,
    labelKey: "tool.sql_query",
    meta: (output, _input, context) =>
      countOr(output.rowCount ?? output.returnedRowCount, "count.rows", "count.noRows", context),
  },
  query_todos: {
    icon: ListTodo,
    labelKey: "tool.query_todos",
    subject: (input, _output, context) =>
      str(input.keyword)?.trim() ||
      (input.overdue === true
        ? context.t("query.overdue")
        : input.completed === false
          ? context.t("query.incomplete")
          : input.completed === true
            ? context.t("query.completed")
            : undefined),
    meta: (output, _input, context) => countOr(output.total, "count.items", "count.none", context),
  },
  query_calendar_events: {
    icon: CalendarDays,
    labelKey: "tool.query_calendar_events",
    subject: (input, _output, context) =>
      formatDayRange(input.start, input.end, context) ?? undefined,
    meta: (output, _input, context) => countOr(output.total, "count.events", "count.none", context),
  },
  load_skill: {
    icon: BookOpen,
    labelKey: "tool.load_skill",
    subject: (input, output) => str(output?.name) ?? str(input.id),
  },
  read_skill_resource: {
    icon: BookOpen,
    labelKey: "tool.read_skill_resource",
    subject: input => str(input.path)?.split("/").at(-1),
  },
  generate_image: {
    icon: Image,
    labelKey: "tool.generate_image",
    meta: (output, _input, context) => imageCount(output, context),
  },
  edit_image: {
    icon: Image,
    labelKey: "tool.edit_image",
    meta: (output, _input, context) => imageCount(output, context),
  },
  "ask-question": { icon: MessageCircleQuestion, labelKey: "tool.ask-question" },
  create_todo: {
    icon: ListTodo,
    labelKey: "tool.create_todo",
    subject: titleOf,
    write: {
      confirm: (_input, context) => context.t("confirm.createTodo"),
      doneKey: "done.createTodo",
    },
  },
  update_todo: {
    icon: SquarePen,
    labelKey: "tool.update_todo",
    subject: patchTitle,
    write: {
      confirm: (_input, context) => context.t("confirm.updateTodo"),
      doneKey: "done.updateTodo",
    },
  },
  set_todo_completed: {
    icon: CircleCheck,
    labelKey: "tool.set_todo_completed",
    write: {
      confirm: (input, context) =>
        context.t(input.completed === false ? "confirm.reopenTodo" : "confirm.completeTodo"),
      doneKey: "done.completeTodo",
    },
  },
  delete_todo: {
    icon: Trash2,
    labelKey: "tool.delete_todo",
    write: {
      confirm: (_input, context) => context.t("confirm.deleteTodo"),
      doneKey: "done.deleteTodo",
      danger: true,
    },
  },
  create_calendar_event: {
    icon: CalendarPlus,
    labelKey: "tool.create_calendar_event",
    subject: titleOf,
    write: {
      confirm: (_input, context) => context.t("confirm.createEvent"),
      doneKey: "done.createEvent",
    },
  },
  update_calendar_event: {
    icon: CalendarCheck,
    labelKey: "tool.update_calendar_event",
    subject: patchTitle,
    write: {
      confirm: (_input, context) => context.t("confirm.updateEvent"),
      doneKey: "done.updateEvent",
    },
  },
  delete_calendar_event: {
    icon: CalendarX,
    labelKey: "tool.delete_calendar_event",
    write: {
      confirm: (_input, context) => context.t("confirm.deleteEvent"),
      doneKey: "done.deleteEvent",
      danger: true,
    },
  },
};

export interface ToolPresentation {
  icon: LucideIcon;
  /** 类别图标的标签色（读取笔记按笔记类型着色），缺省淡墨 */
  tone?: string;
  label: string;
  subject?: string;
  /** 成功后右侧的结果 */
  meta?: string;
  write?: { confirm(input: Data): string; done: string; danger?: boolean };
  /** 宿主内置工具（有专门的详情展示） */
  builtin: boolean;
}

export function presentTool(
  execution: ToolCallExecutionState,
  context: ToolDisplayContext
): ToolPresentation {
  const spec = SPECS[execution.toolName];
  const input = parseObject(execution.input) ?? {};
  const output = execution.status === "success" ? parseObject(execution.output) : null;
  if (!spec) return { icon: Plug, label: humanizeToolName(execution.toolName), builtin: false };
  const entityType = str((output?.entity as Data | undefined)?.type);
  const kind = entityType ? referenceKindOf(entityType) : null;
  const subject = spec.subject?.(input, output, context);
  const write = spec.write;
  return {
    icon: kind?.icon ?? spec.icon,
    tone: kind?.text,
    label: context.t((subject && spec.subjectLabelKey) || spec.labelKey),
    subject,
    meta: output && output.success !== false ? spec.meta?.(output, input, context) : undefined,
    write: write
      ? {
          confirm: data => write.confirm(data, context),
          done: context.t(write.doneKey),
          danger: write.danger,
        }
      : undefined,
    builtin: true,
  };
}

/** 写入类工具（成功后出结果卡，等待时出确认卡） */
export const isWriteTool = (toolName: string) => !!SPECS[toolName]?.write;
