// 工具卡片与详情面板共用的小件：同底色细描边分组、字段胶囊、原始数据。
// 卡片与面板本身是 surface，里面的块与容器同底色，只靠 line-1 描边区分，不铺页面底色。

import { useState, type ReactNode } from "react";
import { Check, ChevronDown, Code, Copy } from "lucide-react";
import type { ToolCallExecutionState } from "@tau/shared/chat-renderers";
import { cn } from "@tau/ui";
import { toast } from "../../../components/toast";
import { prettyJson } from "./format";
import { DIVIDED, GROUP } from "./results";

export function SectionLabel(props: { children: ReactNode }) {
  return <div className="text-tau-sm text-ink-3 mb-1.5">{props.children}</div>;
}

/** 字段胶囊：时间、清单、日历；changed 为改动后的新值 */
export function Chip(props: {
  icon?: ReactNode;
  children: ReactNode;
  changed?: boolean;
  old?: boolean;
}) {
  return (
    <span
      className={cn(
        "text-tau-sm inline-flex h-[26px] max-w-full items-center gap-1 rounded-lg px-2 [&_svg]:size-[13px]",
        props.changed
          ? "text-warn font-semibold shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--tau-warn)_45%,transparent)]"
          : "text-ink-2 shadow-[inset_0_0_0_1px_var(--tau-line-1)]",
        props.old && "text-ink-3 line-through"
      )}
    >
      {props.icon}
      <span className="truncate">{props.children}</span>
    </span>
  );
}

/** 只读的待办圆勾（展示用，不可点） */
export function TodoMark(props: { completed?: boolean; gone?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "text-ink-inverse grid size-5 shrink-0 place-items-center rounded-full border-[1.8px]",
        props.completed ? "border-ok bg-ok" : "border-ink-3",
        props.gone && "border-dashed"
      )}
    >
      {props.completed && <Check size={12} strokeWidth={3} />}
    </span>
  );
}

/** 字段组：确认卡与详情面板里的「标题 / 截止 / 清单」 */
export function FieldList(props: { fields: Array<{ label: string; value: ReactNode }> }) {
  return (
    <div className={cn(GROUP, DIVIDED, "px-3.5")}>
      {props.fields.map(field => (
        <div key={field.label} className="text-tau-body flex min-h-[42px] items-center gap-3 py-2">
          <span className="text-tau-meta text-ink-3 w-14 shrink-0">{field.label}</span>
          <span className="text-ink-1 min-w-0 flex-1 break-words">{field.value}</span>
        </div>
      ))}
    </div>
  );
}

function copy(text: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success("已复制"),
    () => toast.error("复制失败")
  );
}

function RawBlock(props: { label: string; text: string; danger?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-tau-sm text-ink-3 mb-1 flex items-center">
        <span className={cn("flex-1", props.danger && "text-danger")}>{props.label}</span>
        <button
          type="button"
          aria-label={`复制${props.label}`}
          onClick={() => copy(props.text)}
          className="-mr-1.5 grid size-8 place-items-center"
        >
          <Copy size={14} aria-hidden />
        </button>
      </div>
      <pre
        data-allow-touchmove="true"
        className={cn(
          "font-tau-mono text-tau-sm m-0 max-h-60 overflow-auto leading-[1.6] whitespace-pre",
          props.danger ? "text-danger" : "text-ink-1"
        )}
      >
        {props.text}
      </pre>
    </div>
  );
}

/** 原始数据：格式化后的输入、输出与错误，默认折叠；排查问题和反馈时用 */
export function RawData(props: { execution: ToolCallExecutionState; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!props.defaultOpen);
  const { input, output, error } = props.execution;
  return (
    <div className={GROUP}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        className="text-tau-meta text-ink-2 flex h-11 w-full items-center gap-2 px-3.5"
      >
        <Code size={15} aria-hidden />
        <span className="flex-1 text-left">原始数据</span>
        <ChevronDown
          size={15}
          aria-hidden
          className={cn("text-ink-3 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="space-y-3 px-3.5 pb-3">
          {input.trim() && <RawBlock label="输入" text={prettyJson(input)} />}
          {output && <RawBlock label="输出" text={prettyJson(output)} />}
          {error && <RawBlock label="错误" text={error} danger />}
        </div>
      )}
    </div>
  );
}
