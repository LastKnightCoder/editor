/**
 * 文章页视图 · 月刊形态（A3 定稿，mockups/articles/plan-a3-journal.html）：
 * 按月分段（sticky 月头）+ 段首 featured 双列大卡 + 无限滚动（触底预加载）+
 * 标签过滤 pills（横向滚动 + 右缘渐隐 + 按名称搜索）；新建/导入在工具栏右上角，
 * 无页内搜索（全局 Ctrl K）与排序（按月归段即时间序，2026-09-19 裁决）。
 *
 * 结构与 stats 同构（edge-fade 协议）：工具栏/标签栏在滚动区外 flex-none 固定，
 * 滚动区只装月段——月头 sticky top-0 实底、底缘渐透（edge fade 在标题下方）。
 * 点击卡片/新建走页内导航到 article-detail 占位页（编辑器迁移后接正文编辑，
 * 见 DECISIONS.md D-015）；「窗口打开」菜单项保留 Electron 独立窗口能力。
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { usePage } from "@/page/PageProvider";
import { useEdgeFade } from "@/hooks/useEdgeFade";
import { Button } from "@/ui/primitives/Button";
import { IconButton } from "@/ui/primitives/IconButton";
import { ConfirmDialog } from "@/ui/primitives/ConfirmDialog";
import { Loading, Spinner } from "@/ui/primitives/Loading";
import { toast } from "@/ui/primitives/Toast";
import useUploadResource from "@/hooks/useUploadResource";
import useSettingStore from "@/stores/useSettingStore";
import PresentationMode from "@/components/PresentationMode";
import { isElectron } from "@/electron";
import {
  findOneArticle,
  openArticleInNewWindow,
  updateArticleBannerBg,
  createArticle as createArticleCommand,
} from "@/commands/article";
import { getFileBaseName, readTextFile, readBinaryFile, selectFile } from "@/commands";
import { getMarkdown, downloadMarkdown, importFromMarkdown, getContentLength } from "@/utils";
import type { Descendant } from "slate";
import type { ArticlePageItem } from "@/types";
import { cn } from "@/ui/cn";
import {
  useArticleFeed,
  useArticleTagCounts,
  useArticleMutations,
  bucketByMonths,
} from "../queries";
import { ArticleCard, formatWords, type ArticleCardProps } from "./ArticleCard";

const LOAD_MORE_THRESHOLD = 700;

export function ArticlesView() {
  const [tag, setTag] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const feed = useArticleFeed(tag);
  const { tags } = useArticleTagCounts();
  const { toggleTop, remove, createDefault } = useArticleMutations();
  const uploadResource = useUploadResource();
  const databaseName = useSettingStore(state => state.setting.database.active);
  const { navigator } = usePage();

  /* 滚动容器：callback ref + 边缘渐隐。顶部渐隐关闭（top: false）——
      滚动区内有 sticky 月头（实底遮挡），渐隐带（0-12px 半透 mask）与 sticky
      实底头互斥：带头则月头被渐隐透出内容、头避开带则带内露出透明缝（均已被
      实机反馈否决），故顶部靠月头 bg-page 实底遮挡，只保留底部渐隐 */
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(scrollEl, { top: false });

  /* 浮层状态：删除确认 / 演示模式；busy=工具栏动作、deleting=删除确认进行中 */
  const [pendingDelete, setPendingDelete] = useState<ArticlePageItem | null>(null);
  const [presenting, setPresenting] = useState<{ content: Descendant[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const tops = useMemo(() => feed.items.filter(item => item.isTop), [feed.items]);
  const months = useMemo(() => bucketByMonths(feed.items), [feed.items]);

  /* 标签搜索：按名称过滤 pills（选中项始终保留，避免筛选态不可见） */
  const visibleTags = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter(({ tag: name }) => name.toLowerCase().includes(q) || name === tag);
  }, [tags, tagQuery, tag]);

  const openDetail = useCallback(
    (article: ArticlePageItem) => {
      navigator.push("article-detail", { id: article.id });
    },
    [navigator]
  );

  /* 无限滚动：距底阈值触发，fetchNextPage 进行中不重入 */
  useEffect(() => {
    const el = scrollEl;
    if (!el) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        if (!feed.hasMore || feed.loadingMore) return;
        if (el.scrollHeight - el.scrollTop - el.clientHeight > LOAD_MORE_THRESHOLD) return;
        feed.loadMore();
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollEl, feed.hasMore, feed.loadingMore, feed.loadMore]);

  /* ---------- 卡片操作 ---------- */

  const handlePresent = useCallback(async (article: ArticlePageItem) => {
    try {
      const full = await findOneArticle(article.id);
      setPresenting({ content: full.content });
    } catch {
      toast.error("文章内容读取失败");
    }
  }, []);

  const handleExportMarkdown = useCallback(async (article: ArticlePageItem) => {
    try {
      const full = await findOneArticle(article.id);
      downloadMarkdown(getMarkdown(full.content), full.title);
      toast.success("已导出 Markdown");
    } catch {
      toast.error("导出失败");
    }
  }, []);

  const handleChangeCover = useCallback(
    async (article: ArticlePageItem) => {
      const paths = await selectFile({
        properties: ["openFile"],
        filters: [{ name: "Image", extensions: ["jpg", "jpeg", "png", "gif", "bmp", "webp"] }],
      });
      const path = Array.isArray(paths) ? paths[0] : paths;
      if (!path) return;
      setBusy(true);
      try {
        const data = (await readBinaryFile(path)) as Uint8Array<ArrayBuffer>;
        const file = new File([data], await getFileBaseName(path));
        const url = await uploadResource(file);
        if (!url) {
          toast.error("封面上传失败");
          return;
        }
        await updateArticleBannerBg(article.id, url);
        feed.refresh();
        toast.success("封面已更新");
      } finally {
        setBusy(false);
      }
    },
    [uploadResource, feed]
  );

  /* ---------- 工具栏：新建 / 导入 ---------- */

  const handleCreate = useCallback(async () => {
    const created = await createDefault();
    if (created) navigator.push("article-detail", { id: created.id });
  }, [createDefault, navigator]);

  const handleImport = useCallback(async () => {
    const paths = await selectFile({
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!paths?.length) return;
    setBusy(true);
    try {
      for (const path of paths) {
        const markdown = await readTextFile(path);
        const content = importFromMarkdown(markdown, ["yaml"]);
        const fileName = await getFileBaseName(path, true);
        await createArticleCommand({
          title: fileName,
          bannerBg: "",
          bannerPosition: "center",
          isTop: false,
          isDelete: false,
          author: "",
          content,
          tags: [],
          links: [],
          count: getContentLength(content),
        });
      }
      feed.refresh();
      toast.success(`已导入 ${paths.length} 篇`);
    } catch {
      toast.error("导入失败");
    } finally {
      setBusy(false);
    }
  }, [feed]);

  const cardActions: Omit<ArticleCardProps, "article" | "featured"> = {
    onOpen: openDetail,
    onToggleTop: article => void toggleTop(article.id, !article.isTop),
    onDelete: setPendingDelete,
    onPresent: article => void handlePresent(article),
    onExportMarkdown: article => void handleExportMarkdown(article),
    onChangeCover: article => void handleChangeCover(article),
    ...(isElectron && databaseName
      ? {
          onOpenWindow: (article: ArticlePageItem) =>
            void openArticleInNewWindow(databaseName, article.id),
        }
      : {}),
  };

  if (feed.loading) return <Loading />;

  return (
    <div className="@container mx-auto flex h-full max-w-[1720px] flex-col px-[26px]">
      {/* 工具栏（滚动区外固定）：新建/导入在右上角 */}
      <div className="flex h-[44px] flex-none items-center gap-3.5">
        <h1 className="text-[19px] font-semibold tracking-[-0.01em]">文章</h1>
        {feed.total > 0 && (
          <span className="text-tau-sm text-ink-2 tabular-nums">
            共 <b className="text-ink-1 font-semibold">{feed.total}</b> 篇 · 累计{" "}
            <b className="text-ink-1 font-semibold">{formatWords(feed.totalWords)}</b>字
          </span>
        )}
        <span className="flex-1" />
        <IconButton title="导入 Markdown" disabled={busy} onClick={() => void handleImport()}>
          <svg
            className="size-[15px]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3v12" />
            <path d="m7 10 5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
        </IconButton>
        <Button
          variant="primary"
          size="sm"
          icon={Plus}
          disabled={busy}
          onClick={() => void handleCreate()}
        >
          新建
        </Button>
      </div>

      {/* 标签过滤：横向滚动 + 右缘渐隐 + 按名称搜索（滚动区外固定） */}
      <TagFilterBar
        tags={visibleTags}
        total={tags.reduce((sum, t) => sum + t.count, 0)}
        activeTag={tag}
        query={tagQuery}
        onQueryChange={setTagQuery}
        onSelect={name => setTag(prev => (prev === name ? "" : name))}
      />

      {/* 滚动区：边缘渐隐（顶部渐隐带 12px 恰在 sticky 月头上方）；-mr/pr 借位让细滚动条落进右留白 */}
      <div
        ref={setScrollEl}
        className="edge-fade-scroll -mr-[18px] mt-1 min-h-0 flex-1 overflow-y-auto pb-6 pr-[18px]"
      >
        {/* 置顶段 */}
        {tops.length > 0 && (
          <MonthSection label="置顶" count={tops.length} words={sumWords(tops)}>
            {tops.map(article => (
              <ArticleCard key={article.id} article={article} {...cardActions} />
            ))}
          </MonthSection>
        )}

        {/* 月分段（段内统一竖卡） */}
        {months.map(month => (
          <MonthSection
            key={month.key}
            label={`${month.month} 月`}
            year={month.year}
            count={month.items.length}
            words={month.words}
          >
            {month.items.map(article => (
              <ArticleCard key={article.id} article={article} {...cardActions} />
            ))}
          </MonthSection>
        ))}

        {/* 空态 */}
        {feed.total === 0 && (
          <div className="flex flex-col items-center gap-2 px-0 py-20 text-center">
            <p className="text-ink-2 text-[15px] font-medium">还没有文章</p>
            <p className="text-ink-3 text-[12.5px]">从一篇空白文章或本地 Markdown 开始</p>
            <div className="mt-3 flex gap-2">
              <Button variant="primary" size="sm" icon={Plus} onClick={() => void handleCreate()}>
                新建文章
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => void handleImport()}
              >
                导入 Markdown
              </Button>
            </div>
          </div>
        )}

        {/* 无限滚动指示 */}
        {feed.total > 0 && (
          <div className="text-ink-3 mt-4 flex min-h-[56px] items-center justify-center gap-2.5 text-[12px]">
            {feed.loadingMore ? (
              <>
                <Spinner className="size-3.5" />
                加载中…
              </>
            ) : feed.hasMore ? (
              "向下滚动加载更早的月份"
            ) : (
              <span className="tabular-nums">已全部加载 · {feed.total} 篇</span>
            )}
          </div>
        )}
      </div>

      {/* 删除确认 */}
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={open => {
          if (!open) setPendingDelete(null);
        }}
        title="删除文章"
        context={pendingDelete?.title || `文章 #${pendingDelete?.id}`}
        description="文章将移入回收语义删除，列表立即移除。"
        impact="该文章的正文与关联卡片链接将不再可访问"
        danger
        confirmText="删除"
        loading={deleting}
        onConfirm={async () => {
          if (!pendingDelete) return;
          setDeleting(true);
          try {
            await remove(pendingDelete.id);
            setPendingDelete(null);
            toast.success("已删除");
          } catch {
            toast.error("删除失败");
          } finally {
            setDeleting(false);
          }
        }}
      />

      {/* 演示模式（退出即卸载，不再保留状态） */}
      {presenting && (
        <PresentationMode content={presenting.content} onExit={() => setPresenting(null)} />
      )}
    </div>
  );
}

/* ---------- 标签过滤栏：横向滚动 + 右缘渐隐 + 名称搜索 ---------- */

function TagFilterBar({
  tags,
  total,
  activeTag,
  query,
  onQueryChange,
  onSelect,
}: {
  tags: { tag: string; count: number }[];
  total: number;
  activeTag: string;
  query: string;
  onQueryChange(q: string): void;
  onSelect(name: string): void;
}) {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  /* 右缘渐隐条件：还有未滚到的内容（初始测一次 + 滚动/尺寸变化重测） */
  useLayoutEffect(() => {
    const el = scrollEl;
    if (!el) return;
    const measure = () => setCanScrollRight(el.scrollWidth - el.scrollLeft - el.clientWidth > 8);
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
    };
  }, [scrollEl, tags]);

  const fadeMask = canScrollRight
    ? {
        maskImage: "linear-gradient(90deg, #000 0%, #000 calc(100% - 28px), transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(90deg, #000 0%, #000 calc(100% - 28px), transparent 100%)",
      }
    : undefined;

  return (
    <div className="flex h-[38px] flex-none items-center gap-2 pb-1.5">
      <div
        ref={setScrollEl}
        className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto"
        style={fadeMask}
      >
        <TagPill
          label="全部"
          count={total}
          active={activeTag === ""}
          onClick={() => onSelect("")}
        />
        {tags.map(({ tag: name, count }) => (
          <TagPill
            key={name}
            label={name}
            count={count}
            active={activeTag === name}
            onClick={() => onSelect(name)}
          />
        ))}
      </div>
      <label className="bg-surface shadow-card text-ink-3 flex h-6 w-[150px] shrink-0 items-center gap-1.5 rounded-full px-2.5">
        <Search className="size-[13px] shrink-0" strokeWidth={1.75} />
        <input
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          placeholder="搜索标签…"
          className="text-ink-1 placeholder:text-ink-3 min-w-0 flex-1 bg-none text-[12px] outline-none"
        />
      </label>
    </div>
  );
}

function TagPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "ease-tau-out shadow-card flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12px] transition-[background,color] duration-150",
        active
          ? "bg-selected text-accent-text font-medium"
          : "bg-surface text-ink-2 hover:text-ink-1"
      )}
    >
      {label}
      <span className={cn("text-[10.5px]", active ? "opacity-70" : "text-ink-3")}>{count}</span>
    </button>
  );
}

/* ---------- 月段容器 ---------- */

function MonthSection({
  label,
  year,
  count,
  words,
  children,
}: {
  label: string;
  year?: number;
  count: number;
  words: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-[26px]">
      {/* sticky 月头：背景实底、底缘 13px 渐透——卡片向上滚过时在月头下缘淡出
          （edge fade 位置在标题下方），上缘实底无缝（无透明区）。
          mask 渐隐带与 sticky 实底头互斥，滚动容器的 useEdgeFade 仍关闭 top */}
      <header className="sticky top-0 z-[2] flex items-baseline gap-3 bg-[linear-gradient(180deg,var(--tau-bg-page)_calc(100%_-_13px),transparent)] pb-[13px] pl-0.5 pt-0.5">
        <span className="text-[16px] font-semibold tracking-[-0.01em]">
          {label}
          {year !== undefined && (
            <small className="text-ink-3 ml-0.5 text-[12px] font-normal tabular-nums">{year}</small>
          )}
        </span>
        <span className="text-ink-3 text-[11.5px] tabular-nums">
          {count} 篇 · {formatWords(words)}字
        </span>
      </header>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">{children}</div>
    </section>
  );
}

function sumWords(items: ArticlePageItem[]): number {
  return items.reduce((sum, item) => sum + item.words, 0);
}
