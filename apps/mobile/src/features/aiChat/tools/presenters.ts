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
  label: string;
  /** 有对象时换用的短动作，如「读取「同步冲突策略」」 */
  subjectLabel?: string;
  subject?(input: Data, output: Data | null): string | undefined;
  /** 成功后右侧的结果，如「5 篇」 */
  meta?(output: Data, input: Data): string | undefined;
  /** 写入类：确认卡标题与结果卡动词 */
  write?: { confirm(input: Data): string; done: string; danger?: boolean };
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

const countOr = (value: unknown, unit: string, empty: string) => {
  const count = num(value);
  return count === undefined ? undefined : count > 0 ? `${formatCount(count)} ${unit}` : empty;
};

const imageCount = (output: Data) => {
  const count = list(output.images).length;
  return count ? `${count} 张` : undefined;
};
const titleOf = (input: Data) => str(input.title)?.trim() || undefined;
const patchTitle = (input: Data) => str((input.patch as Data | undefined)?.title)?.trim();

const SPECS: Record<string, ToolSpec> = {
  get_current_date: {
    icon: Calendar,
    label: "查看今天日期",
    meta: output => {
      const parsed = parseLocalText(output.date);
      return parsed
        ? `${parsed.date.getMonth() + 1}月${parsed.date.getDate()}日 ${WEEKDAYS[parsed.date.getDay()]}`
        : undefined;
    },
  },
  search_knowledge: {
    icon: Search,
    label: "搜索笔记",
    subject: input => str(input.query)?.trim(),
    meta: output => countOr(output.count, "篇", "没找到"),
  },
  get_content_markdown: {
    icon: FileText,
    label: "读取笔记",
    subjectLabel: "读取",
    subject: (_input, output) => str((output?.entity as Data | undefined)?.title)?.trim(),
    meta: output => {
      const length = num(output.length);
      return length === undefined ? undefined : `${formatCount(length)} 字`;
    },
  },
  sql_query: {
    icon: Database,
    label: "查询数据库",
    meta: output => countOr(output.rowCount ?? output.returnedRowCount, "行", "没有结果"),
  },
  query_todos: {
    icon: ListTodo,
    label: "查询待办",
    subject: input =>
      str(input.keyword)?.trim() ||
      (input.overdue === true
        ? "已过期"
        : input.completed === false
          ? "未完成"
          : input.completed === true
            ? "已完成"
            : undefined),
    meta: output => countOr(output.total, "项", "没有"),
  },
  query_calendar_events: {
    icon: CalendarDays,
    label: "查询日程",
    subject: input => formatDayRange(input.start, input.end) ?? undefined,
    meta: output => countOr(output.total, "个", "没有"),
  },
  load_skill: {
    icon: BookOpen,
    label: "读取技能说明",
    subject: (input, output) => str(output?.name) ?? str(input.id),
  },
  read_skill_resource: {
    icon: BookOpen,
    label: "读取技能资料",
    subject: input => str(input.path)?.split("/").at(-1),
  },
  generate_image: { icon: Image, label: "生成图片", meta: output => imageCount(output) },
  edit_image: { icon: Image, label: "编辑图片", meta: output => imageCount(output) },
  "ask-question": { icon: MessageCircleQuestion, label: "向你提问" },
  create_todo: {
    icon: ListTodo,
    label: "新建待办",
    subject: titleOf,
    write: { confirm: () => "新建这条待办？", done: "已新建待办" },
  },
  update_todo: {
    icon: SquarePen,
    label: "修改待办",
    subject: patchTitle,
    write: { confirm: () => "修改这条待办？", done: "已修改待办" },
  },
  set_todo_completed: {
    icon: CircleCheck,
    label: "完成待办",
    write: {
      confirm: input => (input.completed === false ? "把这条待办改回未完成？" : "完成这条待办？"),
      done: "已完成待办",
    },
  },
  delete_todo: {
    icon: Trash2,
    label: "删除待办",
    write: { confirm: () => "删除这条待办？", done: "已删除待办", danger: true },
  },
  create_calendar_event: {
    icon: CalendarPlus,
    label: "新建日程",
    subject: titleOf,
    write: { confirm: () => "新建这个日程？", done: "已新建日程" },
  },
  update_calendar_event: {
    icon: CalendarCheck,
    label: "修改日程",
    subject: patchTitle,
    write: { confirm: () => "修改这个日程？", done: "已修改日程" },
  },
  delete_calendar_event: {
    icon: CalendarX,
    label: "删除日程",
    write: { confirm: () => "删除这个日程？", done: "已删除日程", danger: true },
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
  write?: ToolSpec["write"];
  /** 宿主内置工具（有专门的详情展示） */
  builtin: boolean;
}

export function presentTool(execution: ToolCallExecutionState): ToolPresentation {
  const spec = SPECS[execution.toolName];
  const input = parseObject(execution.input) ?? {};
  const output = execution.status === "success" ? parseObject(execution.output) : null;
  if (!spec) return { icon: Plug, label: humanizeToolName(execution.toolName), builtin: false };
  const entityType = str((output?.entity as Data | undefined)?.type);
  const kind = entityType ? referenceKindOf(entityType) : null;
  const subject = spec.subject?.(input, output);
  return {
    icon: kind?.icon ?? spec.icon,
    tone: kind?.text,
    label: (subject && spec.subjectLabel) || spec.label,
    subject,
    meta: output && output.success !== false ? spec.meta?.(output, input) : undefined,
    write: spec.write,
    builtin: true,
  };
}

/** 写入类工具（成功后出结果卡，等待时出确认卡） */
export const isWriteTool = (toolName: string) => !!SPECS[toolName]?.write;
