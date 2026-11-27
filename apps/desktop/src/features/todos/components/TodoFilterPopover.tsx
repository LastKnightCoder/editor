/**
 * 待办页纸内筛选浮层与激活态 Chips 条：
 * 平时只在工具栏留一枚「筛选」按钮（零额外占位）；打开 Popover 可按优先级多选、按标签搜索多选，
 * 标签行悬停出 ⋯ 菜单复用重命名 / 删除弹窗。任一条件激活后，在快速添加栏下方展开紧凑 Chips 条。
 */

import { useMemo, useState } from "react";
import { Check, Hash, SlidersHorizontal, X } from "lucide-react";
import { Button, Popover, cn } from "@tau/ui";
import { TagRowCountSlot } from "@/components/AddTag/TagRowMenu";
import { useTagManage } from "@/components/AddTag/useTagManage";
import type { TagCount } from "@/utils/tags";
import type { TodoPriority } from "@/types";
import { todosTranslator, todosNumber, useTodosI18n } from "../i18n";
import { TODO_PRIORITIES } from "../model";
import { PRIORITY_TONE, PriorityIcon } from "./TodoBits";

const t = todosTranslator.t;

export function TodoFilterPopover({
  priorityFilters,
  tagFilters,
  tagCounts,
  onTogglePriority,
  onToggleTag,
  onClearAll,
  onRenameTag,
  onRemoveTag,
  onTagRenamed,
  onTagRemoved,
}: {
  priorityFilters: ReadonlySet<TodoPriority>;
  tagFilters: ReadonlySet<string>;
  tagCounts: TagCount[];
  onTogglePriority(priority: TodoPriority): void;
  onToggleTag(tag: string): void;
  onClearAll(): void;
  onRenameTag(from: string, to: string): Promise<void>;
  onRemoveTag(tag: string): Promise<void>;
  onTagRenamed?(from: string, to: string): void;
  onTagRemoved?(tag: string): void;
}) {
  useTodosI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const activeCount = priorityFilters.size + tagFilters.size;

  const existing = useMemo(
    () => tagCounts.map(item => ({ tag: item.tag, count: item.count })),
    [tagCounts]
  );

  const manage = useTagManage({
    existing,
    entity: "todo",
    hierarchical: false,
    rename: onRenameTag,
    remove: onRemoveTag,
    onRenamed: onTagRenamed,
    onRemoved: onTagRemoved,
  });

  const filteredTags = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? tagCounts.filter(item => item.tag.toLowerCase().includes(needle)) : tagCounts;
  }, [tagCounts, query]);

  return (
    <>
      <Popover
        open={open}
        onOpenChange={next => {
          setOpen(next);
          if (!next) setQuery("");
        }}
        placement="bottom-end"
        arrow={false}
        className="w-[300px]"
        trigger={
          <Button
            variant={activeCount > 0 || open ? "soft" : "ghost"}
            size="sm"
            icon={SlidersHorizontal}
            aria-pressed={activeCount > 0}
            className="shrink-0 whitespace-nowrap"
          >
            {activeCount > 0
              ? `${t("filter.button")} · ${todosNumber(activeCount)}`
              : t("filter.button")}
          </Button>
        }
      >
        <div className="p-3">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <span className="text-ink-1 text-[12.5px] font-semibold">{t("filter.title")}</span>
            {activeCount > 0 && (
              <button
                type="button"
                onClick={onClearAll}
                className="text-accent-text cursor-pointer text-[11.5px] hover:underline"
              >
                {t("filter.clear")}
              </button>
            )}
          </div>

          <div className="mb-3">
            <div className="text-ink-3 mb-1.5 text-[11.5px]">{t("priority.label")}</div>
            <div className="flex flex-wrap gap-1.5">
              {TODO_PRIORITIES.map(priority => {
                const on = priorityFilters.has(priority);
                return (
                  <button
                    key={priority}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onTogglePriority(priority)}
                    className={cn(
                      "ease-tau-out inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[8px] border px-2.5 text-[12px] outline-none transition-[background-color,border-color,color] duration-150 focus-visible:shadow-[var(--tau-focus-ring)]",
                      on
                        ? cn("border-transparent font-semibold", PRIORITY_TONE[priority].badge)
                        : "border-line-1 bg-surface text-ink-2 hover:bg-hover hover:text-ink-1"
                    )}
                  >
                    {priority !== "none" && (
                      <PriorityIcon priority={priority} className={PRIORITY_TONE[priority].text} />
                    )}
                    {t(`priority.${priority}`)}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-ink-3 mb-1.5 text-[11.5px]">{t("tags.label")}</div>
            {tagCounts.length > 0 && (
              <label className="border-line-1 rounded-tau-sm mb-1.5 flex h-8 items-center gap-1.5 border px-2.5">
                <Hash className="text-ink-3 size-[13px] shrink-0" strokeWidth={1.75} />
                <input
                  data-autofocus
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder={t("tags.search")}
                  aria-label={t("tags.search")}
                  className="text-tau-meta placeholder:text-ink-3 min-w-0 flex-1 bg-transparent outline-none"
                />
              </label>
            )}
            <div className="max-h-[200px] space-y-0.5 overflow-y-auto">
              {filteredTags.map(item => {
                const on = tagFilters.has(item.tag);
                return (
                  <div
                    key={item.tag}
                    className={cn(
                      "group/tag ease-tau-out flex h-8 items-center gap-1.5 rounded-[8px] pr-1 pl-2 transition-[background-color] duration-150",
                      on ? "bg-accent-soft" : "hover:bg-hover"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onToggleTag(item.tag)}
                      className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 text-left outline-none"
                    >
                      <span
                        className={cn(
                          "grid size-3.5 shrink-0 place-items-center rounded-[4px] border",
                          on
                            ? "border-accent bg-accent text-ink-inverse"
                            : "border-line-1 bg-surface text-transparent"
                        )}
                      >
                        <Check className="size-2.5" strokeWidth={3} />
                      </span>
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-[12.5px]",
                          on ? "text-accent-text font-medium" : "text-ink-1"
                        )}
                      >
                        #{item.tag}
                      </span>
                    </button>
                    <TagRowCountSlot
                      count={item.count}
                      label={item.tag}
                      onRename={() => {
                        setOpen(false);
                        manage.startRename({ tag: item.tag, count: item.count });
                      }}
                      onDelete={() => {
                        setOpen(false);
                        manage.startDelete({ tag: item.tag, count: item.count });
                      }}
                    />
                  </div>
                );
              })}
              {filteredTags.length === 0 && (
                <p className="text-ink-3 px-2 py-3 text-center text-[12px]">
                  {tagCounts.length === 0 ? t("tags.empty") : t("tags.noMatch")}
                </p>
              )}
            </div>
          </div>
        </div>
      </Popover>
      {manage.dialogs}
    </>
  );
}

export function ActiveFilterStrip({
  priorityFilters,
  tagFilters,
  onTogglePriority,
  onToggleTag,
  onClearAll,
}: {
  priorityFilters: ReadonlySet<TodoPriority>;
  tagFilters: ReadonlySet<string>;
  onTogglePriority(priority: TodoPriority): void;
  onToggleTag(tag: string): void;
  onClearAll(): void;
}) {
  useTodosI18n();
  if (priorityFilters.size === 0 && tagFilters.size === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 pb-2.5 text-[11.5px]">
      <span className="text-ink-3">{t("filter.active")}：</span>
      {TODO_PRIORITIES.filter(p => priorityFilters.has(p)).map(priority => (
        <button
          key={priority}
          type="button"
          onClick={() => onTogglePriority(priority)}
          className={cn(
            "inline-flex h-[22px] cursor-pointer items-center gap-1 rounded-full px-2 text-[11.5px] font-medium outline-none focus-visible:shadow-[var(--tau-focus-ring)]",
            PRIORITY_TONE[priority].badge
          )}
        >
          {priority !== "none" && <PriorityIcon priority={priority} className="size-[10px]" />}
          {t("filter.priorityChip", { level: t(`priority.${priority}`) })}
          <X className="size-[11px] opacity-75" strokeWidth={2} />
        </button>
      ))}
      {[...tagFilters].map(tag => (
        <button
          key={tag}
          type="button"
          onClick={() => onToggleTag(tag)}
          className="bg-accent-soft text-accent-text inline-flex h-[22px] max-w-[14em] cursor-pointer items-center gap-1 rounded-full px-2.5 text-[11.5px] font-medium outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
        >
          <span className="truncate">#{tag}</span>
          <X className="size-[11px] shrink-0 opacity-75" strokeWidth={2} />
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="text-accent-text ml-1 cursor-pointer text-[11.5px] hover:underline"
      >
        {t("filter.clear")}
      </button>
    </div>
  );
}
