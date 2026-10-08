/**
 * 勾选项里 `#项目` / 日期的胶囊外观（装饰标记）。日期原文是带年份的绝对日期，胶囊后附相对说法
 *（今天 / 周五）；项目带色点，项目不存在时不装饰。点胶囊打开小菜单（DocTaskLayer 渲染）。
 */

import type { MouseEvent } from "react";
import { useReadOnly, useSlateStatic } from "slate-react";
import { cn } from "@tau/ui";
import type { MarkRenderProps } from "@tau/editor/api";
import { resolveDocTaskDue } from "@/entity/doc-tasks";
import { dayDiff, dayWord, monthDay } from "@/utils/dayWords";
import { docTaskGroupsOf } from "./service";
import { useChipMenuStore } from "./chipMenu";
import type { DocTaskTokenLeaf } from "./index";

export function DocTaskTokenChip({ leaf, children }: MarkRenderProps) {
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const token = leaf as unknown as DocTaskTokenLeaf;
  const groups = docTaskGroupsOf(editor);
  const open = (event: MouseEvent<HTMLSpanElement>) => {
    if (readOnly || !token.docTaskToken) return;
    useChipMenuStore.setState({
      editor,
      anchor: event.currentTarget,
      kind: token.docTaskToken,
    });
  };

  if (token.docTaskToken === "group" && token.docTaskGroupId != null) {
    return (
      <span
        data-doc-task-token="group"
        onClick={open}
        className="bg-hover text-ink-2 cursor-pointer rounded-[5px] px-[5px] py-px transition-shadow hover:shadow-[0_0_0_1.5px_var(--tau-accent)]"
      >
        <span
          aria-hidden
          className={cn(
            "mr-1 inline-block size-[7px] rounded-[2px] align-middle",
            groups?.dotClass(token.docTaskGroupId)
          )}
        />
        {children}
      </span>
    );
  }

  if (token.docTaskToken === "date" && token.docTaskDate) {
    const now = Date.now();
    const due = resolveDocTaskDue(token.docTaskDate, now);
    const overdue = due != null && dayDiff(due, now) < 0;
    const relative = due != null ? dayWord(due, now) : null;
    return (
      <span
        data-doc-task-token="date"
        onClick={open}
        className={cn(
          "cursor-pointer rounded-[5px] px-[5px] py-px transition-shadow hover:shadow-[0_0_0_1.5px_var(--tau-accent)]",
          overdue ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent-text"
        )}
      >
        {/* 原文文字必须原样可见：Slate 靠它映射光标与选区，不能隐藏或替换 */}
        {children}
        {relative && relative !== monthDay(due!) && (
          <span
            aria-hidden
            contentEditable={false}
            className="ml-1 select-none text-[0.85em] opacity-75"
          >
            {relative}
          </span>
        )}
      </span>
    );
  }

  return <>{children}</>;
}
