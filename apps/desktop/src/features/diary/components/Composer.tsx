/**
 * 输入条（方案 C 的聊天式输入，D-044）：停靠在纸底，左侧与日期列对齐「此刻 HH:mm」。
 * ↵ 发送、⇧↵ 换行（输入法组合中不发送）；`#` 触发标签联想（↑↓ / ↵ / Tab / Esc），
 * 正文里残留的 `#词` 发送时也提取为标签；在标签频道里预置该标签。
 * 纯文本快写——富文本在发出后点正文用完整编辑器补（D-044 默认取舍）。
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Hash, Plus, SendHorizontal } from "lucide-react";
import { IconButton, Tag, cn, type TagColor } from "@tau/ui";
import { formatTime, hashQueryAt, type DiaryTag } from "../model";
import { TagPicker } from "./TagPicker";
import { TagDot } from "./bits";

export interface ComposerHandle {
  focus: () => void;
}

interface ComposerProps {
  now: number;
  tags: DiaryTag[];
  counts: Map<string, number>;
  /** 标签频道：预置进已选标签（输入条里看得见、可删，不再另起提示） */
  scopeTag: string | null;
  onSubmit: (input: { text: string; tags: string[] }) => Promise<unknown>;
  onRecolor: (name: string, color: TagColor) => void;
  onClearTag: (name: string) => void;
  /** 输入条上方的一行（那年今日预告） */
  above?: React.ReactNode;
}

const INLINE_TAG = /(^|\s)#([^\s#]+)(?=\s|$)/g;

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { now, tags, counts, scopeTag, onSubmit, onRecolor, onClearTag, above },
  ref
) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [chosen, setChosen] = useState<string[]>(scopeTag ? [scopeTag] : []);
  const [caret, setCaret] = useState(0);
  const [suggestIndex, setSuggestIndex] = useState(0);
  const [suggestClosed, setSuggestClosed] = useState(false);
  const [sending, setSending] = useState(false);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  // 切换频道：预置标签跟着换（不清正文）
  useEffect(() => {
    setChosen(scopeTag ? [scopeTag] : []);
  }, [scopeTag]);

  // 自动增高（上限 200，超出内部滚动）
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const hash = hashQueryAt(text, caret);
  const suggestions = useMemo(() => {
    if (!hash || suggestClosed) return [];
    const q = hash.query.toLowerCase();
    const hits = tags
      .filter(t => !chosen.includes(t.name) && t.name.toLowerCase().includes(q))
      .slice(0, 6)
      .map(t => ({ name: t.name, color: t.color, create: false }));
    const creatable = hash.query && !tags.some(t => t.name === hash.query);
    return creatable
      ? [...hits, { name: hash.query, color: "gray" as TagColor, create: true }]
      : hits;
  }, [hash, suggestClosed, tags, chosen]);
  const suggestOpen = suggestions.length > 0;
  const active = Math.min(suggestIndex, Math.max(0, suggestions.length - 1));

  const pick = (name: string) => {
    if (!hash) return;
    const next = text.slice(0, hash.start) + text.slice(caret);
    setText(next);
    setChosen(prev => (prev.includes(name) ? prev : [...prev, name]));
    setSuggestIndex(0);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(hash.start, hash.start);
      setCaret(hash.start);
    });
  };

  const submit = async () => {
    if (sending) return;
    const inline: string[] = [];
    const body = text
      .replace(INLINE_TAG, (_, lead: string, name: string) => {
        inline.push(name);
        return lead;
      })
      .trim();
    if (!body) return;
    setSending(true);
    try {
      await onSubmit({ text: body, tags: [...new Set([...chosen, ...inline])] });
      setText("");
      setChosen(scopeTag ? [scopeTag] : []);
      setCaret(0);
    } finally {
      setSending(false);
    }
  };

  const canSend = text.trim().length > 0 && !sending;
  const count = text.replace(/\s/g, "").length;

  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-[22px]">
      <div className={cn(above ? "pt-[46px]" : "pt-2.5")}>
        <b className="text-tau-body block font-semibold">此刻</b>
        <span className="text-tau-meta text-ink-3 font-tau-mono tabular-nums">
          {formatTime(now)}
        </span>
      </div>
      <div className="min-w-0">
        {/* 预告行：有内容才占位（多数日子没有往年同日，不留空行） */}
        {above && <div className="-mx-3.5 mb-1.5">{above}</div>}
        <div
          className={cn(
            "bg-surface ease-tau-out relative -mx-3.5 rounded-[14px] px-3.5 pb-2 pt-2.5 shadow-[0_0_0_1px_var(--tau-line-1)] transition-[box-shadow] duration-[160ms]",
            "focus-within:shadow-[0_0_0_1px_var(--tau-accent),var(--tau-focus-ring)]"
          )}
        >
          {suggestOpen && (
            <div
              role="listbox"
              aria-label="标签联想"
              className="bg-surface border-line-1 shadow-float rounded-tau-md absolute bottom-full left-0 z-10 mb-2 min-w-[200px] p-1.5"
            >
              <div className="text-tau-sm text-ink-3 px-2 pb-1 pt-0.5">标签</div>
              {suggestions.map((s, i) => (
                <div
                  key={s.name + s.create}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={e => {
                    e.preventDefault();
                    pick(s.name);
                  }}
                  onMouseEnter={() => setSuggestIndex(i)}
                  className={cn(
                    "text-tau-body flex h-8 cursor-pointer items-center gap-2.5 rounded-[8px] px-2",
                    i === active && "bg-hover",
                    s.create && "text-accent-text"
                  )}
                >
                  {s.create ? (
                    <Plus className="size-[14px]" strokeWidth={1.75} />
                  ) : (
                    <TagDot color={s.color} />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {s.create ? `创建「${s.name}」` : s.name}
                  </span>
                  {!s.create && (
                    <span className="text-tau-sm text-ink-3 tabular-nums">
                      {counts.get(s.name) ?? 0}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            aria-label="写一条碎碎念"
            placeholder="此刻在想什么？"
            onChange={e => {
              setText(e.target.value);
              setCaret(e.target.selectionStart);
              setSuggestClosed(false);
            }}
            onSelect={e => setCaret(e.currentTarget.selectionStart)}
            onBlur={() => setSuggestClosed(true)}
            onFocus={() => setSuggestClosed(false)}
            onKeyDown={e => {
              if (e.nativeEvent.isComposing) return;
              if (suggestOpen) {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  const step = e.key === "ArrowDown" ? 1 : -1;
                  setSuggestIndex((active + step + suggestions.length) % suggestions.length);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  pick(suggestions[active].name);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setSuggestClosed(true);
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            className="text-tau-body-lg placeholder:text-ink-3 block max-h-[200px] w-full resize-none bg-transparent leading-[1.75] outline-none"
          />
          <div className="mt-1.5 flex min-h-7 items-center gap-1.5">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
              {chosen.map(name => (
                <Tag
                  key={name}
                  color={tags.find(t => t.name === name)?.color ?? "gray"}
                  onRemove={() => setChosen(prev => prev.filter(t => t !== name))}
                >
                  {name}
                </Tag>
              ))}
              <TagPicker
                placement="top-start"
                selected={chosen}
                onChange={setChosen}
                tags={tags}
                counts={counts}
                onRecolor={onRecolor}
                onClear={onClearTag}
                trigger={
                  <button
                    type="button"
                    className="text-tau-sm text-ink-3 border-line-1 hover:text-ink-1 hover:border-ink-3 inline-flex h-[22px] shrink-0 items-center gap-1 rounded-[7px] border border-dashed px-2"
                  >
                    <Hash className="size-3" strokeWidth={1.75} />
                    标签
                  </button>
                }
              />
            </div>
            {count > 0 && <span className="text-tau-sm text-ink-3 tabular-nums">{count} 字</span>}
            <IconButton
              title="发送 (↵)"
              disabled={!canSend}
              onClick={() => void submit()}
              className={cn(
                "size-7 rounded-[9px]",
                canSend ? "bg-accent text-ink-inverse hover:bg-accent-hover" : "text-ink-3"
              )}
            >
              <SendHorizontal className="size-[15px]" strokeWidth={1.75} />
            </IconButton>
          </div>
        </div>
        <div className="text-tau-sm text-ink-3 -mx-3.5 px-0.5 pt-1.5">
          <span>↵ 发送 · ⇧↵ 换行 · # 标签</span>
        </div>
      </div>
    </div>
  );
});
