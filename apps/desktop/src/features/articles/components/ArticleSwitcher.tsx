/**
 * 文章速切器（A4 定稿的 Switcher：列表能力收敛为单一入口）。
 * 经 usePageBreadcrumb 挂在标题栏面包屑位（「文章 / [速切器]」）。
 * 浮层 = Popover 承载（Esc/外点走浮层 LIFO 仲裁）：搜索 + 置顶组 + 按月分组，
 * 触底加载更多；条目 hover ⋯ 承接 置顶/导出（MD·图片·EPUB·PDF）/窗口打开/删除。
 */

import { useMemo, useState } from "react";
import {
  ChevronDown,
  Download,
  FileText,
  MonitorUp,
  MoreHorizontal,
  Pin,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import type { ArticlePageItem, IArticle } from "@/types";
import { isElectron } from "@/electron";
import { findOneArticle, openArticleInNewWindow } from "@/commands/article";
import { downloadMarkdown, getMarkdown } from "@/utils";
import useSettingStore from "@/stores/useSettingStore";
import ContentExportModal from "@/components/ContentExportModal";
import EpubExportModal from "@/components/EpubExportModal";
import { PdfExportModal } from "@/components/PdfExportModal";
import { IconButton, Menu, Popover, cn } from "@tau/ui";

import { bucketByMonths, useArticleFeed, useArticleMutations } from "../queries";

type ExportKind = "image" | "epub" | "pdf";

interface ArticleSwitcherProps {
  currentId: number;
  currentTitle: string;
  onOpenArticle: (id: number) => void;
  /** 删除的是当前打开的文章：调用方需后退 */
  onDeleteCurrent: () => void;
}

/** 条目日期：今天/昨天友好显示，否则 MM-DD（跨年带年份） */
function formatItemDate(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  if (sameYear) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (ts >= today) return "今天";
    if (ts >= today - 86_400_000) return "昨天";
    return `${mm}-${dd}`;
  }
  return `${date.getFullYear()}-${mm}-${dd}`;
}

export function ArticleSwitcher({
  currentId,
  currentTitle,
  onOpenArticle,
  onDeleteCurrent,
}: ArticleSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ArticlePageItem | null>(null);
  /* 弹窗导出需全文（条目是轻量分页契约）：先 findOneArticle 再开弹窗 */
  const [exportState, setExportState] = useState<{
    article: IArticle;
    kind: ExportKind;
  } | null>(null);

  const feed = useArticleFeed("");
  const { toggleTop, remove } = useArticleMutations();
  const databaseName = useSettingStore(state => state.setting.database.active);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return feed.items;
    return feed.items.filter(item => item.title.toLowerCase().includes(q));
  }, [feed.items, query]);

  const tops = useMemo(() => filtered.filter(item => item.isTop), [filtered]);
  const months = useMemo(() => bucketByMonths(filtered.filter(item => !item.isTop)), [filtered]);

  const handleExportMarkdown = async (item: ArticlePageItem) => {
    const full = await findOneArticle(item.id);
    if (full) downloadMarkdown(getMarkdown(full.content), full.title || `文章-${full.id}`);
  };

  const openExportModal = async (item: ArticlePageItem, kind: ExportKind) => {
    const article = await findOneArticle(item.id);
    if (article) setExportState({ article, kind });
  };

  const handleDelete = async (item: ArticlePageItem) => {
    await remove(item.id);
    setPendingDelete(null);
    if (item.id === currentId) onDeleteCurrent();
  };

  const renderRow = (item: ArticlePageItem) => (
    <div key={item.id} className="group/row rounded-tau-sm relative flex h-8 items-center px-2">
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          if (item.id !== currentId) onOpenArticle(item.id);
        }}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1.5 text-left text-[12.5px] leading-snug group-hover/row:pr-5",
          item.id === currentId
            ? "text-accent-text font-medium"
            : "text-ink-2 group-hover/row:text-ink-1"
        )}
      >
        {item.isTop && (
          <Pin className="fill-accent text-accent size-[11px] shrink-0" strokeWidth={1.75} />
        )}
        <span className="truncate">{item.title || `文章 #${item.id}`}</span>
        <span className="text-ink-3 ml-auto shrink-0 text-[10.5px] tabular-nums group-hover/row:hidden">
          {formatItemDate(item.updateTime)}
        </span>
      </button>
      <Menu
        align="end"
        trigger={
          <IconButton
            title="置顶 / 导出 / 删除"
            className="absolute right-1 top-1/2 size-5 -translate-y-1/2 opacity-0 group-hover/row:opacity-100"
          >
            <MoreHorizontal className="size-[14px]" strokeWidth={1.75} />
          </IconButton>
        }
      >
        <Menu.Item
          icon={<Star className="size-[15px]" strokeWidth={1.75} />}
          onSelect={() => void toggleTop(item.id, !item.isTop)}
        >
          {item.isTop ? "取消置顶" : "置顶"}
        </Menu.Item>
        <Menu.Submenu label="导出" icon={<Download className="size-[15px]" strokeWidth={1.75} />}>
          <Menu.Item onSelect={() => void handleExportMarkdown(item)}>Markdown 文件</Menu.Item>
          <Menu.Item onSelect={() => void openExportModal(item, "image")}>图片</Menu.Item>
          <Menu.Item onSelect={() => void openExportModal(item, "epub")}>EPUB</Menu.Item>
          <Menu.Item onSelect={() => void openExportModal(item, "pdf")}>PDF</Menu.Item>
        </Menu.Submenu>
        {isElectron && databaseName && (
          <Menu.Item
            icon={<MonitorUp className="size-[15px]" strokeWidth={1.75} />}
            onSelect={() => void openArticleInNewWindow(databaseName, item.id)}
          >
            窗口打开
          </Menu.Item>
        )}
        <Menu.Separator />
        <Menu.Item
          danger
          icon={<Trash2 className="size-[15px]" strokeWidth={1.75} />}
          onSelect={() => setPendingDelete(item)}
        >
          删除文章
        </Menu.Item>
      </Menu>
    </div>
  );

  return (
    <>
      <Popover
        open={open}
        onOpenChange={setOpen}
        placement="bottom-start"
        arrow={false}
        className="w-[400px]"
        trigger={
          <button
            type="button"
            title="切换文章"
            className="rounded-tau-sm text-ink-2 hover:bg-hover hover:text-ink-1 flex min-w-0 max-w-[280px] items-center gap-1.5 px-1.5 py-0.5 text-[11.5px] transition-colors"
          >
            <FileText className="size-[13px] shrink-0" strokeWidth={1.75} />
            <span className="truncate">{currentTitle || "未命名文章"}</span>
            <ChevronDown
              className={cn(
                "ease-tau-out size-3 shrink-0 transition-transform duration-150",
                open && "rotate-180"
              )}
              strokeWidth={1.75}
            />
          </button>
        }
      >
        <div className="flex items-center gap-2 px-3.5 pb-2 pt-3">
          <Search className="text-ink-3 size-3.5 shrink-0" strokeWidth={1.75} />
          <input
            data-autofocus
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="搜索文章标题…"
            aria-label="搜索文章标题"
            className="text-tau-meta text-ink-1 placeholder:text-ink-3 min-w-0 flex-1 bg-transparent outline-none"
          />
        </div>
        <Popover.Body>
          <div
            className={cn(
              "-mr-4 flex max-h-[380px] flex-col overflow-y-auto border-r-[10px] border-r-transparent pr-1.5",
              /* 轨道上下内缩：滑块行程与首个月份标题文字顶 / 末条目文字底对齐 */
              "[&::-webkit-scrollbar-track]:mb-2 [&::-webkit-scrollbar-track]:mt-3"
            )}
            onScroll={event => {
              const el = event.currentTarget;
              if (
                feed.hasMore &&
                !feed.loadingMore &&
                el.scrollHeight - el.scrollTop - el.clientHeight < 80
              ) {
                feed.loadMore();
              }
            }}
          >
            {tops.length > 0 && <div className="text-ink-3 px-3.5 pb-1 pt-2 text-[11px]">置顶</div>}
            {tops.map(renderRow)}
            {months.map(month => (
              <div key={month.key}>
                <div className="text-ink-3 px-3.5 pb-1 pt-2 text-[11px]">
                  {month.month} 月
                  <span className="ml-1 text-[10px] tabular-nums">{month.year}</span>
                </div>
                {month.items.map(renderRow)}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="text-tau-meta text-ink-3 px-3.5 py-8 text-center">
                {feed.loading ? "加载中…" : "没有匹配的文章"}
              </div>
            )}
            {feed.loadingMore && (
              <div className="text-tau-sm text-ink-3 px-3.5 py-2 text-center">加载中…</div>
            )}
          </div>
        </Popover.Body>

        {pendingDelete && (
          <Popover.Footer>
            <span className="text-tau-sm text-ink-2">
              删除「{pendingDelete.title || `#${pendingDelete.id}`}」？
            </span>
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              className="text-tau-sm rounded-tau-sm text-ink-3 hover:bg-hover hover:text-ink-1 px-2 py-1"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleDelete(pendingDelete)}
              className="text-tau-sm rounded-tau-sm bg-danger text-ink-inverse px-2.5 py-1 font-medium hover:opacity-90"
            >
              删除
            </button>
          </Popover.Footer>
        )}
      </Popover>

      {/* 弹窗导出（legacy 搬用；PdfExportModal 的开合 prop 是 visible） */}
      {exportState && (
        <>
          <ContentExportModal
            open={exportState.kind === "image"}
            onClose={() => setExportState(null)}
            content={exportState.article.content}
            title={exportState.article.title}
          />
          <EpubExportModal
            open={exportState.kind === "epub"}
            onClose={() => setExportState(null)}
            content={exportState.article.content}
            title={exportState.article.title || `文章 #${exportState.article.id}`}
          />
          <PdfExportModal
            visible={exportState.kind === "pdf"}
            onClose={() => setExportState(null)}
            content={exportState.article.content}
            title={exportState.article.title || `文章 #${exportState.article.id}`}
          />
        </>
      )}
    </>
  );
}
