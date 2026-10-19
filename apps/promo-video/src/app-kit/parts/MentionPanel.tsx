/**
 * 双链面板：输入 [[ 弹出，结构摘自 editor-extensions/content-link/components/MentionPanel 与 shared/ComposerPanel。
 */
import { FolderOpen, Newspaper, Search, StickyNote } from "lucide-react";
import clsx from "clsx";

const KIND_ICON = { card: StickyNote, article: Newspaper, "project-item": FolderOpen } as const;
const KIND_LABEL = { card: "卡片", article: "文章", "project-item": "项目文档" } as const;

export type MentionItem = { kind: keyof typeof KIND_ICON; title: string; excerpt: string };

function Highlight({ text, query }: { text: string; query: string }) {
  const at = query ? text.indexOf(query) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="text-accent-text">{query}</span>
      {text.slice(at + query.length)}
    </>
  );
}

function Kbd({ children }: { children: string }) {
  return <span className="border-line-1 bg-surface font-tau-mono text-ink-2 inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] border px-[5px] text-[11px]">{children}</span>;
}

export function MentionPanel({ query, items, active = 0 }: { query: string; items: MentionItem[]; active?: number }) {
  return (
    <div className="bg-surface border-line-1 shadow-float text-ink-1 flex w-[320px] flex-col overflow-hidden rounded-[16px] border">
      <div className="text-tau-body text-ink-1 flex items-center gap-2 px-3.5 pt-3 pb-1">
        <Search size={15} className="text-ink-3" strokeWidth={1.75} />
        {query ? (
          <span>
            [[<span className="text-accent-text">{query}</span>
          </span>
        ) : (
          <span className="text-ink-3">最近内容</span>
        )}
      </div>
      <div className="max-h-[320px] min-h-0 overflow-hidden p-1.5">
        {items.map((item, i) => {
          const Icon = KIND_ICON[item.kind];
          return (
            <div key={item.title} className={clsx("text-tau-body flex h-[38px] items-center gap-2.5 rounded-[10px] px-2.5", i === active && "bg-hover")}>
              <span className="border-line-1 bg-surface text-ink-2 grid size-[26px] shrink-0 place-items-center rounded-[8px] border [&_svg]:size-3.5">
                <Icon strokeWidth={1.75} />
              </span>
              <span className="max-w-[65%] min-w-0 shrink-0 truncate">
                <Highlight text={item.title} query={query} />
              </span>
              <span className="text-tau-sm text-ink-3 min-w-0 flex-1 truncate">
                <span className="text-ink-2">{KIND_LABEL[item.kind]}</span> · {item.excerpt}
              </span>
            </div>
          );
        })}
      </div>
      <div className="text-tau-tiny text-ink-3 flex flex-wrap items-center gap-x-3.5 gap-y-1 bg-[color-mix(in_srgb,var(--tau-bg-page)_45%,var(--tau-bg-surface))] px-3.5 py-2">
        <span className="inline-flex items-center gap-1">
          <Kbd>↑↓</Kbd> 选择
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Enter</Kbd> 引用
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Esc</Kbd> 关闭
        </span>
      </div>
    </div>
  );
}
