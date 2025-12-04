import { memo, useMemo } from "react";
import classNames from "classnames";
import { Header, CardTagPanel } from "@blog/components/Layout";
import DocCollectionsMenu from "@blog/components/Layout/DocCollectionsMenu";
import { Tag } from "@blog/components/Common";
import Editor from "@/components/Editor";
import Outline from "@/components/Outline";
import { getInitData, formatDate, getReadingTime, joinPath } from "@blog/utils";
import { CardData, LinkedCardInfo } from "@blog/types";
import { HeaderElement } from "@/components/Editor/types";
import { getInlineElementText } from "@/utils";
import DndProvider from "@/components/DndProvider";
// 导入主项目的主题样式
import "@/themes/light.less";
import "@/themes/dark.less";

const categoryLabels = {
  temporary: "闪念",
  permanent: "永久",
  theme: "主题",
  literature: "文献",
};

const categoryStyles = {
  temporary: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  permanent: {
    bg: "bg-sky-500/10",
    border: "border-sky-500/30",
    text: "text-sky-600 dark:text-sky-400",
    dot: "bg-sky-500",
  },
  theme: {
    bg: "bg-violet-500/10",
    border: "border-violet-500/30",
    text: "text-violet-600 dark:text-violet-400",
    dot: "bg-violet-500",
  },
  literature: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
};

// 分类标签组件
const CategoryBadge = memo(
  ({ category }: { category: keyof typeof categoryLabels }) => {
    const style = categoryStyles[category];
    return (
      <span
        className={classNames(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
          style.bg,
          style.border,
          style.text,
        )}
      >
        <span className={classNames("h-1.5 w-1.5 rounded-full", style.dot)} />
        {categoryLabels[category]}
      </span>
    );
  },
);

CategoryBadge.displayName = "CategoryBadge";

// 关联卡片组件
const LinkedCardItem = memo(
  ({ card, basePath }: { card: LinkedCardInfo; basePath: string }) => {
    const style = categoryStyles[card.category];
    return (
      <a
        href={joinPath(basePath, card.href)}
        className="group block rounded-xl border border-(--color-border-primary) bg-[var(--color-bg-container)] p-4 transition-all hover:border-[var(--color-border-accent)] hover:shadow-md"
      >
        <div className="mb-2.5">
          <span
            className={classNames(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wider",
              style.bg,
              style.border,
              style.text,
            )}
          >
            <span className={classNames("h-1 w-1 rounded-full", style.dot)} />
            {categoryLabels[card.category]}
          </span>
        </div>
        <p className="line-clamp-2 text-sm leading-relaxed text-[var(--color-text-secondary)] transition-colors group-hover:text-[var(--color-text-primary)]">
          {card.summary}
        </p>
      </a>
    );
  },
);

LinkedCardItem.displayName = "LinkedCardItem";

// 从内容中提取标题
function extractHeaders(content: unknown[]) {
  const headers: { level: number; title: string }[] = [];
  for (const node of content) {
    if (node && typeof node === "object") {
      const n = node as Record<string, unknown>;
      if (n.type === "header" && Array.isArray(n.children)) {
        const header = n as unknown as HeaderElement;
        headers.push({
          level: header.level,
          title: header.children.map(getInlineElementText).join(""),
        });
      }
    }
  }
  return headers;
}

// 侧边栏区块组件
const SidebarSection = memo(
  ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="sidebar-container">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
        <span className="h-4 w-1 rounded-full bg-gradient-to-b from-[var(--color-primary)] to-cyan-400" />
        {title}
      </h3>
      {children}
    </div>
  ),
);

SidebarSection.displayName = "SidebarSection";

const CardPage = memo(() => {
  const initData = getInitData();
  const { site, navigation, cardTagTree } = initData;
  const card = initData.content as CardData;
  const docCollections = initData.docCollections || [];

  // 从 URL 参数读取 tagHint，优先使用它作为 activeTag
  const urlParams = new URLSearchParams(window.location.search);
  const tagHint = urlParams.get("tagHint");

  // 如果有 tagHint 且卡片确实包含该标签，则使用 tagHint；否则使用默认的 activeTag
  const activeTag = useMemo(() => {
    if (
      tagHint &&
      card.tags?.some((tag) => tag === tagHint || tag.startsWith(tagHint + "/"))
    ) {
      return tagHint;
    }
    return initData.activeTag || "";
  }, [tagHint, card.tags, initData.activeTag]);

  const readingTime = useMemo(
    () => getReadingTime(card.content),
    [card.content],
  );

  const headers = useMemo(() => extractHeaders(card.content), [card.content]);

  const handleHeaderClick = (index: number) => {
    const headerElements = document.querySelectorAll(
      '[data-slate-node="element"][data-type="header"]',
    );
    const target = headerElements[index];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const hasLinkedCards = card.linkedCards && card.linkedCards.length > 0;
  const hasRelatedCards = card.relatedCards && card.relatedCards.length > 0;
  const hasSidebar = headers.length > 0 || hasLinkedCards || hasRelatedCards;

  const desktopDocNav =
    docCollections.length > 0 ? (
      <DocCollectionsMenu
        collections={docCollections}
        basePath={site.basePath}
        variant="desktop"
      />
    ) : undefined;
  const mobileDocNav =
    docCollections.length > 0 ? (
      <DocCollectionsMenu
        collections={docCollections}
        basePath={site.basePath}
        variant="mobile"
      />
    ) : undefined;

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        title={site.title}
        basePath={site.basePath}
        navigation={navigation}
        customNav={desktopDocNav}
        mobileCustomNav={mobileDocNav}
      />

      <main className="flex-1 py-10">
        <div className="mx-auto flex max-w-7xl gap-8 px-4 sm:px-6 lg:px-8">
          {/* 左侧标签导航 */}
          {cardTagTree && cardTagTree.length > 0 && (
            <aside className="hidden w-64 shrink-0 lg:block">
              <div className="sticky top-[104px] max-h-[calc(100vh-104px-2rem)] overflow-y-auto pb-8">
                <CardTagPanel
                  tagTree={cardTagTree}
                  basePath={site.basePath}
                  activeTag={activeTag}
                  activeCardId={card.id}
                  title="标签导航"
                />
              </div>
            </aside>
          )}

          {/* 主内容区 */}
          <article className="min-w-0 flex-1 space-y-6">
            {/* 卡片内容 */}
            <DndProvider>
              <div className="content-area overflow-hidden">
                {/* 顶部装饰条 */}
                <div className="h-1 w-full bg-gradient-to-r from-[var(--color-primary)] via-cyan-400 to-transparent" />

                <div className="p-6 sm:p-8">
                  {/* 元信息区域 */}
                  <div className="mb-8 border-b border-[var(--color-border-secondary)] pb-6">
                    {/* 分类和元信息 */}
                    <div className="flex flex-wrap items-center gap-4">
                      <CategoryBadge category={card.category} />
                      <div className="flex items-center gap-3 text-sm text-[var(--color-text-tertiary)]">
                        <span className="flex items-center gap-1.5">
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                            />
                          </svg>
                          {formatDate(card.createTime)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          约 {readingTime} 分钟
                        </span>
                      </div>
                    </div>

                    {/* 标签 */}
                    {card.tags && card.tags.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {card.tags.map((tag) => (
                          <Tag
                            key={tag}
                            name={tag}
                            href={joinPath(
                              site.basePath,
                              `/cards?tag=${encodeURIComponent(tag)}`,
                            )}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 正文内容 */}
                  <Editor initValue={card.content} readonly />
                </div>
              </div>
            </DndProvider>

            {/* 更新时间 */}
            {card.updateTime !== card.createTime && (
              <div className="flex items-center gap-2 text-sm text-[var(--color-text-quaternary)]">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                  />
                </svg>
                最后更新于 {formatDate(card.updateTime, "full")}
              </div>
            )}
          </article>

          {/* 右侧边栏 */}
          {hasSidebar && (
            <aside className="hidden w-64 shrink-0 xl:block">
              <div className="sticky top-[104px] max-h-[calc(100vh-104px-2rem)] space-y-5 overflow-y-auto pb-8">
                {/* 目录 */}
                {headers.length > 0 && (
                  <SidebarSection title="目录">
                    <Outline headers={headers} onClick={handleHeaderClick} />
                  </SidebarSection>
                )}

                {/* 关联卡片 */}
                {hasLinkedCards && (
                  <SidebarSection title="关联卡片">
                    <div className="space-y-3">
                      {card.linkedCards!.slice(0, 5).map((linkedCard) => (
                        <LinkedCardItem
                          key={linkedCard.id}
                          card={linkedCard}
                          basePath={site.basePath}
                        />
                      ))}
                    </div>
                  </SidebarSection>
                )}

                {/* 相关卡片 */}
                {hasRelatedCards && (
                  <SidebarSection title="相关卡片">
                    <div className="space-y-3">
                      {card.relatedCards!.slice(0, 5).map((relatedCard) => (
                        <LinkedCardItem
                          key={relatedCard.id}
                          card={relatedCard}
                          basePath={site.basePath}
                        />
                      ))}
                    </div>
                  </SidebarSection>
                )}
              </div>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
});

CardPage.displayName = "CardPage";

export default CardPage;
