import { memo, useMemo } from "react";
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

function buildCardListTagHref(basePath: string, tag: string): string {
  const listHref = joinPath(basePath, "/cards");
  const [pathname, search = ""] = listHref.split("?");
  const params = new URLSearchParams(search);
  params.set("tag", tag);
  const query = params.toString();

  return `${pathname}${query ? `?${query}` : ""}`;
}

const LinkedCardItem = memo(
  ({ card, basePath }: { card: LinkedCardInfo; basePath: string }) => (
    <a
      href={joinPath(basePath, card.href)}
      className="group block rounded-xl p-4 transition-all content-panel"
    >
      <p className="line-clamp-3 text-sm leading-relaxed text-[var(--color-text-secondary)] transition-colors group-hover:text-[var(--color-text-primary)]">
        {card.summary}
      </p>
    </a>
  ),
);

LinkedCardItem.displayName = "LinkedCardItem";

const CardPage = memo(() => {
  const initData = getInitData();
  const { site, navigation } = initData;
  const card = initData.content as CardData;
  const docCollections = initData.docCollections || [];

  const readingTime = useMemo(
    () => getReadingTime(card.content),
    [card.content],
  );

  const relatedCards = useMemo<LinkedCardInfo[]>(
    () => card.linkedCards || [],
    [card.linkedCards],
  );

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
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <Header
        title={site.title}
        basePath={site.basePath}
        navigation={navigation}
        customNav={desktopDocNav}
        mobileCustomNav={mobileDocNav}
      />

      <main className="min-h-0 flex-1 overflow-hidden">
        <div className="h-full min-h-0 px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="panel-scroll-area" data-primary-scroll-container>
            <div className="wide-prose-column">
              {/* 卡片元信息 */}
              <div className="mb-8">
                <p className="text-sm text-[var(--color-text-secondary)]">
                  {formatDate(card.createTime)} · 约 {readingTime} 分钟
                </p>
                {card.tags && card.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {card.tags.map((tag) => (
                      <Tag
                        key={tag}
                        name={tag}
                        href={buildCardListTagHref(site.basePath, tag)}
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

              {/* 相关卡片（仅展示显式关联） */}
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
        </div>
      </main>

      <ScrollToTop />
    </div>
  );
});

CardPage.displayName = "CardPage";

export default CardPage;
