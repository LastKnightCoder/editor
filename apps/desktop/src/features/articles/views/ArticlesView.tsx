/**
 * 文章页视图 · 月刊形态，一整张纸（mockups/articles/plan-sheet.html 方案 B 定稿）：
 * 纸顶工具栏（标题 / 当前标签 + 摘要 + 标题搜索 + 导入 / 新建）→ 纸内按月分段
 * （sticky 月头纸色实底）+ 描边竖卡网格 + 无限滚动（触底预加载）。无排序（按月归段即时间序）。
 *
 * 筛选：标签在侧栏「文章」入口的子项里（ArticlesNav，页面参数 id），页内不放标签 pills；
 * 右上角搜索框按标题关键词筛选（停顿后下推到 getArticlePage，与标签叠加）。
 * 点击卡片/新建走页内导航到 article-detail 占位页（编辑器迁移后接正文编辑，
 * 见 DECISIONS.md D-015）；「窗口打开」菜单项保留 Electron 独立窗口能力。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Import, Plus, Search, X } from "lucide-react";
import { FadeScroll } from "@/components/FadeScroll";
import { usePage, usePageParams } from "@/page/PageProvider";
import { Button, ConfirmDialog, Input, Loading, Spinner, toast } from "@tau/ui";
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
import { useArticleFeed, useArticleMutations, bucketByMonths } from "../queries";
import { ArticleCard, formatWords, type ArticleCardProps } from "./ArticleCard";

const LOAD_MORE_THRESHOLD = 700;
/** 搜索框停顿多久再查询（逐字下推会每键一次 IPC） */
const SEARCH_DEBOUNCE_MS = 250;

export function ArticlesView() {
  const { navigator } = usePage();
  const params = usePageParams<{ id?: string }>();
  const tag = params.id ?? "";
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search]);
  const feed = useArticleFeed(tag, query);
  const { toggleTop, remove, createDefault } = useArticleMutations();
  const uploadResource = useUploadResource();
  const databaseName = useSettingStore(state => state.setting.database.active);

  /* 滚动容器：无限滚动监听挂在 FadeScroll 的滚动元素上 */
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  /* 浮层状态：删除确认 / 演示模式；busy=工具栏动作、deleting=删除确认进行中 */
  const [pendingDelete, setPendingDelete] = useState<ArticlePageItem | null>(null);
  const [presenting, setPresenting] = useState<{ content: Descendant[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const tops = useMemo(() => feed.items.filter(item => item.isTop), [feed.items]);
  const months = useMemo(() => bucketByMonths(feed.items), [feed.items]);

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

  const filtering = Boolean(tag || query);

  return (
    <div className="@container mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pb-4 pt-1">
      {/* 一整张纸：工具栏固定在纸顶，月段在纸内滚动 */}
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* 工具栏：标题 / 当前标签 + 摘要 + 标题搜索 + 导入 / 新建 */}
        <div className="mb-3 mt-5 flex h-10 flex-none items-center gap-3 px-8">
          <h1 className="text-tau-title-lg shrink-0 whitespace-nowrap font-semibold tracking-[-0.01em]">
            文章
          </h1>
          {tag && (
            <button
              type="button"
              title="清除标签筛选"
              onClick={() => navigator.push("articles", { id: "" })}
              className="bg-selected text-accent-text inline-flex h-6 max-w-[180px] shrink-0 items-center gap-1 rounded-full pl-2.5 pr-1.5 text-[12px] font-medium"
            >
              <span className="truncate">{tag}</span>
              <X className="size-3 shrink-0" strokeWidth={2} />
            </button>
          )}
          <span className="text-tau-meta text-ink-2 w-0 flex-1 truncate whitespace-nowrap tabular-nums">
            {feed.total > 0 && (
              <>
                {filtering ? "找到" : "共"} <b className="text-ink-1 font-semibold">{feed.total}</b>{" "}
                篇 · 累计 <b className="text-ink-1 font-semibold">{formatWords(feed.totalWords)}</b>
                字
              </>
            )}
          </span>
          <Input
            size="sm"
            lead={Search}
            clearable
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Escape" && search) {
                e.stopPropagation();
                setSearch("");
              }
            }}
            placeholder="搜索文章标题"
            // 输入框自身不贡献最小宽度，窄窗口下随标题栏收缩
            className="w-0"
            wrapperClassName="w-auto max-w-[240px] flex-[0_1_240px]"
          />
          {/* 导入：带文字的次要按钮（同 Skill 页「关联目录 + 添加」），不用裸图标——
              下箭头落横线是通用的「下载 / 导出」语义，且裸图标夹在搜索框与主按钮之间分量不齐 */}
          <Button
            variant="secondary"
            size="sm"
            icon={Import}
            disabled={busy}
            title="从本地 Markdown 文件导入"
            className="shrink-0 whitespace-nowrap"
            onClick={() => void handleImport()}
          >
            导入
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            disabled={busy}
            className="shrink-0 whitespace-nowrap"
            onClick={() => void handleCreate()}
          >
            新建
          </Button>
        </div>

        {/* 滚动区：FadeScroll（右侧 6px 透明边 + pr-[26px] = 左侧 pl-8），离纸底 16px；
            pt-1 给首行卡片 hover 的 lift 阴影留出绘制空间 */}
        <FadeScroll
          scrollRef={setScrollEl}
          className="mb-4 min-h-0 flex-1 pb-2 pl-8 pr-[26px] pt-1"
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

          {/* 空态：筛选无结果 / 还没有文章 */}
          {feed.total === 0 &&
            (filtering ? (
              <div className="flex flex-col items-center gap-2 px-0 py-20 text-center">
                <p className="text-ink-2 text-[15px] font-medium">没有符合条件的文章</p>
                <p className="text-ink-3 text-[12.5px]">
                  {query ? `标题里没有「${query}」` : "这个标签下还没有文章"}
                </p>
                <Button
                  className="mt-3"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    if (tag) navigator.push("articles", { id: "" });
                  }}
                >
                  清除筛选
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 px-0 py-20 text-center">
                <p className="text-ink-2 text-[15px] font-medium">还没有文章</p>
                <p className="text-ink-3 text-[12.5px]">从一篇空白文章或本地 Markdown 开始</p>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Plus}
                    onClick={() => void handleCreate()}
                  >
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
            ))}

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
        </FadeScroll>
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
      {/* sticky 月头：纸色实底、底缘 13px 渐透——卡片向上滚过时在月头下缘淡出 */}
      <header className="sticky top-0 z-[2] flex items-baseline gap-3 bg-[linear-gradient(180deg,var(--tau-bg-surface)_calc(100%_-_13px),transparent)] pb-[13px] pl-0.5 pt-0.5">
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
