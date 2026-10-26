/**
 * 数据库：同一份书单在表格、看板、画廊间切换；表格表尾选「求和」，打开「只看读完」筛选后数值随之重算；
 * 看板里拖动卡片换列会改掉它的状态。视图条与表尾按 packages/database 的 ViewTabs、FooterRow 重建。
 */
import { useState } from "react";
import {
  Filter,
  LayoutGrid,
  Plus,
  Search,
  SquareKanban,
  Star,
  Table as TableIcon,
  type LucideIcon,
} from "lucide-react";
import { Tag, cn, type TagColor } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";

type Status = "想读" | "在读" | "读完";

interface Book {
  id: number;
  title: string;
  author: string;
  status: Status;
  rating: number;
  pages: number;
  cover: string;
}

const BOOKS: Book[] = [
  {
    id: 1,
    title: "深度工作",
    author: "卡尔·纽波特",
    status: "读完",
    rating: 5,
    pages: 288,
    cover: "var(--tau-tag-1)",
  },
  {
    id: 2,
    title: "认知天性",
    author: "彼得·布朗",
    status: "读完",
    rating: 4,
    pages: 312,
    cover: "var(--tau-tag-2)",
  },
  {
    id: 3,
    title: "原子习惯",
    author: "詹姆斯·克利尔",
    status: "在读",
    rating: 4,
    pages: 336,
    cover: "var(--tau-tag-3)",
  },
  {
    id: 4,
    title: "思考，快与慢",
    author: "丹尼尔·卡尼曼",
    status: "在读",
    rating: 0,
    pages: 424,
    cover: "var(--tau-tag-4)",
  },
  {
    id: 5,
    title: "学习之道",
    author: "芭芭拉·奥克利",
    status: "想读",
    rating: 0,
    pages: 256,
    cover: "var(--tau-tag-5)",
  },
];

const STATUS_COLOR: Record<Status, TagColor> = {
  想读: "gray",
  在读: "blue",
  读完: "green",
};
const STATUSES: Status[] = ["想读", "在读", "读完"];

type View = "表格" | "看板" | "画廊";
const VIEWS: { name: View; icon: LucideIcon }[] = [
  { name: "表格", icon: TableIcon },
  { name: "看板", icon: SquareKanban },
  { name: "画廊", icon: LayoutGrid },
];

type Summary = "无" | "求和" | "平均" | "计数";

function Stars({ value }: { value: number }) {
  return (
    <span className="flex gap-px" aria-label={`${value} 星`}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          className={cn("size-3", index < value ? "text-warn fill-current" : "text-line-1")}
          strokeWidth={1.75}
        />
      ))}
    </span>
  );
}

export default function DatabaseDemo() {
  const [books, setBooks] = useState(BOOKS);
  const [view, setView] = useState<View>("表格");
  const [onlyDone, setOnlyDone] = useState(false);
  const [summary, setSummary] = useState<Summary>("无");
  const [menu, setMenu] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);

  const shown = onlyDone ? books.filter(book => book.status === "读完") : books;
  const pageSum = shown.reduce((sum, book) => sum + book.pages, 0);
  const summaryValue =
    summary === "求和"
      ? pageSum
      : summary === "平均"
        ? Math.round(pageSum / Math.max(shown.length, 1))
        : shown.length;

  return (
    <AppWindow active="databases" crumb="数据库 / 书单" height={430}>
      <div className="flex h-full flex-col">
        <h3 className="text-tau-title-lg shrink-0 px-8 pt-5 pb-1 font-semibold tracking-[-0.01em] max-sm:px-4">
          书单
        </h3>
        <div className="border-line-1 flex h-[46px] shrink-0 items-center gap-5 border-b pr-5 pl-8 max-sm:gap-3 max-sm:pl-4">
          {VIEWS.map(item => {
            const Icon = item.icon;
            const on = view === item.name;
            return (
              <button
                key={item.name}
                type="button"
                onClick={() => setView(item.name)}
                className={cn(
                  "relative flex h-full items-center gap-1.5 text-[13px] transition-colors",
                  on ? "text-ink-1 font-medium" : "text-ink-2 hover:text-ink-1"
                )}
              >
                <Icon className="size-3.5" strokeWidth={1.75} />
                {item.name}
                {on && <span className="bg-ink-1 absolute inset-x-0 bottom-0 h-0.5 rounded-full" />}
              </button>
            );
          })}
          <Plus className="text-ink-3 size-3.5" strokeWidth={1.75} />
          <span className="flex-1" />
          <Search className="text-ink-3 size-4 max-sm:hidden" strokeWidth={1.75} />
          <button
            type="button"
            aria-pressed={onlyDone}
            onClick={() => setOnlyDone(value => !value)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-[8px] px-2.5 text-[12.5px] transition-colors",
              onlyDone ? "bg-accent-soft text-accent-text" : "text-ink-2 hover:bg-hover"
            )}
          >
            <Filter className="size-3.5" strokeWidth={1.75} />
            {onlyDone ? "筛选 1" : "筛选"}
          </button>
        </div>

        {onlyDone && (
          <div className="text-ink-2 text-tau-sm flex shrink-0 items-center gap-2 px-8 pt-2.5 max-sm:px-4">
            状态 是 <Tag color="green">读完</Tag>
          </div>
        )}

        <div key={view} className="animate-doc-in scrollbar-hide min-h-0 flex-1 overflow-auto">
          {view === "表格" && (
            <table className="w-full min-w-[520px] border-collapse text-[13px]">
              <thead>
                <tr className="text-ink-3 border-line-1 border-b text-left text-[12px]">
                  <th className="py-2 pl-8 font-normal">书名</th>
                  <th className="font-normal">作者</th>
                  <th className="font-normal">状态</th>
                  <th className="font-normal">评分</th>
                  <th className="pr-6 text-right font-normal">页数</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(book => (
                  <tr key={book.id} className="border-line-2 hover:bg-hover border-b">
                    <td className="py-2 pl-8 font-medium">{book.title}</td>
                    <td className="text-ink-2">{book.author}</td>
                    <td>
                      <Tag color={STATUS_COLOR[book.status]}>{book.status}</Tag>
                    </td>
                    <td>
                      <Stars value={book.rating} />
                    </td>
                    <td className="pr-6 text-right tabular-nums">{book.pages}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-line-1 h-9 border-t">
                  <td colSpan={4} className="text-ink-3 pl-8 text-[12px]">
                    {shown.length} 行
                  </td>
                  <td className="relative pr-6 text-right">
                    <button
                      type="button"
                      onClick={() => setMenu(open => !open)}
                      className={cn(
                        "hover:bg-hover rounded-[6px] px-1.5 py-0.5 tabular-nums transition-opacity",
                        summary === "无" ? "text-ink-3 text-tau-tiny" : "text-ink-1"
                      )}
                    >
                      {summary === "无" ? (
                        "汇总"
                      ) : (
                        <>
                          <span className="text-ink-3 text-tau-tiny mr-1.5">{summary}</span>
                          {summaryValue.toLocaleString()}
                        </>
                      )}
                    </button>
                    {menu && (
                      <span className="bg-surface border-line-1 shadow-float animate-doc-in absolute right-4 bottom-full z-10 mb-1 flex w-[120px] flex-col rounded-[12px] border p-1 text-left">
                        {(["无", "求和", "平均", "计数"] as Summary[]).map(option => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => {
                              setSummary(option);
                              setMenu(false);
                            }}
                            className={cn(
                              "hover:bg-hover rounded-[8px] px-2.5 py-1.5 text-left text-[13px]",
                              summary === option && "text-accent-text font-medium"
                            )}
                          >
                            {option}
                          </button>
                        ))}
                      </span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}

          {view === "看板" && (
            <div className="flex gap-3 p-4 pl-8 max-sm:pl-4">
              {STATUSES.map(status => {
                const column = shown.filter(book => book.status === status);
                return (
                  <div
                    key={status}
                    onDragOver={event => event.preventDefault()}
                    onDrop={() => {
                      if (dragId === null) return;
                      setBooks(list =>
                        list.map(book => (book.id === dragId ? { ...book, status } : book))
                      );
                      setDragId(null);
                    }}
                    className="bg-hover/60 flex w-[200px] shrink-0 flex-col gap-2 rounded-[12px] p-2"
                  >
                    <div className="flex items-center gap-2 px-1 py-0.5">
                      <Tag color={STATUS_COLOR[status]}>{status}</Tag>
                      <span className="text-ink-3 text-tau-tiny tabular-nums">{column.length}</span>
                    </div>
                    {column.map(book => (
                      <div
                        key={book.id}
                        draggable
                        onDragStart={() => setDragId(book.id)}
                        onDragEnd={() => setDragId(null)}
                        className={cn(
                          "bg-surface border-line-1 shadow-card flex cursor-grab flex-col gap-1.5 rounded-tau-md border p-3 active:cursor-grabbing",
                          dragId === book.id && "opacity-40"
                        )}
                      >
                        <b className="text-[13px] font-semibold">{book.title}</b>
                        <span className="text-ink-3 text-[12px]">{book.author}</span>
                        <Stars value={book.rating} />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {view === "画廊" && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 p-4 px-8 max-sm:px-4">
              {shown.map(book => (
                <div
                  key={book.id}
                  className="border-line-1 bg-surface hover:shadow-lift overflow-hidden rounded-[12px] border transition-shadow"
                >
                  <div
                    className="grid h-[110px] place-items-center"
                    style={{
                      background: `color-mix(in srgb, ${book.cover} 22%, var(--tau-bg-surface))`,
                    }}
                  >
                    <span
                      className="text-ink-inverse grid h-[82px] w-[58px] place-items-center rounded-[3px] px-1 text-center text-[11px] leading-tight font-semibold shadow-[2px_3px_8px_rgb(0_0_0/0.18)]"
                      style={{ background: book.cover }}
                    >
                      {book.title}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 px-3 py-2.5">
                    <b className="text-[13px] font-semibold">{book.title}</b>
                    <span className="flex items-center justify-between">
                      <Tag color={STATUS_COLOR[book.status]}>{book.status}</Tag>
                      <Stars value={book.rating} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppWindow>
  );
}
