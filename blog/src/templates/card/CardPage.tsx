import { memo, useMemo } from "react";
import { Header, Footer, CardTagPanel } from "@blog/components/Layout";
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

const categoryColors = {
  temporary: "bg-yellow-500",
  permanent: "bg-blue-500",
  theme: "bg-purple-500",
  literature: "bg-green-500",
};

// 关联卡片组件
const LinkedCardItem = memo(
  ({ card, basePath }: { card: LinkedCardInfo; basePath: string }) => (
    <a
      href={joinPath(basePath, card.href)}
      className="block rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-canvas)] p-3 transition-colors hover:border-[var(--color-primary)]/50"
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`${categoryColors[card.category]} rounded-full px-2 py-0.5 text-xs text-white`}
        >
          {categoryLabels[card.category]}
        </span>
      </div>
      <p className="line-clamp-2 text-sm text-[var(--color-text-secondary)]">
        {card.summary}
      </p>
      {card.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {card.tags.slice(0, 2).map((tag) => (
            <Tag key={tag} name={tag} size="sm" />
          ))}
        </div>
      )}
    </a>
  ),
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

const CardPage = memo(() => {
  const initData = getInitData();
  const { site, navigation, cardTagTree, activeTag } = initData;
  const card = initData.content as CardData;

  const readingTime = useMemo(
    () => getReadingTime(card.content),
    [card.content],
  );

  const headers = useMemo(() => extractHeaders(card.content), [card.content]);

  const handleHeaderClick = (index: number) => {
    // 滚动到对应标题
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

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        title={site.title}
        basePath={site.basePath}
        navigation={navigation}
      />

      <main className="flex-1 py-12">
        <div className="mx-auto flex max-w-7xl gap-8 px-4">
          {/* 左侧：标签树（卡片直接显示在对应标签下） */}
          {cardTagTree && cardTagTree.length > 0 && (
            <aside className="sticky top-20 w-64 shrink-0 overflow-y-auto">
              <CardTagPanel
                tagTree={cardTagTree}
                basePath={site.basePath}
                activeTag={activeTag}
                activeCardId={card.id}
                title="标签导航"
              />
            </aside>
          )}

          {/* 卡片内容 */}
          <article className="min-w-0 flex-1">
            <div className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-container)] p-8">
              {/* 卡片元信息 */}
              <div className="mb-6 flex flex-wrap items-center gap-4 text-sm text-[var(--color-text-secondary)]">
                {/* 分类标签 */}
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white ${categoryColors[card.category]}`}
                >
                  {categoryLabels[card.category]}
                </span>

                {/* 创建时间 */}
                <span className="flex items-center gap-1">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  {formatDate(card.createTime)}
                </span>

                {/* 阅读时间 */}
                <span className="flex items-center gap-1">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  约 {readingTime} 分钟阅读
                </span>
              </div>

              {/* 卡片内容 - 使用主项目的 Editor */}
              <DndProvider>
                <div className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-container)] p-8">
                  <Editor initValue={card.content} readonly />
                </div>
              </DndProvider>

              {/* 标签 */}
              {card.tags && card.tags.length > 0 && (
                <div className="mt-8 flex flex-wrap gap-2 border-t border-[var(--color-border-secondary)] pt-6">
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

            {/* 更新时间 */}
            {card.updateTime !== card.createTime && (
              <div className="mt-4 text-sm text-[var(--color-text-tertiary)]">
                最后更新于 {formatDate(card.updateTime, "full")}
              </div>
            )}
          </article>

          {/* 右侧侧边栏 */}
          {hasSidebar && (
            <aside className="hidden w-64 shrink-0 lg:block">
              <div className="sticky top-20 space-y-6">
                {/* 目录 - 复用主项目的 Outline 组件 */}
                {headers.length > 0 && (
                  <div className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-container)] p-4">
                    <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
                      目录
                    </h3>
                    <Outline headers={headers} onClick={handleHeaderClick} />
                  </div>
                )}

                {/* 关联卡片 */}
                {hasLinkedCards && (
                  <div className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-container)] p-4">
                    <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
                      关联卡片
                    </h3>
                    <div className="space-y-3">
                      {card.linkedCards!.slice(0, 5).map((linkedCard) => (
                        <LinkedCardItem
                          key={linkedCard.id}
                          card={linkedCard}
                          basePath={site.basePath}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* 相关卡片（相同标签） */}
                {hasRelatedCards && (
                  <div className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-container)] p-4">
                    <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
                      相关卡片
                    </h3>
                    <div className="space-y-3">
                      {card.relatedCards!.slice(0, 5).map((relatedCard) => (
                        <LinkedCardItem
                          key={relatedCard.id}
                          card={relatedCard}
                          basePath={site.basePath}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </main>

      <Footer title={site.title} />
    </div>
  );
});

CardPage.displayName = "CardPage";

export default CardPage;
