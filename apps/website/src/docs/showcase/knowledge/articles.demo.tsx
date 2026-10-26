/**
 * 文章列表：带封面的网格，按月分段，标题搜索实时过滤。
 * 结构按 features/articles 的 ArticlesView 与 ArticleCard 重建。
 */
import { useState } from "react";
import { ChevronDown, Plus, Search, Star } from "lucide-react";
import { Button, cn } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";

interface Article {
  id: number;
  title: string;
  summary: string;
  tags: string[];
  date: string;
  words: number;
  month: string;
  /** 封面渐变，用主题里的标签色 */
  cover: [string, string];
  pinned?: boolean;
}

const ARTICLES: Article[] = [
  {
    id: 1,
    title: "为什么你总是很忙却没做成事",
    summary: "浅层工作给人一种很忙的错觉，真正的进展来自整块的专注时间。",
    tags: ["专注"],
    date: "10-26",
    words: 1280,
    month: "置顶",
    cover: ["var(--tau-accent)", "var(--tau-tag-4)"],
    pinned: true,
  },
  {
    id: 2,
    title: "Deep Work 读书笔记",
    summary: "四条规则：工作要深入、拥抱无聊、远离社交媒体、摒弃浮浅。",
    tags: ["读书"],
    date: "10-21",
    words: 3460,
    month: "十月",
    cover: ["var(--tau-tag-1)", "var(--tau-tag-2)"],
  },
  {
    id: 3,
    title: "用间隔重复学一门新语言",
    summary: "三个月、每天二十分钟，我是怎么用闪卡把词汇量翻倍的。",
    tags: ["学习方法"],
    date: "10-12",
    words: 2190,
    month: "十月",
    cover: ["var(--tau-tag-3)", "var(--tau-tag-1)"],
  },
  {
    id: 4,
    title: "第三季度复盘",
    summary: "做成了三件事，放弃了两件。放弃的那两件教会我的更多。",
    tags: ["复盘"],
    date: "09-30",
    words: 1840,
    month: "九月",
    cover: ["var(--tau-tag-2)", "var(--tau-tag-5)"],
  },
];

function ArticleCard({ article }: { article: Article }) {
  return (
    <article className="border-line-1 bg-surface group hover:shadow-lift animate-doc-in flex cursor-pointer flex-col overflow-hidden rounded-[var(--tau-radius-md)] border transition-[box-shadow,border-color] duration-200 hover:border-transparent">
      <div
        className="relative aspect-[13/6]"
        style={{
          background: `linear-gradient(135deg, ${article.cover[0]}, ${article.cover[1]})`,
        }}
      >
        <span className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="bg-surface/90 text-ink-2 grid size-[22px] place-items-center rounded-[7px]">
            <Star
              className={cn("size-[13px]", article.pinned && "fill-current text-warn")}
              strokeWidth={1.75}
            />
          </span>
        </span>
      </div>
      <div className="flex flex-col gap-1 px-3.5 pt-3 pb-[11px]">
        <b className="line-clamp-2 text-[14.5px] leading-snug font-semibold">{article.title}</b>
        <p className="text-ink-2 line-clamp-2 text-[12.5px] leading-[1.6]">{article.summary}</p>
        <div className="mt-1 flex items-center gap-1.5">
          {article.tags.map(tag => (
            <span
              key={tag}
              className="bg-hover text-ink-2 rounded-[5px] px-[7px] text-[11px] leading-[20px]"
            >
              {tag}
            </span>
          ))}
          <span className="text-ink-3 ml-auto text-[10.5px] tabular-nums">
            {article.date} · {article.words.toLocaleString()} 字
          </span>
        </div>
      </div>
    </article>
  );
}

export default function ArticlesDemo() {
  const [keyword, setKeyword] = useState("");
  const shown = ARTICLES.filter(article => article.title.includes(keyword.trim()));
  const months = [...new Set(shown.map(article => article.month))];

  return (
    <AppWindow active="articles" crumb="文章" height={460}>
      <div className="flex h-full flex-col">
        <div className="mt-5 mb-2 flex h-10 shrink-0 items-center gap-3 px-6">
          <h3 className="text-tau-title-lg font-semibold tracking-[-0.01em]">文章</h3>
          <span className="text-tau-meta text-ink-2 min-w-0 flex-1 truncate tabular-nums max-sm:hidden">
            共 <b className="text-ink-1 font-semibold">{ARTICLES.length}</b> 篇 · 累计{" "}
            <b className="text-ink-1 font-semibold">8,770</b> 字
          </span>
          <label className="border-line-1 focus-within:border-accent flex h-[30px] w-[180px] items-center gap-1.5 rounded-full border px-3 transition-colors max-sm:flex-1">
            <Search className="text-ink-3 size-3.5 shrink-0" strokeWidth={1.75} />
            <input
              value={keyword}
              onChange={event => setKeyword(event.target.value)}
              onKeyDown={event => event.key === "Escape" && setKeyword("")}
              placeholder="搜索文章标题"
              aria-label="搜索文章标题"
              className="text-tau-sm placeholder:text-ink-3 min-w-0 flex-1 bg-transparent outline-none select-text"
            />
          </label>
          <Button size="sm" variant="primary" icon={Plus} className="max-md:hidden">
            新建
            <ChevronDown className="-mr-1 size-3.5" strokeWidth={1.75} />
          </Button>
        </div>
        <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-6 pb-5">
          {months.length === 0 && (
            <p className="text-ink-2 py-16 text-center text-[15px]">没有符合条件的文章</p>
          )}
          {months.map(month => (
            <section key={month} className="mt-3">
              <p className="mb-3 text-[16px] font-semibold">
                {month}
                {month !== "置顶" && (
                  <span className="text-ink-3 ml-1.5 text-[12px] font-normal">2026</span>
                )}
              </p>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                {shown
                  .filter(article => article.month === month)
                  .map(article => (
                    <ArticleCard key={article.id} article={article} />
                  ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </AppWindow>
  );
}
