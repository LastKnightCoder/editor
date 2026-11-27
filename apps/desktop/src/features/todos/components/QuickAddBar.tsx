/**
 * 自然语言快速添加：一行输入实时解析（quickAdd.ts），识别结果以 chips 回显，回车创建。
 * 支持自然语言设置优先级（!高/!中/!低/p1/p2/p3）与标签（@标签），也在输入行右侧提供轻点入口；
 * 没写 #项目 时落到当前项目，全部视图下落到第一个项目。
 */

import { useMemo, useState, type Ref } from "react";
import { Clock, Flag, Hash, List, Repeat, Sparkles, X } from "lucide-react";
import { Menu, Popover, cn } from "@tau/ui";
import { TagPickerPanel } from "@/components/AddTag/TagPickerPanel";
import type { TodoGroup, TodoPriority } from "@/types";
import type { TagCount } from "@/utils/tags";
import { parseQuickAdd, quickAddKind, type QuickAddResult } from "../quickAdd";
import { useQuickAddI18n } from "@/features/shared/quick-add/i18n";
import { describeTodoQuickAdd } from "@/features/shared/quick-add/format";
import { todosTranslator, useTodosI18n } from "../i18n";
import { TODO_PRIORITIES } from "../model";
import { GroupDot, PRIORITY_TONE, PriorityBadge, PriorityIcon, TodoTagChip } from "./TodoBits";

const tt = todosTranslator.t;

const TOKEN_CLASS = {
  normal: "bg-hover text-ink-1",
  deadline: "bg-warn-soft text-ink-1 [&_svg]:text-warn",
  scheduled: "bg-info-soft text-ink-1 [&_svg]:text-info",
  recurring: "bg-ok-soft text-ink-1 [&_svg]:text-ok",
} as const;

export function QuickAddBar({
  groups,
  fallbackGroupId,
  now,
  tagSuggestions = [],
  onSubmit,
  inputRef,
}: {
  groups: TodoGroup[];
  fallbackGroupId: number | null;
  now: number;
  tagSuggestions?: TagCount[];
  onSubmit(parsed: QuickAddResult, groupId: number): Promise<void>;
  inputRef?: Ref<HTMLInputElement>;
}) {
  useTodosI18n();
  const { t } = useQuickAddI18n();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [manualPriority, setManualPriority] = useState<TodoPriority>("none");
  const [manualTags, setManualTags] = useState<string[]>([]);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);

  const rawParsed = useMemo(
    () => (text.trim() ? parseQuickAdd(text, { now, groups }) : null),
    [text, now, groups]
  );

  const parsed = useMemo<QuickAddResult | null>(() => {
    if (!rawParsed) return null;
    const priority = rawParsed.priority !== "none" ? rawParsed.priority : manualPriority;
    const tags = [...new Set([...manualTags, ...rawParsed.tags])];
    return { ...rawParsed, priority, tags };
  }, [rawParsed, manualPriority, manualTags]);

  const groupId = parsed?.groupId ?? fallbackGroupId;
  const group = groups.find(g => g.id === groupId);
  const disabled = groups.length === 0;
  const activePriority = parsed?.priority ?? manualPriority;
  const activeTags = parsed?.tags ?? manualTags;

  const submit = async () => {
    if (!parsed?.title || groupId == null || busy) return;
    setBusy(true);
    try {
      await onSubmit(parsed, groupId);
      setText("");
      setManualPriority("none");
      setManualTags([]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-line-1 focus-within:shadow-lift ease-tau-out mb-3 flex flex-none flex-col rounded-[14px] border transition-[box-shadow,border-color] duration-150 focus-within:border-transparent">
      <div className="flex h-11 items-center gap-2 pr-2 pl-3.5">
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
          placeholder={disabled ? t("todo.noGroup") : t("todo.placeholder")}
          className="text-tau-body-lg placeholder:text-ink-3 min-w-0 flex-1 bg-transparent outline-none"
        />

        {!disabled && (
          <div className="flex shrink-0 items-center gap-0.5">
            <Menu
              align="end"
              trigger={
                <button
                  type="button"
                  aria-label={tt("quickAdd.priorityHint")}
                  title={tt("quickAdd.priorityHint")}
                  className={cn(
                    "ease-tau-out inline-flex h-7 cursor-pointer items-center gap-1 rounded-[8px] px-2 text-[12px] outline-none transition-[background-color,color] duration-150 focus-visible:shadow-[var(--tau-focus-ring)]",
                    activePriority !== "none"
                      ? cn("font-medium", PRIORITY_TONE[activePriority].badge)
                      : "text-ink-3 hover:bg-hover hover:text-ink-1"
                  )}
                >
                  <PriorityIcon
                    priority={activePriority === "none" ? "high" : activePriority}
                    className="size-3"
                  />
                  {activePriority !== "none" && <span>{tt(`priority.${activePriority}`)}</span>}
                </button>
              }
            >
              <Menu.Group>{tt("priority.label")}</Menu.Group>
              <Menu.RadioGroup
                value={manualPriority}
                onValueChange={value => setManualPriority(value as TodoPriority)}
              >
                {TODO_PRIORITIES.map(priority => (
                  <Menu.RadioItem
                    key={priority}
                    value={priority}
                    icon={
                      <PriorityIcon
                        priority={priority}
                        className={cn("size-3", PRIORITY_TONE[priority].text)}
                      />
                    }
                  >
                    {tt(`priority.full.${priority}`)}
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu>

            <Popover
              open={tagPickerOpen}
              onOpenChange={setTagPickerOpen}
              placement="bottom-end"
              arrow={false}
              className="w-[260px]"
              trigger={
                <button
                  type="button"
                  aria-label={tt("quickAdd.tagHint")}
                  title={tt("quickAdd.tagHint")}
                  className={cn(
                    "ease-tau-out inline-flex h-7 cursor-pointer items-center gap-1 rounded-[8px] px-2 text-[12px] outline-none transition-[background-color,color] duration-150 focus-visible:shadow-[var(--tau-focus-ring)]",
                    activeTags.length > 0
                      ? "bg-accent-soft text-accent-text font-medium"
                      : "text-ink-3 hover:bg-hover hover:text-ink-1"
                  )}
                >
                  <Hash className="size-[13px]" strokeWidth={1.75} />
                  {activeTags.length > 0 && (
                    <span className="text-[11px] tabular-nums">{activeTags.length}</span>
                  )}
                </button>
              }
            >
              {tagPickerOpen && (
                <TagPickerPanel
                  selected={activeTags}
                  suggestions={tagSuggestions}
                  onPick={tag =>
                    setManualTags(prev => (prev.includes(tag) ? prev : [...prev, tag]))
                  }
                />
              )}
            </Popover>
          </div>
        )}

        <span className="text-ink-3 flex shrink-0 items-center gap-1.5 pl-0.5 text-[11px]">
          {parsed ? (
            <>
              {t("todo.enter")}
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
      {(parsed || manualPriority !== "none" || manualTags.length > 0) && (
        <div className="text-ink-3 flex flex-wrap items-center gap-1.5 pr-3.5 pb-2.5 pl-10 text-[11.5px]">
          {t("todo.parsed")}
          {parsed && <ParsedToken parsed={parsed} now={now} />}
          {activePriority !== "none" && <PriorityBadge priority={activePriority} />}
          {activeTags.map(tag =>
            manualTags.includes(tag) ? (
              <button
                key={tag}
                type="button"
                onClick={() => setManualTags(prev => prev.filter(x => x !== tag))}
                className="border-line-1 bg-surface text-ink-2 hover:text-ink-1 inline-flex h-[19px] cursor-pointer items-center gap-1 rounded-full border px-[7px] text-[11px] leading-none"
              >
                <span>#{tag}</span>
                <X className="size-2.5 opacity-70" strokeWidth={2} />
              </button>
            ) : (
              <TodoTagChip key={tag} tag={tag} />
            )
          )}
          {parsed && group && (
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
          {parsed && (
            <span className="ml-1.5">
              {t("todo.title", { title: "\uFFFC" })
                .split("\uFFFC")
                .map((part, index) => (
                  <span key={index}>
                    {index > 0 && (
                      <b className="text-ink-1 font-medium">{parsed.title || t("todo.empty")}</b>
                    )}
                    {part}
                  </span>
                ))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const TOKEN_ICON = { normal: List, deadline: Flag, scheduled: Clock, recurring: Repeat } as const;

function ParsedToken({ parsed, now }: { parsed: QuickAddResult; now: number }) {
  const language = useQuickAddI18n();
  const kind = quickAddKind(parsed);
  const Icon = TOKEN_ICON[kind];
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-[6px] px-2 [&_svg]:size-3",
        TOKEN_CLASS[kind]
      )}
    >
      <Icon strokeWidth={1.75} />
      {describeTodoQuickAdd(parsed, now, language)}
    </span>
  );
}
