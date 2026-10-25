/**
 * 文章页视图 · 一整张纸（mockups/articles/plan-sheet.html 方案 B 定稿）：
 * 纸顶工具栏（标题 / 当前标签 + 摘要 + 标题搜索 + 视图 + 导入 / 新建）→ 纸内两种排布，
 * 都走无限滚动（触底预加载）：
 * - 网格 = 月刊形态：按月分段（sticky 月头纸色实底）+ 描边竖卡，按更新时间排，不设排序；
 * - 列表 = 平铺行 + 列头排序（D-105，mockups/articles/list-view.html），排序下推主进程。
 *
 * 筛选：标签在侧栏「文章」入口的子项里（ArticlesNav，页面参数 id），页内不放标签 pills；
 * 右上角搜索框按标题关键词筛选（停顿后下推到 getArticlePage，与标签叠加）。
 * 点击卡片/新建走页内导航到 article-detail 占位页（编辑器迁移后接正文编辑，
 * 见 DECISIONS.md D-015）；「窗口打开」菜单项保留 Electron 独立窗口能力。
 * 网格卡 / 列表行 ⇄ 详情页的纸走共享元素形变（D-106）。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, FolderInput, Import, PanelsLeftRight, Plus, Search, X } from "lucide-react";
import { FadeScroll } from "@tau/ui";
import { usePage, usePageParams } from "@/page/PageProvider";
import { morph, queryActivePageMorph } from "@/page/morph";
import { useScrollTopOnChange } from "@/hooks/useScrollTopOnChange";
import { Button, ConfirmDialog, Input, Loading, Menu, Spinner, cn, toast } from "@tau/ui";
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
import { getFileBaseName, readBinaryFile, selectFile } from "@/commands";
import { getContentLength } from "@/utils";
import type { Descendant } from "slate";
import type { ArticlePageItem } from "@/types";
import { LayoutMenu } from "@/features/shared/list/ListControls";
import { ARTICLE_PAGE_SIZE, useArticleFeed, useArticleMutations, bucketByMonths } from "../queries";
import { useArticlesPreferencesStore } from "../preferences";
import { ArticleListRows } from "../components/ArticleListRows";
import type { ArticleItemActions } from "../components/ArticleItemOps";
import { ArticleCard, formatWords } from "./ArticleCard";
import { articleMorphKey } from "../morph";
import { exportContentAsMarkdown, importMarkdownFiles } from "@/services/content-transfer";
import { useTransferStore } from "@/app/transferStore";
import { useImportDrop } from "@/features/transfer/useImportDrop";

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
  const { layout, listSort, update: updatePreferences } = useArticlesPreferencesStore();
  const listLayout = layout === "list";
  const feed = useArticleFeed({
    tag,
    keyword: query,
    sort: listLayout ? listSort : "updated",
    pageSize: ARTICLE_PAGE_SIZE[layout],
  });
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
      const key = articleMorphKey(article.id);
      morph({
        from: queryActivePageMorph(key),
        update: () => navigator.push("article-detail", { id: article.id }),
        to: () => queryActivePageMorph(key),
      });
    },
    [navigator]
  );

  /* 换排布或排序是另一条数据流，回到顶部从头看（从详情返回不算，保留滚动位置） */
  useScrollTopOnChange(scrollEl, `${layout}\n${listSort}`);

  /* 无限滚动：距底阈值触发，fetchNextPage 进行中不重入 */
  const { hasMore, loadingMore, loadMore } = feed;
  const loadedCount = feed.items.length;
  useEffect(() => {
    const el = scrollEl;
    if (!el) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        if (!hasMore || loadingMore) return;
        if (el.scrollHeight - el.scrollTop - el.clientHeight > LOAD_MORE_THRESHOLD) return;
        loadMore();
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    // 首屏没填满时不会有滚动事件：内容高度不足就直接续取下一页（loadedCount 变化后重新判断）
    if (hasMore && !loadingMore && el.scrollHeight <= el.clientHeight + LOAD_MORE_THRESHOLD)
      loadMore();
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollEl, hasMore, loadingMore, loadMore, loadedCount]);

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
      await exportContentAsMarkdown({
        title: full.title,
        content: full.content,
        contentId: full.contentId,
      });
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

  /** compose：直接进入创作模式（左白板右写作） */
  const handleCreate = useCallback(
    async (compose = false) => {
      const created = await createDefault();
      if (created) {
        navigator.push("article-detail", {
          id: created.id,
          ...(compose ? { layout: "compose" } : {}),
        });
      }
    },
    [createDefault, navigator]
  );

  const importDrop = useImportDrop("article");
  const handleImport = useCallback(async () => {
    setBusy(true);
    try {
      const imported = await importMarkdownFiles(({ title, content, contracts }) =>
        createArticleCommand({
          title,
          bannerBg: "",
          bannerPosition: "center",
          isTop: false,
          isDelete: false,
          author: "",
          content,
          contracts,
          tags: [],
          links: [],
          count: getContentLength(content),
        })
      );
      if (imported > 0) feed.refresh();
    } finally {
      setBusy(false);
    }
  }, [feed]);

  const cardActions: ArticleItemActions = {
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
    <div className="@container mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pt-1 pb-4">
      {/* 一整张纸：工具栏固定在纸顶，月段在纸内滚动 */}
      <div
        className="bg-surface shadow-card rounded-tau-lg relative flex min-h-0 flex-1 flex-col overflow-hidden"
        {...importDrop.dropProps}
      >
        {importDrop.overlay}
        {/* 工具栏：标题 / 当前标签 + 摘要 + 标题搜索 + 导入 / 新建 */}
        <div className="mt-5 mb-3 flex h-10 flex-none items-center gap-3 px-8">
          <h1 className="text-tau-title-lg shrink-0 font-semibold tracking-[-0.01em] whitespace-nowrap">
            文章
          </h1>
          {tag && (
            <button
              type="button"
              title="清除标签筛选"
              onClick={() => navigator.push("articles", { id: "" })}
              className="bg-selected text-accent-text inline-flex h-6 max-w-[180px] shrink-0 items-center gap-1 rounded-full pr-1.5 pl-2.5 text-[12px] font-medium"
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
          <LayoutMenu value={layout} onChange={next => updatePreferences({ layout: next })} />
          {/* 导入：带文字的次要按钮（同 Skill 页「关联目录 + 添加」），不用裸图标——
              下箭头落横线是通用的「下载 / 导出」语义，且裸图标夹在搜索框与主按钮之间分量不齐 */}
          <Menu
            align="end"
            trigger={
              <Button
                variant="secondary"
                size="sm"
                icon={Import}
                disabled={busy}
                title="从本地 Markdown 导入"
                className="shrink-0 whitespace-nowrap"
              >
                导入
              </Button>
            }
          >
            <Menu.Item
              icon={<FileText className="size-[15px] shrink-0" strokeWidth={1.75} />}
              onSelect={() => void handleImport()}
            >
              Markdown 文件…
            </Menu.Item>
            <Menu.Item
              icon={<FolderInput className="size-[15px] shrink-0" strokeWidth={1.75} />}
              onSelect={() => useTransferStore.getState().openImportWizard({ target: "article" })}
            >
              文件夹或压缩包…
            </Menu.Item>
          </Menu>
          <Menu
            align="end"
            trigger={
              <Button
                variant="primary"
                size="sm"
                icon={Plus}
                disabled={busy}
                className="shrink-0 whitespace-nowrap"
              >
                新建
              </Button>
            }
          >
            <Menu.Item
              icon={<FileText className="size-[15px] shrink-0" strokeWidth={1.75} />}
              onSelect={() => void handleCreate()}
            >
              空白文章
            </Menu.Item>
            <Menu.Item
              icon={<PanelsLeftRight className="size-[15px] shrink-0" strokeWidth={1.75} />}
              onSelect={() => void handleCreate(true)}
            >
              在创作模式中新建
            </Menu.Item>
          </Menu>
        </div>

        {/* 滚动区：FadeScroll（右侧 6px 透明边 + pr-[26px] = 左侧 pl-8），离纸底 16px；
            网格 pt-1 给首行卡片 hover 的 lift 阴影留出绘制空间；列表不留 pt，列头贴顶吸附 */}
        <FadeScroll
          scrollRef={setScrollEl}
          topFade={!listLayout}
          className={cn("mb-4 min-h-0 flex-1 pb-2 pl-8 pr-[26px]", !listLayout && "pt-1")}
        >
          {listLayout && feed.total > 0 && (
            <ArticleListRows
              items={feed.items}
              sort={listSort}
              onSortChange={next => updatePreferences({ listSort: next })}
              actions={cardActions}
            />
          )}

          {/* 置顶段 */}
          {!listLayout && tops.length > 0 && (
            <MonthSection label="置顶" count={tops.length} words={sumWords(tops)}>
              {tops.map(article => (
                <ArticleCard key={article.id} article={article} {...cardActions} />
              ))}
            </MonthSection>
          )}

          {/* 月分段（段内统一竖卡） */}
          {!listLayout &&
            months.map(month => (
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
                listLayout ? (
                  "向下滚动加载更多"
                ) : (
                  "向下滚动加载更早的月份"
                )
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
      <header className="sticky top-0 z-[2] flex items-baseline gap-3 bg-[linear-gradient(180deg,var(--tau-bg-surface)_calc(100%_-_13px),transparent)] pt-0.5 pb-[13px] pl-0.5">
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
