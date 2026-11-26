/**
 * 添加标签的选择面板：空输入列「最近用过」与「全部标签」（按使用次数），输入即按名称子串匹配；
 * 没有完全同名的标签时末行是「新建」。↑↓ 选、↵ 加上（面板不收，可连加）、Esc 收起。
 */

import { useTagsI18n } from "./i18n";
import { useMemo, useState } from "react";
import { Hash, Plus } from "lucide-react";
import { cn } from "@tau/ui";
import { matchTagSuggestions, type TagCount } from "@/utils/tags";

const RECENT_LIMIT = 3;

export interface TagPickerPanelProps {
  /** 已加上的标签（不再列出） */
  selected: string[];
  suggestions: TagCount[];
  onPick: (tag: string) => void;
}

type Option = { kind: "tag"; tag: string; count: number } | { kind: "create"; tag: string };

export function TagPickerPanel({ selected, suggestions, onPick }: TagPickerPanelProps) {
  const { t, locale } = useTagsI18n();
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const needle = query.trim();

  const { recent, rest, options } = useMemo(() => {
    const matched = matchTagSuggestions(suggestions, needle, selected);
    const recentTags = needle
      ? []
      : [...matched]
          .filter(item => item.lastUsedAt > 0)
          .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
          .slice(0, RECENT_LIMIT);
    const recentNames = new Set(recentTags.map(item => item.tag));
    const others = matched.filter(item => !recentNames.has(item.tag));
    const list: Option[] = [...recentTags, ...others].map(item => ({ kind: "tag", ...item }));
    const exists = needle && suggestions.some(item => item.tag === needle);
    if (needle && !exists && !selected.includes(needle)) list.push({ kind: "create", tag: needle });
    return { recent: recentTags.length, rest: others.length, options: list };
  }, [suggestions, needle, selected]);

  const active = Math.min(highlight, Math.max(options.length - 1, 0));
  const pick = (tag: string) => {
    onPick(tag);
    setQuery("");
    setHighlight(0);
  };

  const renderOption = (option: Option, index: number) => (
    <div
      key={`${option.kind}:${option.tag}`}
      role="option"
      aria-selected={index === active}
      onMouseEnter={() => setHighlight(index)}
      onMouseDown={event => event.preventDefault()}
      onClick={() => pick(option.tag)}
      className={cn(
        "text-tau-body flex h-8 cursor-pointer items-center gap-2 rounded-[8px] px-2",
        index === active && "bg-hover",
        option.kind === "create" && "text-accent-text"
      )}
    >
      {option.kind === "create" ? (
        <>
          <Plus className="size-[14px] shrink-0" strokeWidth={1.75} />
          <span className="truncate">{t("picker.create", { tag: option.tag })}</span>
        </>
      ) : (
        <>
          <Hash className="text-ink-3 size-[13px] shrink-0" strokeWidth={1.75} />
          <span className="text-ink-1 min-w-0 flex-1 truncate">{option.tag}</span>
          <span className="text-tau-sm text-ink-3 tabular-nums">
            {option.count.toLocaleString(locale)}
          </span>
        </>
      )}
    </div>
  );

  const caption = (text: string) => (
    <div className="text-tau-sm text-ink-3 px-2 pt-2 pb-1">{text}</div>
  );

  return (
    <div className="p-1.5">
      <label className="border-line-1 rounded-tau-sm mb-1 flex h-8 items-center gap-2 border px-2.5">
        <Hash className="text-ink-3 size-[14px] shrink-0" strokeWidth={1.75} />
        <input
          data-autofocus
          value={query}
          placeholder={t("picker.search")}
          aria-label={t("picker.search")}
          onChange={event => {
            setQuery(event.target.value);
            setHighlight(0);
          }}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const step = event.key === "ArrowDown" ? 1 : -1;
              const total = options.length;
              setHighlight(total ? (active + step + total) % total : 0);
            } else if (event.key === "Enter") {
              event.preventDefault();
              const option = options[active];
              if (option) pick(option.tag);
            }
          }}
          className="text-tau-body placeholder:text-ink-3 min-w-0 flex-1 bg-transparent outline-none"
        />
      </label>
      <div role="listbox" aria-label={t("picker.tags")} className="max-h-[280px] overflow-y-auto">
        {recent > 0 && caption(t("picker.recent"))}
        {options.slice(0, recent).map(renderOption)}
        {recent > 0 && rest > 0 && caption(t("picker.all"))}
        {options.slice(recent).map((option, index) => renderOption(option, recent + index))}
        {!options.length && (
          <p className="text-tau-meta text-ink-3 px-2 py-2.5">
            {t(needle ? "picker.added" : "picker.empty")}
          </p>
        )}
      </div>
      <div className="text-tau-sm text-ink-3 flex items-center gap-3 px-2 pt-1.5 pb-0.5">
        <span>{t("picker.select")}</span>
        <span>{t("picker.add")}</span>
        <span className="ml-auto">{t("picker.close")}</span>
      </div>
    </div>
  );
}
