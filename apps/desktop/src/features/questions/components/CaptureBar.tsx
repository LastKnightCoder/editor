/**
 * 快速收集：一行输入，回车收集；「#分组」指定分组（全名或前缀），不写落当前分组。
 * 右侧实时预览将落入的分组，输入框聚焦时显示回车提示。
 */

import { useState, type Ref } from "react";
import { Plus } from "lucide-react";
import { cn, toast } from "@tau/ui";
import type { QuestionGroupDTO } from "@/commands/question-group";
import { matchGroup, parseCapture } from "../capture";
import { GroupDot } from "./QuestionBits";

export function CaptureBar({
  groups,
  fallbackGroup,
  onSubmit,
  inputRef,
}: {
  groups: QuestionGroupDTO[];
  /** 未写 #分组 时落入的分组（当前筛选的分组，全部时为默认分组） */
  fallbackGroup: QuestionGroupDTO | undefined;
  onSubmit(title: string, groupHint: string | null): Promise<void>;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const parsed = parseCapture(text);
  const target = matchGroup(groups, parsed.groupHint) ?? fallbackGroup;

  const submit = async () => {
    if (!parsed.title || busy) return;
    setBusy(true);
    try {
      // 未写 #分组 时显式指向当前分组，而非交给主进程落默认分组
      await onSubmit(parsed.title, parsed.groupHint ?? fallbackGroup?.title ?? null);
      setText("");
    } catch {
      toast.error("收集失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "bg-surface border-line-1 group/cap flex h-10 flex-none items-center gap-2.5 rounded-[12px] border pl-3 pr-2.5",
        "ease-tau-out transition-[border-color,box-shadow] duration-150",
        "focus-within:border-accent focus-within:shadow-[var(--tau-focus-ring)]"
      )}
    >
      <Plus
        className="text-ink-3 group-focus-within/cap:text-accent-text size-[15px] shrink-0"
        strokeWidth={1.75}
      />
      <input
        ref={inputRef}
        value={text}
        disabled={busy}
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
        placeholder="记下一个问题… 回车收集，#分组 指定分组"
        aria-label="快速收集问题"
        className="text-tau-body placeholder:text-ink-3 min-w-0 flex-1 bg-transparent outline-none"
      />
      {target && (
        <span className="text-ink-2 flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[12px]">
          <GroupDot color={target.color} />
          {target.title}
        </span>
      )}
      <kbd className="bg-hover text-ink-2 rounded-[5px] px-[5px] py-0.5 font-mono text-[11px] opacity-0 transition-opacity duration-150 group-focus-within/cap:opacity-100">
        ⏎
      </kbd>
    </div>
  );
}
