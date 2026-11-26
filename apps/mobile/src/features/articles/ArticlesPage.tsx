// 文章列表：置顶特写卡 + 杂志式卡片流；
// 打开即编辑（无阅读/预览切换），入口收敛在「我的 · 功能」Hub。

import { useMobileArticlesI18n } from "./i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Ellipsis,
  FileDown,
  FileText,
  ImagePlus,
  Loader2,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import type { ArticleListItem } from "../../types";
import { clampText } from "../../utils/richTextText";
import { readingMinutes } from "../../utils/formatTime";
import { formatListTime } from "../../utils/contentTime";
import { useEdgeFade } from "../../hooks/useScrollState";
import { logPerf, sampleFrames } from "../../utils/perf";
import { toast } from "../../components/toast";
import BottomSheet from "../../components/BottomSheet";
import ActionSheet from "../../components/ActionSheet";
import MobileConfirmDialog from "../../components/MobileConfirmDialog";
import * as tauri from "../../services/tauri";
import { PageHeader, PageHeaderButton } from "../../components/PageHeader";
import { ArticleCover } from "./ArticleCover";
import {
  useArticleDelete,
  useArticleToggleTop,
  useArticlesQuery,
  useInvalidateArticles,
} from "./queries";

type ArticlesPageProps = {
  onBack: () => void;
  onOpenArticle: (articleId: number) => void;
  onOpenSearch: () => void;
  onError: (error: unknown, fallback: string) => void;
};

export function ArticlesPage(props: ArticlesPageProps) {
  const { t, locale } = useMobileArticlesI18n();
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [menuArticle, setMenuArticle] = useState<ArticleListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ArticleListItem | null>(null);
  const [coverTarget, setCoverTarget] = useState<ArticleListItem | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const mountTimeRef = useRef(performance.now());
  const firstDataLoggedRef = useRef(false);

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useArticlesQuery();
  const invalidate = useInvalidateArticles();
  const toggleTop = useArticleToggleTop(article => {
    toast({ type: "success", text: t(article.isTop ? "pin.success" : "unpin.success") });
  });
  const deleteArticle = useArticleDelete(() => {
    toast({ type: "success", text: t("delete.success") });
  });

  const articles = useMemo(() => data?.pages.flatMap(page => page.items) ?? [], [data]);
  const pinned = articles.filter(a => a.isTop);
  const totalWords = articles.reduce((sum, a) => sum + a.count, 0);
  // 只让首屏这批行播入场动画：虚拟列表会随滚动反复挂载行，若每行都播，
  // 快速滑动时视口内会长时间停在 opacity:0 的动画起始帧，表现为大片空白。
  // 这里刻意不引入"是否已播放"的记忆：一旦标记翻转会让 style 变化，中断正在播的动画。
  const enterAnimationStyle = (index: number) =>
    index < 8
      ? { animation: "pop-in .5s var(--ease-bounce) backwards", animationDelay: `${index * 0.05}s` }
      : undefined;
  const listRef = useRef<HTMLDivElement | null>(null);
  useEdgeFade(listRef, { bottom: false });
  const virtualizer = useVirtualizer({
    count: articles.length + (hasNextPage ? 1 : 0),
    getScrollElement: () => listRef.current,
    estimateSize: index =>
      index === articles.length ? 48 : index === 0 && pinned.length > 0 ? 250 : 126,
    getItemKey: index => (index < articles.length ? articles[index].id : "articles-load-more"),
    overscan: 8,
  });

  // 虚拟项须在 render 期取：滚动只触发 virtualizer 内部 rerender，实例引用始终不变，
  // 若在 effect 内取值再依赖 virtualizer，滚动不会重跑 effect，分页将永不触发。
  const virtualItems = virtualizer.getVirtualItems();
  const lastVisibleIndex =
    virtualItems.length > 0 ? virtualItems[virtualItems.length - 1].index : -1;

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    if (lastVisibleIndex < articles.length - 3) return;
    void fetchNextPage();
  }, [articles.length, fetchNextPage, hasNextPage, isFetchingNextPage, lastVisibleIndex]);

  // 诊断打开卡顿：记录首屏数据到达耗时（含 IPC + 缓存命中区分），
  // 并在数据落地后采样 1.5s 帧间隔，覆盖入场动画 + 封面图解码这两个嫌疑窗口
  useEffect(() => {
    if (isLoading || firstDataLoggedRef.current) return;
    firstDataLoggedRef.current = true;
    const covers = articles.filter(a => a.bannerBg.trim()).length;
    logPerf(
      "articles",
      `first-data count=${articles.length} covers=${covers}`,
      performance.now() - mountTimeRef.current
    );
    sampleFrames("articles", "open-frames", 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const article = await tauri.articleCreate({ title: "无标题文章" });
      invalidate();
      setCreateOpen(false);
      props.onOpenArticle(article.id);
    } catch (error) {
      props.onError(error, t("create.failed"));
    } finally {
      setCreating(false);
    }
  };

  // 更换封面：分块暂存上传文件，由原生按设置压缩后写回 banner_bg。
  const handleCoverFile = async (file: File) => {
    if (!coverTarget) return;
    setCoverUploading(true);
    try {
      const url = await tauri.uploadResource({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        content: file,
      });
      if (!url) {
        throw new Error("RESOURCE_UPLOAD_FAILED: 资源上传失败");
      }
      await tauri.articleUpdate({ id: coverTarget.id, bannerBg: url });
      invalidate();
      toast({ type: "success", text: t("cover.success") });
    } catch (error) {
      props.onError(error, t("cover.failed"));
    } finally {
      setCoverUploading(false);
      setCoverTarget(null);
    }
  };

  const renderPinnedFeature = (article: ArticleListItem, index: number) => (
    <article
      key={`pinned-${article.id}`}
      className="card overflow-hidden transition-transform active:scale-[0.98]"
      style={enterAnimationStyle(index)}
      onClick={() => props.onOpenArticle(article.id)}
    >
      <ArticleCover article={article} variant="feature">
        <span className="absolute top-3 left-3 z-10 inline-flex items-center gap-1 rounded-full bg-[rgba(255,253,249,.88)] px-2.5 py-1 text-[11px] font-bold text-[#4a3a2c] backdrop-blur">
          <Star size={11} fill="currentColor" />
          {t("pinned")}
        </span>
      </ArticleCover>
      <div className="p-4">
        <p className="text-ink-1 mobile-reading-font text-[18.5px] leading-snug font-extrabold tracking-tight">
          {article.title}
        </p>
        <p className="text-ink-2 mobile-reading-font mt-1.5 line-clamp-2 text-[13px] leading-relaxed">
          {clampText(article.excerpt, 64)}
        </p>
        <div className="text-ink-3 mt-2.5 flex items-center gap-2 text-[11.5px] tabular-nums">
          <span>
            {formatListTime(article.createTime, locale, time => t("time.yesterday", { time }))}
          </span>
          <span>·</span>
          <span>
            {t("words", { count: article.count, amount: article.count.toLocaleString(locale) })}
          </span>
          <span>·</span>
          <span>
            {t("reading", {
              count: readingMinutes(article.count),
              amount: readingMinutes(article.count).toLocaleString(locale),
            })}
          </span>
          {article.tags.length > 0 ? (
            <span className="bg-page ml-auto rounded-full px-2.5 py-0.5 text-[11.5px]">
              #{article.tags[0]}
            </span>
          ) : null}
          <button
            type="button"
            aria-label={t("action.actions")}
            className={`text-ink-3 active:bg-hover -mr-1 grid h-[26px] w-[26px] place-items-center rounded-lg ${
              article.tags.length > 0 ? "" : "ml-auto"
            }`}
            onClick={event => {
              event.stopPropagation();
              setMenuArticle(article);
            }}
          >
            <Ellipsis size={16} />
          </button>
        </div>
      </div>
    </article>
  );

  const renderArticleCard = (article: ArticleListItem, index: number) => (
    <article
      key={article.id}
      className="card flex items-stretch gap-3.5 p-4 transition-transform active:scale-[0.98]"
      style={enterAnimationStyle(index)}
      onClick={() => props.onOpenArticle(article.id)}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-ink-1 mobile-reading-font line-clamp-2 text-[15.5px] leading-normal font-bold">
          {article.title}
        </p>
        <p className="text-ink-2 mobile-reading-font mt-1 line-clamp-2 text-[12.5px] leading-relaxed">
          {clampText(article.excerpt, 48)}
        </p>
        <div className="text-ink-3 mt-auto flex items-center gap-2 pt-2 text-[11px] tabular-nums">
          <span>
            {formatListTime(article.createTime, locale, time => t("time.yesterday", { time }))}
          </span>
          <span>·</span>
          <span>
            {t("words", { count: article.count, amount: article.count.toLocaleString(locale) })}
          </span>
          <button
            type="button"
            aria-label={t("action.actions")}
            className="text-ink-3 active:bg-hover -mr-1 ml-auto grid h-[26px] w-[26px] place-items-center rounded-lg"
            onClick={event => {
              event.stopPropagation();
              setMenuArticle(article);
            }}
          >
            <Ellipsis size={16} />
          </button>
        </div>
      </div>
      <ArticleCover article={article} variant="thumb" />
    </article>
  );

  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
      <PageHeader
        title={t("title")}
        onBack={props.onBack}
        actions={
          <>
            <PageHeaderButton
              icon={<Search size={17} strokeWidth={2} />}
              aria-label={t("action.search")}
              onClick={props.onOpenSearch}
            />
            <PageHeaderButton
              icon={<Plus size={18} strokeWidth={2.6} />}
              variant="brand"
              aria-label={t("action.create")}
              onClick={() => setCreateOpen(true)}
            />
          </>
        }
      />

      <div
        ref={listRef}
        className="edge-fade-scroll mobile-page-scroll scrollbar-hide flex-1 overflow-y-auto overscroll-contain px-4 pt-1"
      >
        {isLoading ? (
          <div className="card space-y-3 p-4">
            <div className="bg-page h-4 w-2/5 animate-pulse rounded" />
            <div className="bg-page h-4 w-4/5 animate-pulse rounded" />
            <div className="bg-page h-4 w-full animate-pulse rounded" />
          </div>
        ) : articles.length === 0 ? (
          <div className="py-16 text-center">
            <FileText size={36} strokeWidth={1.4} className="text-ink-3 mx-auto" />
            <p className="text-ink-2 mt-3 text-sm">{t("empty.title")}</p>
            <p className="text-ink-3 mt-1 text-xs">{t("empty.hint")}</p>
          </div>
        ) : (
          <>
            <div className="text-ink-3 mt-1 mb-3.5 flex items-center gap-2 px-0.5 text-xs tabular-nums">
              {t("summary", { articles: "\uFFFC", words: "\uFFFD" })
                .split(/([\uFFFC\uFFFD])/)
                .map((part, index) =>
                  part === "\uFFFC" || part === "\uFFFD" ? (
                    <b key={index} className="text-ink-2 font-bold">
                      {(part === "\uFFFC" ? articles.length : totalWords).toLocaleString(locale)}
                    </b>
                  ) : (
                    part
                  )
                )}
            </div>
            <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
              {virtualItems.map(virtualRow => {
                if (virtualRow.index >= articles.length) {
                  return (
                    <div
                      key={virtualRow.key}
                      ref={virtualizer.measureElement}
                      data-index={virtualRow.index}
                      className="text-ink-3 absolute right-0 left-0 py-4 text-center text-xs"
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      {t(isFetchingNextPage ? "more.loading" : "more.scroll")}
                    </div>
                  );
                }
                const article = articles[virtualRow.index];
                return (
                  <div
                    key={virtualRow.key}
                    ref={virtualizer.measureElement}
                    data-index={virtualRow.index}
                    className="absolute right-0 left-0 pb-2.5"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    {article.isTop
                      ? renderPinnedFeature(article, virtualRow.index)
                      : renderArticleCard(article, virtualRow.index)}
                  </div>
                );
              })}
            </div>
            <p className="text-ink-3 py-4 text-center text-xs">
              {t(hasNextPage ? "loaded" : "loaded.all", {
                count: articles.length,
                amount: articles.length.toLocaleString(locale),
              })}
            </p>
          </>
        )}
      </div>

      <BottomSheet
        open={createOpen}
        title={t("action.create")}
        onClose={() => setCreateOpen(false)}
      >
        <div className="space-y-3">
          <button
            type="button"
            disabled={creating}
            onClick={handleCreate}
            className="bg-page flex w-full items-center gap-3.5 rounded-[18px] p-4 text-left transition-transform active:scale-[0.97] disabled:opacity-60"
          >
            <span className="bg-tag-2-soft text-tag-2 grid h-[46px] w-[46px] shrink-0 place-items-center rounded-2xl">
              <FileText size={21} strokeWidth={1.9} />
            </span>
            <span>
              <span className="text-ink-1 block text-[15px] font-bold">{t("create.blank")}</span>
              <span className="text-ink-2 block text-xs">{t("create.hint")}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setCreateOpen(false);
              toast({ type: "info", text: t("import.soon") });
            }}
            className="bg-page flex w-full items-center gap-3.5 rounded-[18px] p-4 text-left transition-transform active:scale-[0.97]"
          >
            <span className="bg-tag-1-soft text-tag-1 grid h-[46px] w-[46px] shrink-0 place-items-center rounded-2xl">
              <FileDown size={21} strokeWidth={1.9} />
            </span>
            <span>
              <span className="text-ink-1 block text-[15px] font-bold">{t("import.action")}</span>
              <span className="text-ink-2 block text-xs">{t("import.hint")}</span>
            </span>
          </button>
        </div>
      </BottomSheet>

      <ActionSheet
        open={menuArticle !== null}
        title={menuArticle?.title}
        kind={t("type")}
        onClose={() => setMenuArticle(null)}
        items={[
          {
            label: t(menuArticle?.isTop ? "action.unpin" : "action.pin"),
            icon: <Star size={18} />,
            tone: "butter",
            trailing: menuArticle?.isTop ? t("pin.success") : undefined,
            onClick: () => {
              if (menuArticle) {
                toggleTop.mutate(menuArticle, {
                  onError: error => props.onError(error, t("pin.failed")),
                });
              }
              setMenuArticle(null);
            },
          },
          {
            label: t(
              coverUploading
                ? "cover.uploading"
                : menuArticle?.bannerBg
                  ? "cover.change"
                  : "cover.add"
            ),
            icon: coverUploading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <ImagePlus size={18} />
            ),
            tone: "sky",
            onClick: () => {
              setCoverTarget(menuArticle);
              setMenuArticle(null);
              coverInputRef.current?.click();
            },
          },
          {
            label: t("delete.action"),
            danger: true,
            icon: <Trash2 size={18} />,
            onClick: () => {
              setDeleteTarget(menuArticle);
              setMenuArticle(null);
            },
          },
        ]}
      />

      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            void handleCoverFile(file);
          }
        }}
      />

      <MobileConfirmDialog
        open={deleteTarget !== null}
        title={t("delete.action")}
        description={t("delete.description", { title: clampText(deleteTarget?.title ?? "", 18) })}
        danger
        loading={deleteArticle.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteArticle.mutate(deleteTarget.id, {
              onError: error => props.onError(error, t("delete.failed")),
            });
          }
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

export default ArticlesPage;
