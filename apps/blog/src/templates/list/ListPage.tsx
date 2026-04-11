import { memo, useEffect, useMemo, useState } from "react";
import { Header, CardTagFilterPanel } from "@blog/components/Layout";
import DocCollectionsMenu from "@blog/components/Layout/DocCollectionsMenu";
import { Tag, Pagination, ScrollToTop } from "@blog/components/Common";
import { getInitData, formatDate, joinPath } from "@blog/utils";
import { CardTagTree, ListData, ListItem } from "@blog/types";
import "@tau/themes/light.less";
import "@tau/themes/dark.less";

const typeLabels: Record<string, string> = {
  card: "卡片",
  article: "文章",
  doc: "文档",
};

function matchesTag(tag: string, activeTag: string): boolean {
  return tag === activeTag || tag.startsWith(`${activeTag}/`);
}

function buildListBasePath(
  basePath: string,
  type: ListData["type"],
  activeTag?: string,
): string {
  const listHref = joinPath(basePath, `/${type}s`);

  if (!activeTag) {
    return listHref;
  }

  const [pathname, search = ""] = listHref.split("?");
  const params = new URLSearchParams(search);
  params.set("tag", activeTag);
  const query = params.toString();

  return `${pathname}${query ? `?${query}` : ""}`;
}

function buildCardTagTree(items: ListItem[]): CardTagTree[] {
  interface MutableCardTagTreeNode {
    tag: string;
    count: number;
    children: Map<string, MutableCardTagTreeNode>;
  }

  const root = new Map<string, MutableCardTagTreeNode>();

  const getOrCreateNode = (
    parent: Map<string, MutableCardTagTreeNode>,
    tag: string,
  ) => {
    const existing = parent.get(tag);

    if (existing) {
      return existing;
    }

    const node: MutableCardTagTreeNode = {
      tag,
      count: 0,
      children: new Map(),
    };

    parent.set(tag, node);
    return node;
  };

  items.forEach((item) => {
    const countedPaths = new Set<string>();

    item.tags.forEach((rawTag) => {
      const segments = rawTag
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean);

      let parent = root;
      let fullTag = "";

      segments.forEach((segment) => {
        fullTag = fullTag ? `${fullTag}/${segment}` : segment;
        const node = getOrCreateNode(parent, segment);

        if (!countedPaths.has(fullTag)) {
          node.count += 1;
          countedPaths.add(fullTag);
        }

        parent = node.children;
      });
    });
  });

  const toTree = (
    nodeMap: Map<string, MutableCardTagTreeNode>,
  ): CardTagTree[] =>
    [...nodeMap.values()]
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "zh-CN"))
      .map((node) => ({
        tag: node.tag,
        count: node.count,
        cards: [],
        children: toTree(node.children),
      }));

  return toTree(root);
}

const ArticleListRow = memo(
  ({ item, basePath }: { item: ListItem; basePath: string }) => (
    <a
      href={joinPath(basePath, item.href)}
      className="group block border-b border-[var(--color-border-ring)] py-6 transition-colors last:border-b-0 hover:border-[var(--color-border-ring-heavy)]"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-8">
        <div className="min-w-0 flex-1">
          {item.title && (
            <h3 className="text-2xl font-semibold leading-tight text-[var(--color-text-primary)] transition-opacity group-hover:opacity-70">
              {item.title}
            </h3>
          )}
          <p className="mt-3 line-clamp-3 text-sm leading-7 text-[var(--color-text-secondary)] sm:text-[0.95rem]">
            {item.summary}
          </p>
          {item.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {item.tags.map((tag) => (
                <Tag key={tag} name={tag} size="sm" />
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 text-sm tabular-nums text-[var(--color-text-tertiary)] md:pt-1">
          {formatDate(item.createTime)}
        </div>
      </div>
    </a>
  ),
);

ArticleListRow.displayName = "ArticleListRow";

/* 大卡片：首条内容 */
const FeaturedListItem = memo(
  ({ item, basePath }: { item: ListItem; basePath: string }) => (
    <a
      href={joinPath(basePath, item.href)}
      className="featured-card group block fade-in-up stagger-1"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          {item.title && (
            <h3 className="text-2xl font-semibold leading-tight text-[var(--color-text-primary)] transition-opacity group-hover:opacity-70">
              {item.title}
            </h3>
          )}
          <p className="line-clamp-3 text-base leading-relaxed text-[var(--color-text-secondary)]">
            {item.summary}
          </p>
          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {item.tags.slice(0, 4).map((tag) => (
                <Tag key={tag} name={tag} size="sm" />
              ))}
            </div>
          )}
        </div>
        <span className="shrink-0 text-sm text-[var(--color-text-tertiary)]">
          {formatDate(item.createTime)}
        </span>
      </div>
    </a>
  ),
);

FeaturedListItem.displayName = "FeaturedListItem";

const CardListRow = memo(
  ({ item, basePath }: { item: ListItem; basePath: string }) => (
    <a
      href={joinPath(basePath, item.href)}
      className="group block border-b border-[var(--color-border-ring)] py-6 transition-colors last:border-b-0 hover:border-[var(--color-border-ring-heavy)]"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-8">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-4 text-sm leading-8 text-[var(--color-text-secondary)] transition-colors group-hover:text-[var(--color-text-primary)] sm:text-[0.95rem]">
            {item.summary}
          </p>

          {item.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {item.tags.map((tag) => (
                <Tag key={tag} name={tag} size="sm" />
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 text-sm tabular-nums text-[var(--color-text-tertiary)] md:pt-1">
          {formatDate(item.createTime)}
        </div>
      </div>
    </a>
  ),
);

CardListRow.displayName = "CardListRow";

/* 普通卡片 */
const ListItemCard = memo(
  ({ item, basePath }: { item: ListItem; basePath: string }) => (
    <a
      href={joinPath(basePath, item.href)}
      className="timeline-card group block fade-in-up"
    >
      {item.title && (
        <h3 className="mb-2 text-base font-semibold leading-snug text-[var(--color-text-primary)] transition-opacity group-hover:opacity-70">
          {item.title}
        </h3>
      )}
      <p className="mb-4 line-clamp-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
        {item.summary}
      </p>
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {item.tags.slice(0, 3).map((tag) => (
            <Tag key={tag} name={tag} size="sm" />
          ))}
        </div>
        <span className="text-xs text-[var(--color-text-tertiary)]">
          {formatDate(item.createTime)}
        </span>
      </div>
    </a>
  ),
);

ListItemCard.displayName = "ListItemCard";

const ListPage = memo(() => {
  const initData = getInitData();
  const { site, navigation } = initData;
  const list = initData.content as ListData;
  const docCollections = initData.docCollections || [];

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

  const listTitle = list.title || `全部${typeLabels[list.type] || "内容"}`;
  const isArticleList = list.type === "article";
  const isCardList = list.type === "card";
  const getLocationTag = () =>
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tag") || ""
      : "";
  const initialActiveTag = (
    getLocationTag() ||
    initData.activeTag ||
    list.activeTag ||
    ""
  ).trim();
  const [activeTag, setActiveTag] = useState(initialActiveTag);

  useEffect(() => {
    const syncActiveTag = () => {
      setActiveTag(
        (getLocationTag() || initData.activeTag || list.activeTag || "").trim(),
      );
    };

    window.addEventListener("popstate", syncActiveTag);
    return () => {
      window.removeEventListener("popstate", syncActiveTag);
    };
  }, [initData.activeTag, list.activeTag]);

  const handleTagSelect = (tag: string) => {
    const nextTag = tag.trim();
    const href = buildListBasePath(site.basePath, "card", nextTag || undefined);
    window.history.pushState({}, "", href);
    setActiveTag(nextTag);
  };

  const cardTagTree = useMemo(
    () =>
      isCardList
        ? initData.cardTagTree && initData.cardTagTree.length > 0
          ? initData.cardTagTree
          : buildCardTagTree(list.items)
        : [],
    [initData.cardTagTree, isCardList, list.items],
  );

  const filteredItems = useMemo(
    () =>
      isCardList && activeTag
        ? list.items.filter((item) =>
            item.tags.some((tag) => matchesTag(tag, activeTag)),
          )
        : list.items,
    [activeTag, isCardList, list.items],
  );

  const [featured, ...rest] = filteredItems;
  const serverFilteredByTag = Boolean(
    activeTag && (initData.activeTag || list.activeTag),
  );
  const totalCount = activeTag
    ? serverFilteredByTag
      ? list.pagination?.total || filteredItems.length
      : filteredItems.length
    : list.pagination?.total || filteredItems.length;
  const paginationBasePath = buildListBasePath(
    site.basePath,
    list.type,
    isCardList ? activeTag : undefined,
  );

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
        {isCardList ? (
          <div className="h-full min-h-0 px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <div className="grid h-full min-h-0 gap-8 lg:grid-cols-[280px_minmax(0,1fr)] xl:gap-10">
              <div className="hidden min-h-0 lg:block">
                <div className="panel-scroll-area scroll-region-contained scrollbar-hidden">
                  <CardTagFilterPanel
                    tagTree={cardTagTree}
                    basePath={site.basePath}
                    activeTag={activeTag}
                    onSelectTag={handleTagSelect}
                  />
                </div>
              </div>

              <section className="min-h-0 min-w-0">
                <div
                  className="panel-scroll-area"
                  data-primary-scroll-container
                >
                  <div className="mx-auto max-w-4xl">
                    <div className="mb-8 sm:mb-10">
                      <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-3xl font-bold text-[var(--color-text-primary)] sm:text-4xl">
                          {listTitle}
                        </h1>
                        {activeTag && <Tag name={activeTag} active size="sm" />}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)] sm:text-base">
                        共 {totalCount} 张卡片
                        {activeTag && "，包含当前标签及其子标签"}
                      </p>
                    </div>

                    {filteredItems.length > 0 ? (
                      filteredItems.map((item) => (
                        <CardListRow
                          key={item.id}
                          item={item}
                          basePath={site.basePath}
                        />
                      ))
                    ) : (
                      <div className="empty-state content-panel">
                        <p className="text-base font-medium">
                          当前标签下暂无卡片
                        </p>
                        <p className="mt-1 text-sm">
                          可以切换左侧标签，或返回全部卡片查看完整内容
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>
        ) : (
          <div className="h-full min-h-0 px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <div className="panel-scroll-area" data-primary-scroll-container>
              <div className="list-column py-4">
                {/* 页面标题 */}
                <div className="mb-10 text-center">
                  <h1 className="text-3xl font-bold text-[var(--color-text-primary)] sm:text-4xl">
                    {listTitle}
                  </h1>
                  <p className="mt-3 text-base text-[var(--color-text-secondary)]">
                    共 {list.pagination?.total || list.items.length} 篇内容
                  </p>
                </div>

                {/* 内容列表 */}
                {filteredItems.length > 0 ? (
                  <div
                    className={
                      isArticleList ? "mx-auto max-w-4xl" : "space-y-8"
                    }
                  >
                    {isArticleList ? (
                      filteredItems.map((item) => (
                        <ArticleListRow
                          key={item.id}
                          item={item}
                          basePath={site.basePath}
                        />
                      ))
                    ) : (
                      <>
                        {/* 首条大卡片 */}
                        {featured && (
                          <FeaturedListItem
                            item={featured}
                            basePath={site.basePath}
                          />
                        )}

                        {/* 剩余双列 */}
                        {rest.length > 0 && (
                          <div className="grid gap-6 sm:grid-cols-2">
                            {rest.map((item) => (
                              <ListItemCard
                                key={item.id}
                                item={item}
                                basePath={site.basePath}
                              />
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="empty-state">
                    <p className="text-base font-medium">暂无内容</p>
                    <p className="mt-1 text-sm">开始创作你的第一篇内容吧</p>
                  </div>
                )}

                {/* 分页 */}
                {list.pagination &&
                  list.pagination.total > list.pagination.pageSize && (
                    <div className="mt-16">
                      <Pagination
                        current={list.pagination.current}
                        total={list.pagination.total}
                        pageSize={list.pagination.pageSize}
                        basePath={paginationBasePath}
                      />
                    </div>
                  )}
              </div>
            </div>
          </div>
        )}
      </main>

      <ScrollToTop />
    </div>
  );
});

ListPage.displayName = "ListPage";

export default ListPage;
