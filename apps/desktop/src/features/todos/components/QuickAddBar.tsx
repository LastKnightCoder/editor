/**
 * 自然语言快速添加：一行输入实时解析（quickAdd.ts），识别结果以 chips 回显，回车创建。
 * 没写 #项目 时落到「当前 pills 选中的项目」，全部视图下落到第一个项目。
 */

import { useMemo, useState, type Ref } from "react";
import { Clock, Flag, List, Repeat, Sparkles } from "lucide-react";
import { cn } from "@tau/ui";
import type { TodoGroup } from "@/types";
import { parseQuickAdd, type QuickAddResult } from "../quickAdd";
import { dateTimeWord, hm, recurrenceText } from "../model";
import { GroupDot } from "./TodoBits";

const TOKEN_CLASS = {
  normal: "bg-hover text-ink-1",
  deadline: "bg-warn-soft text-ink-1 [&_svg]:text-warn",
  planned: "bg-info-soft text-ink-1 [&_svg]:text-info",
  recurring: "bg-ok-soft text-ink-1 [&_svg]:text-ok",
} as const;

export function QuickAddBar({
  groups,
  fallbackGroupId,
  now,
  onSubmit,
  inputRef,
}: {
  groups: TodoGroup[];
  fallbackGroupId: number | null;
  now: number;
  onSubmit(parsed: QuickAddResult, groupId: number): Promise<void>;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(
    () => (text.trim() ? parseQuickAdd(text, { now, groups }) : null),
    [text, now, groups]
  );
  const groupId = parsed?.groupId ?? fallbackGroupId;
  const group = groups.find(g => g.id === groupId);
  const disabled = groups.length === 0;

  const submit = async () => {
    if (!parsed?.title || groupId == null || busy) return;
    setBusy(true);
    try {
      await onSubmit(parsed, groupId);
      setText("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-line-1 focus-within:shadow-lift ease-tau-out mb-3 flex flex-none flex-col rounded-[14px] border transition-[box-shadow,border-color] duration-150 focus-within:border-transparent">
      <div className="flex h-11 items-center gap-2.5 pl-3.5 pr-2">
        <Sparkles className="text-accent size-4 shrink-0" strokeWidth={1.75} />
        <input
          ref={inputRef}
          value={text}
          disabled={disabled}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            } else if (e.key === "Escape" && text) {
              e.preventDefault();
              e.stopPropagation();
              setText("");
            }
          }}
          placeholder={
            disabled
              ? "先新建一个项目，再添加任务"
              : "添加任务：试试「明天 17:00 交周报 #项目」或「每周一、四 周会」"
          }
          className="text-tau-body-lg placeholder:text-ink-3 min-w-0 flex-1 bg-transparent outline-none"
        />
        <span className="text-ink-3 flex shrink-0 items-center gap-1.5 text-[11px]">
          {parsed ? (
            <>
              回车添加
              <kbd className="bg-hover text-ink-2 rounded-[5px] px-[5px] py-0.5 font-mono text-[11px]">
                ⏎
              </kbd>
            </>
          ) : (
            <kbd className="bg-hover text-ink-2 rounded-[5px] px-[5px] py-0.5 font-mono text-[11px]">
              ⌘/
            </kbd>
          )}
        </span>
      </div>
      {parsed && (
        <div className="text-ink-3 flex flex-wrap items-center gap-1.5 pb-2.5 pl-10 pr-3.5 text-[11.5px]">
          识别为
          <ParsedToken parsed={parsed} now={now} />
          {group && (
            <span
              className={cn(
                TOKEN_CLASS.normal,
                "inline-flex h-[22px] items-center gap-1.5 rounded-[6px] px-2"
              )}
            >
              <GroupDot color={group.color} className="size-[7px]" />
              {group.title}
            </span>
          )}
          <span className="ml-1.5">
            标题：<b className="text-ink-1 font-medium">{parsed.title || "（空）"}</b>
          </span>
        </div>
      )}
    </div>
  );
}

function ParsedToken({ parsed, now }: { parsed: QuickAddResult; now: number }) {
  const base = "inline-flex h-[22px] items-center gap-1.5 rounded-[6px] px-2 [&_svg]:size-3";
  switch (parsed.type) {
    case "recurring":
      return (
        <span className={cn(base, TOKEN_CLASS.recurring)}>
          <Repeat strokeWidth={1.75} />
          周期 ·{" "}
          {recurrenceText({
            id: 0,
            todoItemId: 0,
            type: parsed.recurrence!.type,
            interval: 1,
            weekdays: parsed.recurrence!.weekdays ?? null,
            monthDay: parsed.recurrence!.monthDay ?? null,
            excludeHolidays: false,
            startDate: now,
            createTime: now,
            updateTime: now,
          })}
        </span>
      );
    case "planned":
      return (
        <span className={cn(base, TOKEN_CLASS.planned)}>
          <Clock strokeWidth={1.75} />
          计划 · {dateTimeWord(parsed.startAt!, now)}–{hm(parsed.dueAt!)}
        </span>
      );
    case "deadline":
      return (
        <span className={cn(base, TOKEN_CLASS.deadline)}>
          <Flag strokeWidth={1.75} />
          截止 · {dateTimeWord(parsed.dueAt!, now)}
        </span>
      );
    default:
      return (
        <span className={cn(base, TOKEN_CLASS.normal)}>
          <List strokeWidth={1.75} />
          普通任务
        </span>
      );
  }
}
