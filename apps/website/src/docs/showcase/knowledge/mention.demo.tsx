/**
 * 引用其他内容：正文里输入 @ 弹出引用面板，边打字边过滤，↑↓ 选择、回车插入点线链接；
 * 悬停链接看到预览卡。面板按 content-link 的 MentionPanel 与 ComposerPanel 重建。
 */
import { useEffect, useRef, useState } from "react";
import { FileText, Folder, Layers, Search, type LucideIcon } from "lucide-react";
import { cn } from "@tau/ui";

interface Target {
  id: number;
  type: "卡片" | "文章" | "项目文档";
  title: string;
  snippet: string;
}

const TARGETS: Target[] = [
  {
    id: 1,
    type: "卡片",
    title: "间隔重复的关键是间隔",
    snippet: "在快要忘记的时候想起来，记得最牢",
  },
  {
    id: 2,
    type: "文章",
    title: "Deep Work 读书笔记",
    snippet: "深度工作是一种越来越稀缺的能力",
  },
  {
    id: 3,
    type: "卡片",
    title: "费曼技巧",
    snippet: "讲给外行听，讲不清就是没懂",
  },
  {
    id: 4,
    type: "项目文档",
    title: "学习方法 / 主动回忆",
    snippet: "合上书，试着把刚读的复述一遍",
  },
];

const TYPE_ICON: Record<Target["type"], LucideIcon> = {
  卡片: Layers,
  文章: FileText,
  项目文档: Folder,
};

type Piece = { kind: "text"; text: string } | { kind: "link"; target: Target };

function highlight(text: string, query: string) {
  const at = query ? text.indexOf(query) : -1;
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <span className="text-accent-text">{text.slice(at, at + query.length)}</span>
      {text.slice(at + query.length)}
    </>
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <span className="border-line-1 bg-surface font-tau-mono text-ink-2 inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] border px-[5px] text-[11px] leading-none">
      {children}
    </span>
  );
}

function LinkChip({ target }: { target: Target }) {
  const [hover, setHover] = useState(false);
  return (
    <span
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span className="text-accent-text cursor-pointer underline decoration-dotted decoration-[1.5px] underline-offset-[3px]">
        {target.title}
      </span>
      {hover && (
        <span className="bg-surface border-line-1 shadow-float animate-doc-in absolute top-full left-0 z-10 mt-1.5 flex w-[260px] flex-col gap-1.5 rounded-[14px] border p-3.5 text-left">
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-[5px] px-1.5 text-[10.5px] leading-[18px]",
                target.type === "文章" ? "bg-info-soft text-info" : "bg-ok-soft text-ok"
              )}
            >
              {target.type}
            </span>
            <span className="text-ink-3 text-tau-tiny">3 天前编辑</span>
          </span>
          <b className="text-tau-body font-semibold">{target.title}</b>
          <span className="text-ink-2 text-tau-sm leading-relaxed">{target.snippet}……</span>
          <span className="text-accent-text text-tau-sm mt-0.5 font-medium">打开</span>
        </span>
      )}
    </span>
  );
}

export default function MentionDemo() {
  const [pieces, setPieces] = useState<Piece[]>([
    {
      kind: "text",
      text: "复习效率低，可能是因为一直在重读，而不是在回忆。参考 ",
    },
  ]);
  /** 正文末尾正在输入的文字；含 @ 时 @ 之后是查询词 */
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const at = draft.lastIndexOf("@");
  const query = at < 0 ? null : draft.slice(at + 1);
  const results =
    query === null
      ? []
      : TARGETS.filter(
          target => !query || target.title.includes(query) || target.snippet.includes(query)
        );

  useEffect(() => setActive(0), [query]);

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

  return (
    <div className="border-line-1 bg-surface shadow-card relative rounded-[16px] border px-7 pt-6 pb-28 max-sm:px-4">
      <p className="text-ink-3 text-tau-tiny mb-3">卡片 · 复习为什么没用</p>
      <div className="text-tau-body-lg leading-[1.85]" onClick={() => inputRef.current?.focus()}>
        {pieces.map((piece, index) =>
          piece.kind === "text" ? (
            <span key={index}>{piece.text}</span>
          ) : (
            <LinkChip key={index} target={piece.target} />
          )
        )}
        <span className="relative inline-block">
          <input
            ref={inputRef}
            value={draft}
            size={Math.max(draft.length + 1, 14)}
            aria-label="在正文里输入 @ 引用内容"
            placeholder={draft ? undefined : "在这里输入 @"}
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
                setActive(index => (index + step + results.length) % Math.max(results.length, 1));
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
            <span className="bg-surface border-line-1 shadow-float text-ink-1 animate-doc-in absolute top-full left-0 z-20 mt-1 flex w-[340px] max-w-[calc(100vw-64px)] flex-col overflow-hidden rounded-[16px] border text-left leading-normal">
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
                <span className="text-tau-sm text-ink-3 px-3.5 pt-3 pb-4">没有找到相关内容</span>
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
                        <span className="max-w-[65%] min-w-0 shrink-0 truncate">
                          {highlight(target.title, query)}
                        </span>
                        <span className="text-tau-sm text-ink-3 min-w-0 flex-1 truncate">
                          <span className="text-ink-2">{target.type}</span> · {target.snippet}
                        </span>
                      </span>
                    );
                  })}
                </span>
              )}
              <span className="text-tau-tiny text-ink-3 flex items-center gap-3.5 bg-[color-mix(in_srgb,var(--tau-bg-page)_45%,var(--tau-bg-surface))] px-3.5 py-2">
                <span className="inline-flex items-center gap-1.5">
                  <Kbd>↑↓</Kbd>选择
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Kbd>Enter</Kbd>引用
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Kbd>Esc</Kbd>关闭
                </span>
              </span>
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
