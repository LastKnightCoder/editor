import { memo, useMemo } from "react";
import classNames from "classnames";
import { Header } from "@blog/components/Layout";
import DocCollectionsMenu from "@blog/components/Layout/DocCollectionsMenu";
import { Tag, ScrollToTop } from "@blog/components/Common";
import { Editor, EditorServicesProvider } from "@tau/editor";
import { getInitData, formatDate, getReadingTime, joinPath } from "@blog/utils";
import { CardData, LinkedCardInfo } from "@blog/types";
import DndProvider from "@blog/components/DndProvider";
import { createBlogEditorServices } from "@blog/services/editorServices";
import { blogEditorExtensions } from "@blog/editorExtensions";
import "@tau/themes/light.less";
import "@tau/themes/dark.less";

const categoryLabels: Record<string, string> = {
  temporary: "闪念",
  permanent: "永久",
  theme: "主题",
  literature: "文献",
};

const LinkedCardItem = memo(
  ({ card, basePath }: { card: LinkedCardInfo; basePath: string }) => (
    <a
      href={joinPath(basePath, card.href)}
      className="group block rounded-xl p-4 transition-all content-panel"
    >
      <span className="mb-1.5 block text-xs font-medium text-[var(--color-text-tertiary)]">
        {categoryLabels[card.category] || card.category}
      </span>
      <p className="line-clamp-2 text-sm leading-relaxed text-[var(--color-text-secondary)] transition-colors group-hover:text-[var(--color-text-primary)]">
        {card.summary}
      </p>
    </a>
  ),
);

LinkedCardItem.displayName = "LinkedCardItem";

const CardPage = memo(() => {
  const initData = getInitData();
  const { site, navigation, cardTagTree } = initData;
  const card = initData.content as CardData;
  const docCollections = initData.docCollections || [];

  const urlParams = new URLSearchParams(window.location.search);
  const tagHint = urlParams.get("tagHint");

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

  /* 合并关联卡片和相关卡片为一个列表（去重） */
  const relatedCards = useMemo(() => {
    const linked = card.linkedCards || [];
    const related = card.relatedCards || [];
    const seen = new Set<number>();
    const merged: LinkedCardInfo[] = [];
    for (const c of [...linked, ...related]) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        merged.push(c);
      }
    }
    return merged;
  }, [card.linkedCards, card.relatedCards]);

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

  const flatTags = useMemo(() => {
    if (!cardTagTree || cardTagTree.length === 0) return [];
    const tags: { tag: string; count: number; fullTag: string }[] = [];
    const walk = (items: typeof cardTagTree, parentTag: string) => {
      for (const item of items) {
        const fullTag = parentTag ? `${parentTag}/${item.tag}` : item.tag;
        tags.push({ tag: item.tag, count: item.count, fullTag });
        if (item.children && item.children.length > 0) {
          walk(item.children, fullTag);
        }
      }
    };
    walk(cardTagTree, "");
    return tags;
  }, [cardTagTree]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        title={site.title}
        basePath={site.basePath}
        navigation={navigation}
        customNav={desktopDocNav}
        mobileCustomNav={mobileDocNav}
      />

      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="wide-prose-column py-12 sm:py-16">
            {/* 顶部水平标签栏 */}
            {flatTags.length > 0 && (
              <div className="tag-scroll-bar mb-8">
                {flatTags.map((t) => (
                  <a
                    key={t.fullTag}
                    href={joinPath(
                      site.basePath,
                      `/cards?tag=${encodeURIComponent(t.fullTag)}`,
                    )}
                    className={classNames(
                      "tag shrink-0",
                      (activeTag === t.fullTag ||
                        activeTag.startsWith(t.fullTag + "/")) &&
                        "active",
                    )}
                  >
                    {t.tag}
                  </a>
                ))}
              </div>
            )}

            {/* 卡片元信息 */}
            <div className="mb-8">
              <p className="text-sm text-[var(--color-text-secondary)]">
                {categoryLabels[card.category] || card.category} ·{" "}
                {formatDate(card.createTime)} · 约 {readingTime} 分钟
              </p>
              {card.tags && card.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
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

            <div className="mb-8 h-px bg-[var(--color-border-ring)]" />

            {/* 正文 */}
            <DndProvider>
              <EditorServicesProvider services={createBlogEditorServices()}>
                <Editor
                  initValue={card.content}
                  readonly
                  extensions={blogEditorExtensions}
                />
              </EditorServicesProvider>
            </DndProvider>

            {/* 更新时间 */}
            {card.updateTime !== card.createTime && (
              <p className="mt-8 text-sm text-[var(--color-text-tertiary)]">
                最后更新于 {formatDate(card.updateTime, "full")}
              </p>
            )}

            {/* 相关卡片（合并了关联卡片和相关卡片） */}
            {relatedCards.length > 0 && (
              <div className="mt-12">
                <div className="h-px bg-[var(--color-border-ring)]" />
                <h4 className="mt-6 mb-4 text-sm font-semibold text-[var(--color-text-primary)]">
                  相关卡片
                </h4>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {relatedCards.slice(0, 6).map((c) => (
                    <LinkedCardItem
                      key={c.id}
                      card={c}
                      basePath={site.basePath}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <ScrollToTop />
    </div>
  );
});

CardPage.displayName = "CardPage";

export default CardPage;
