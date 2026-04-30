import { memo, useMemo } from "react";
import { motion } from "motion/react";
import { Header } from "@blog/components/Layout";
import DocCollectionsMenu from "@blog/components/Layout/DocCollectionsMenu";
import { Tag, ScrollToTop } from "@blog/components/Common";
import { Editor, EditorServicesProvider } from "@tau/editor";
import { getInitData, formatDate, getReadingTime, joinPath } from "@blog/utils";
import { CardData, LinkedCardInfo } from "@blog/types";
import DndProvider from "@blog/components/DndProvider";
import { createBlogEditorServices } from "@blog/services/editorServices";
import { blogEditorExtensions } from "@blog/editorExtensions";
import { fadeUp, defaultTransition } from "@blog/utils/motion";
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
      className="group flex items-start gap-3 rounded-lg py-3 transition-colors hover:bg-[var(--color-bg-canvas)] px-3 -mx-3"
    >
      <span className="shrink-0 text-sm leading-relaxed text-[var(--color-text-quaternary)] transition-colors group-hover:text-[var(--color-accent)]">
        &rarr;
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
              <motion.div
                className="mb-8"
                initial={fadeUp.hidden}
                animate={fadeUp.visible}
                transition={defaultTransition}
              >
                <p className="text-xs font-medium uppercase tracking-[0.15em] text-[var(--color-text-tertiary)]">
                  {formatDate(card.createTime)} · 约 {readingTime} 分钟
                </p>
                {card.tags && card.tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {card.tags.map((tag) => (
                      <Tag
                        key={tag}
                        name={tag}
                        href={buildCardListTagHref(site.basePath, tag)}
                      />
                    ))}
                  </div>
                )}
              </motion.div>

              <div className="mb-10 flex">
                <div className="h-px w-16 bg-[var(--color-border-ring-heavy)]" />
              </div>

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

              {/* 相关卡片 */}
              {relatedCards.length > 0 && (
                <div className="mt-14">
                  <div className="flex">
                    <div className="h-px w-16 bg-[var(--color-border-ring-heavy)]" />
                  </div>
                  <h4 className="mt-6 mb-4 text-xs font-medium uppercase tracking-[0.15em] text-[var(--color-text-tertiary)]">
                    相关卡片
                  </h4>
                  <div className="space-y-0">
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
