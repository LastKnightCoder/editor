/**
 * 五分钟上手：在「新建卡片」弹窗里写一句、输入 @ 引用旧内容、加一个标签，保存后卡片落进卡片墙「今天」。
 * 弹窗按 features/cards 的 CreateCardDialog 与 components/AddTag 重建，卡片墙按 CardWallList / CardItemView 重建。
 */
import { useEffect, useRef, useState } from "react";
import { Check, FileText, Layers, Plus, RotateCcw, Search, X, type LucideIcon } from "lucide-react";
import { Button, Tag, cn } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";

interface Target {
  id: number;
  type: "卡片" | "文章";
  title: string;
}

const TARGETS: Target[] = [
  { id: 1, type: "文章", title: "Deep Work 读书笔记" },
  { id: 2, type: "卡片", title: "专注不是性格，是能力" },
  { id: 3, type: "卡片", title: "间隔重复的关键是间隔" },
];

const TYPE_ICON: Record<Target["type"], LucideIcon> = {
  卡片: Layers,
  文章: FileText,
};

type Piece = { kind: "text"; text: string } | { kind: "link"; target: Target };

const EXISTING = [
  {
    id: 11,
    text: "专注不是一种性格，而是一种可以练习的能力。像肌肉一样，越用越强。",
    tag: "读书/深度工作",
    links: 3,
  },
  {
    id: 12,
    text: "间隔重复的关键不是重复，而是间隔：在快要忘记的时候想起来，记得最牢。",
    tag: "读书/学习方法",
    links: 1,
  },
];

const plainOf = (pieces: Piece[]) =>
  pieces.map(piece => (piece.kind === "text" ? piece.text : piece.target.title)).join("");

function Step({ done, children }: { done: boolean; children: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 transition-colors duration-200",
        done ? "text-ok" : "text-ink-3"
      )}
    >
      <span
        className={cn(
          "grid size-4 place-items-center rounded-full border-[1.5px] transition-colors duration-200",
          done ? "bg-ok border-ok text-ink-inverse" : "border-line-2"
        )}
      >
        {done && <Check className="size-2.5" strokeWidth={3} />}
      </span>
      {children}
    </span>
  );
}

export default function FirstCardDemo() {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [warn, setWarn] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const at = draft.lastIndexOf("@");
  const query = at < 0 ? null : draft.slice(at + 1);
  const results =
    query === null ? [] : TARGETS.filter(target => !query || target.title.includes(query));
  useEffect(() => setActive(0), [query]);

  const body = plainOf(pieces) + draft;
  const linked = pieces.filter(piece => piece.kind === "link").length;
  const wrote = body.replace(/@\S*$/, "").trim().length > 0;

  const insert = (target: Target) => {
    const before = draft.slice(0, at);
    setPieces(list => [
      ...list,
      ...(before ? [{ kind: "text" as const, text: before }] : []),
      { kind: "link", target },
      { kind: "text", text: " " },
    ]);
    setDraft("");
    inputRef.current?.focus();
  };

  const commitTag = () => {
    const name = tagInput?.trim();
    if (name && !tags.includes(name)) setTags(list => [...list, name]);
    setTagInput(null);
  };

  const save = () => {
    if (!wrote) {
      setWarn(true);
      return;
    }
    if (draft && query === null) {
      setPieces(list => [...list, { kind: "text", text: draft }]);
      setDraft("");
    }
    setSaved(true);
  };

  const reset = () => {
    setPieces([]);
    setDraft("");
    setTags([]);
    setTagInput(null);
    setSaved(false);
  };

  useEffect(() => {
    if (!warn) return;
    const timer = setTimeout(() => setWarn(false), 2400);
    return () => clearTimeout(timer);
  }, [warn]);

  const savedText = plainOf(pieces).trim();

  return (
    <AppWindow active="cards" crumb="卡片库" height={430} paper={false}>
      <div className="bg-surface shadow-paper relative flex h-full flex-col overflow-hidden rounded-[12px]">
        <div className="mt-5 mb-2 flex h-10 shrink-0 items-center gap-3 px-6 max-sm:px-4">
          <h3 className="text-tau-title-lg font-semibold tracking-[-0.01em]">卡片库</h3>
          <span className="text-tau-meta text-ink-2 min-w-0 flex-1 truncate tabular-nums">
            共 <b className="text-ink-1 font-semibold">{EXISTING.length + (saved ? 1 : 0)}</b> 张
          </span>
          {saved ? (
            <Button size="sm" variant="secondary" icon={RotateCcw} onClick={reset}>
              再写一张
            </Button>
          ) : (
            <Button size="sm" variant="primary" icon={Plus}>
              新建卡片
            </Button>
          )}
        </div>

        <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-6 pb-5 max-sm:px-4">
          <div className="mb-3 flex items-center gap-2 pt-2">
            <b className="text-ink-2 text-[13px] font-semibold">今天</b>
            <span className="text-ink-3 text-[12px]">{EXISTING.length + (saved ? 1 : 0)} 张</span>
          </div>
          <div className="grid grid-cols-3 gap-3 max-md:grid-cols-2 max-sm:grid-cols-1">
            {saved && (
              <article className="bg-surface border-accent animate-doc-flash flex flex-col gap-2 rounded-[var(--tau-radius-md)] border p-[13px] pb-[11px]">
                <p className="text-tau-body line-clamp-3 min-h-[4.9em] leading-[1.65]">
                  {savedText}
                </p>
                <div className="flex min-w-0 items-center gap-1.5">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                    {tags[0] && <Tag>{tags[0]}</Tag>}
                    {tags.length > 1 && <Tag>+{tags.length - 1}</Tag>}
                  </div>
                  <span className="text-ink-3 flex shrink-0 items-center gap-2 text-[10.5px] tabular-nums">
                    {linked > 0 && <span className="text-info">{linked} 连接</span>}
                    <span>{savedText.length} 字</span>
                  </span>
                </div>
              </article>
            )}
            {EXISTING.map(card => (
              <article
                key={card.id}
                className="bg-surface border-line-1 flex flex-col gap-2 rounded-[var(--tau-radius-md)] border p-[13px] pb-[11px]"
              >
                <p className="text-tau-body line-clamp-3 min-h-[4.9em] leading-[1.65]">
                  {card.text}
                </p>
                <div className="flex min-w-0 items-center gap-1.5">
                  <div className="flex min-w-0 flex-1 items-center overflow-hidden">
                    <Tag>{card.tag}</Tag>
                  </div>
                  <span className="text-ink-3 flex shrink-0 items-center gap-2 text-[10.5px] tabular-nums">
                    <span className="text-info">{card.links} 连接</span>
                    <span>{card.text.length} 字</span>
                  </span>
                </div>
              </article>
            ))}
          </div>
          {saved && (
            <p className="text-tau-sm text-ink-3 animate-doc-in mt-4">
              它也会出现在「今日」的「最近编辑」里；被引用的那几篇，会记下这次引用。
            </p>
          )}
        </div>

        {!saved && (
          <div className="bg-overlay absolute inset-0 z-10 grid place-items-center p-5 backdrop-blur-[4px]">
            <div
              role="dialog"
              aria-label="新建卡片"
              className="bg-surface border-line-1 shadow-float text-ink-2 text-tau-body animate-doc-in relative flex w-[560px] max-w-full flex-col rounded-[var(--tau-radius-lg)] border"
            >
              <span className="text-ink-2 absolute top-3 right-3 grid size-[28px] place-items-center rounded-[8px]">
                <X className="size-[14px]" />
              </span>
              <div className="flex items-center gap-2 pt-[22px] pr-12 pl-6">
                <h4 className="text-ink-1 text-[16px] leading-[1.45] font-[650] tracking-[-0.01em]">
                  新建卡片
                </h4>
              </div>
              <div className="flex flex-col gap-3 px-6 pt-2 pb-[22px] max-sm:px-4">
                <div
                  className="text-tau-body-lg text-ink-1 min-h-[96px] cursor-text leading-[1.85]"
                  onClick={() => inputRef.current?.focus()}
                >
                  {pieces.map((piece, index) =>
                    piece.kind === "text" ? (
                      <span key={index}>{piece.text}</span>
                    ) : (
                      <span
                        key={index}
                        className="text-accent-text underline decoration-dotted decoration-[1.5px] underline-offset-[3px]"
                      >
                        {piece.target.title}
                      </span>
                    )
                  )}
                  <span className="relative inline-block">
                    <input
                      ref={inputRef}
                      value={draft}
                      size={Math.max(draft.length + 1, pieces.length ? 6 : 24)}
                      aria-label="卡片正文"
                      placeholder={
                        pieces.length || draft ? undefined : "写下此刻的想法，试试输入 @"
                      }
                      onChange={event => setDraft(event.target.value)}
                      onKeyDown={event => {
                        if (event.nativeEvent.isComposing) return;
                        if (query === null) {
                          if (event.key === "Enter" && draft) {
                            event.preventDefault();
                            setPieces(list => [...list, { kind: "text", text: draft }]);
                            setDraft("");
                          }
                          return;
                        }
                        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                          event.preventDefault();
                          const step = event.key === "ArrowDown" ? 1 : -1;
                          setActive(
                            index => (index + step + results.length) % Math.max(results.length, 1)
                          );
                        } else if (event.key === "Enter") {
                          event.preventDefault();
                          if (results[active]) insert(results[active]);
                        } else if (event.key === "Escape") {
                          event.preventDefault();
                          setDraft(value => value.slice(0, at) + value.slice(at + 1));
                        }
                      }}
                      className={cn(
                        "placeholder:text-ink-3 caret-accent bg-transparent outline-none select-text",
                        query !== null && "text-accent-text"
                      )}
                    />
                    {query !== null && (
                      <span className="bg-surface border-line-1 shadow-float text-ink-1 animate-doc-in absolute top-full left-0 z-20 mt-1 flex w-[300px] max-w-[calc(100vw-80px)] flex-col overflow-hidden rounded-[16px] border text-left leading-normal">
                        <span className="text-tau-body flex items-center gap-2 px-3.5 pt-3 pb-1">
                          <Search size={15} strokeWidth={1.75} className="text-ink-3 shrink-0" />
                          {query ? (
                            <span>
                              @<span className="text-accent-text">{query}</span>
                            </span>
                          ) : (
                            <span className="text-ink-3">最近内容</span>
                          )}
                        </span>
                        {results.length === 0 ? (
                          <span className="text-tau-sm text-ink-3 px-3.5 pt-3 pb-4">
                            没有找到相关内容
                          </span>
                        ) : (
                          <span className="flex flex-col p-1.5">
                            {results.map((target, index) => {
                              const Icon = TYPE_ICON[target.type];
                              return (
                                <span
                                  key={target.id}
                                  role="option"
                                  aria-selected={index === active}
                                  onMouseEnter={() => setActive(index)}
                                  onMouseDown={event => {
                                    event.preventDefault();
                                    insert(target);
                                  }}
                                  className={cn(
                                    "text-tau-body flex h-[38px] cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5",
                                    index === active && "bg-hover"
                                  )}
                                >
                                  <span className="border-line-1 bg-surface text-ink-2 grid size-[26px] shrink-0 place-items-center rounded-[8px] border [&_svg]:size-3.5">
                                    <Icon strokeWidth={1.75} />
                                  </span>
                                  <span className="min-w-0 flex-1 truncate">{target.title}</span>
                                  <span className="text-tau-sm text-ink-2 shrink-0">
                                    {target.type}
                                  </span>
                                </span>
                              );
                            })}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {tags.map(name => (
                    <Tag
                      key={name}
                      onRemove={() => setTags(list => list.filter(tag => tag !== name))}
                    >
                      {name}
                    </Tag>
                  ))}
                  <Tag
                    className="hover:bg-surface-hover hover:text-ink-1 cursor-pointer"
                    onClick={() => tagInput === null && setTagInput("")}
                  >
                    <span className="flex items-center gap-0.5 whitespace-nowrap">
                      <Plus aria-hidden className="size-3 shrink-0" strokeWidth={2} />
                      {tagInput === null ? (
                        "添加标签"
                      ) : (
                        <input
                          autoFocus
                          value={tagInput}
                          aria-label="标签名"
                          size={Math.max(tagInput.length + 1, 4)}
                          onChange={event => setTagInput(event.target.value)}
                          onBlur={commitTag}
                          onKeyDown={event => {
                            if (event.nativeEvent.isComposing) return;
                            if (event.key === "Enter") commitTag();
                            if (event.key === "Escape") setTagInput(null);
                          }}
                          className="bg-transparent outline-none select-text"
                        />
                      )}
                    </span>
                  </Tag>
                </div>
              </div>
              <div className="border-line-2 flex items-center gap-2 border-t px-6 py-[14px] max-sm:px-4">
                <div
                  className={cn(
                    "text-tau-sm flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1"
                  )}
                >
                  {warn ? (
                    <span className="text-warn">卡片内容为空</span>
                  ) : (
                    <>
                      <Step done={wrote}>写一句</Step>
                      <Step done={linked > 0}>@ 引用</Step>
                      <Step done={tags.length > 0}>加标签</Step>
                    </>
                  )}
                </div>
                <Button size="sm" variant="secondary" onClick={reset}>
                  取消
                </Button>
                <Button size="sm" variant="primary" onClick={save}>
                  保存
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppWindow>
  );
}
