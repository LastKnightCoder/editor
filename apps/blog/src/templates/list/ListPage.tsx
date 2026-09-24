import { memo, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Header, CardTagFilterPanel } from "@blog/components/Layout";
import DocCollectionsMenu from "@blog/components/Layout/DocCollectionsMenu";
import { Tag, Pagination, ScrollToTop } from "@blog/components/Common";
import { getInitData, formatDate, joinPath } from "@blog/utils";
import { CardTagTree, ListData, ListItem } from "@blog/types";
import { fadeUp, staggerContainer, defaultTransition } from "@blog/utils/motion";
import "@tau/themes/light.less";
import "@tau/themes/dark.less";

const typeLabels: Record<string, string> = {
  card: "卡片",
  article: "文章",
  doc: "文档",
  quest: "求索录",
};

const questStatusLabels: Record<string, string> = {
  not_started: "未开始",
  in_progress: "进行中",
  resolved: "已解决",
};

function matchesTag(tag: string, activeTag: string): boolean {
  return tag === activeTag || tag.startsWith(`${activeTag}/`);
}

function buildListBasePath(basePath: string, type: ListData["type"], activeTag?: string): string {
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

  const getOrCreateNode = (parent: Map<string, MutableCardTagTreeNode>, tag: string) => {
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

  items.forEach(item => {
    const countedPaths = new Set<string>();

    item.tags.forEach(rawTag => {
      const segments = rawTag
        .split("/")
        .map(segment => segment.trim())
        .filter(Boolean);

      let parent = root;
      let fullTag = "";

      segments.forEach(segment => {
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

  const toTree = (nodeMap: Map<string, MutableCardTagTreeNode>): CardTagTree[] =>
    [...nodeMap.values()]
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "zh-CN"))
      .map(node => ({
        tag: node.tag,
        count: node.count,
        cards: [],
        children: toTree(node.children),
      }));

  return toTree(root);
}

const ArticleListRow = memo(({ item, basePath }: { item: ListItem; basePath: string }) => (
  <a
    href={joinPath(basePath, item.href)}
    className="group grid grid-cols-1 gap-2 rounded-xl py-8 transition-colors hover:bg-[var(--color-bg-canvas)] md:-mx-4 md:grid-cols-[7rem_1fr] md:gap-8 md:px-4"
  >
    <div className="shrink-0 text-sm tabular-nums text-[var(--color-text-tertiary)] md:pt-1.5">
      {formatDate(item.createTime)}
    </div>
    <div className="min-w-0 flex-1">
      {item.title && (
        <h3 className="text-xl font-semibold leading-tight text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-accent)]">
          {item.title}
        </h3>
      )}
      <p className="mt-2 line-clamp-2 text-sm leading-[1.8] text-[var(--color-text-secondary)]">
        {item.summary}
      </p>
      {item.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.tags.map(tag => (
            <Tag key={tag} name={tag} size="sm" />
          ))}
        </div>
      )}
    </div>
  </a>
));

ArticleListRow.displayName = "ArticleListRow";

const CardListRow = memo(({ item, basePath }: { item: ListItem; basePath: string }) => (
  <a
    href={joinPath(basePath, item.href)}
    className="group grid grid-cols-1 gap-2 rounded-xl py-6 transition-colors hover:bg-[var(--color-bg-canvas)] md:-mx-4 md:grid-cols-[7rem_1fr] md:gap-8 md:px-4"
  >
    <div className="shrink-0 text-sm tabular-nums text-[var(--color-text-tertiary)] md:pt-0.5">
      {formatDate(item.createTime)}
    </div>
    <div className="min-w-0 flex-1">
      <p className="line-clamp-3 text-sm leading-[1.9] text-[var(--color-text-secondary)] transition-colors group-hover:text-[var(--color-text-primary)]">
        {item.summary}
      </p>
      {item.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.tags.map(tag => (
            <Tag key={tag} name={tag} size="sm" />
          ))}
        </div>
      )}
    </div>
  </a>
));

CardListRow.displayName = "CardListRow";

const QuestListRow = memo(({ item, basePath }: { item: ListItem; basePath: string }) => (
  <a
    href={joinPath(basePath, item.href)}
    className="group grid grid-cols-1 gap-2 rounded-xl py-7 transition-colors hover:bg-[var(--color-bg-canvas)] md:-mx-4 md:grid-cols-[7rem_1fr] md:gap-8 md:px-4"
  >
    <div className="shrink-0 text-sm tabular-nums text-[var(--color-text-tertiary)] md:pt-1">
      {formatDate(item.updateTime || item.createTime)}
    </div>
    <div className="min-w-0 flex-1">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {item.groupTitle && <Tag name={item.groupTitle} size="sm" />}
        {item.status && (
          <span className="tag">{questStatusLabels[item.status] || item.status}</span>
        )}
        <span className="text-xs text-[var(--color-text-tertiary)]">
          {item.answerCount || 0} 答案
        </span>
      </div>
      <h3 className="line-clamp-2 text-xl font-semibold leading-tight text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-accent)]">
        {item.title || item.summary}
      </h3>
      <p className="mt-2 line-clamp-2 text-sm leading-[1.8] text-[var(--color-text-secondary)]">
        {item.summary}
      </p>
    </div>
  </a>
));

QuestListRow.displayName = "QuestListRow";

const ListPage = memo(() => {
  const initData = getInitData();
  const { site, navigation } = initData;
  const list = initData.content as ListData;
  const docCollections = initData.docCollections || [];

  const desktopDocNav =
    docCollections.length > 0 ? (
      <DocCollectionsMenu collections={docCollections} basePath={site.basePath} variant="desktop" />
    ) : undefined;
  const mobileDocNav =
    docCollections.length > 0 ? (
      <DocCollectionsMenu collections={docCollections} basePath={site.basePath} variant="mobile" />
    ) : undefined;

  const listTitle = list.title || `全部${typeLabels[list.type] || "内容"}`;
  const isArticleList = list.type === "article";
  const isCardList = list.type === "card";
  const isQuestList = list.type === "quest";
  const getLocationTag = () =>
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tag") || ""
      : "";
  const initialActiveTag = (getLocationTag() || initData.activeTag || list.activeTag || "").trim();
  const [activeTag, setActiveTag] = useState(initialActiveTag);

  useEffect(() => {
    const syncActiveTag = () => {
      setActiveTag((getLocationTag() || initData.activeTag || list.activeTag || "").trim());
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
    [initData.cardTagTree, isCardList, list.items]
  );

  const filteredItems = useMemo(
    () =>
      isCardList && activeTag
        ? list.items.filter(item => item.tags.some(tag => matchesTag(tag, activeTag)))
        : list.items,
    [activeTag, isCardList, list.items]
  );

  const serverFilteredByTag = Boolean(activeTag && (initData.activeTag || list.activeTag));
  const totalCount = activeTag
    ? serverFilteredByTag
      ? list.pagination?.total || filteredItems.length
      : filteredItems.length
    : list.pagination?.total || filteredItems.length;
  const paginationBasePath = buildListBasePath(
    site.basePath,
    list.type,
    isCardList ? activeTag : undefined
  );

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <Header
        title={site.title}
        basePath={site.basePath}
        navigation={navigation}
        customNav={desktopDocNav}
        mobileCustomNav={mobileDocNav}
        searchHref={initData.search?.href}
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
                <div className="panel-scroll-area" data-primary-scroll-container>
                  <div className="mx-auto max-w-4xl">
                    <motion.div
                      className="mb-10"
                      initial={fadeUp.hidden}
                      animate={fadeUp.visible}
                      transition={defaultTransition}
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
                          {listTitle}
                        </h1>
                        {activeTag && <Tag name={activeTag} active size="sm" />}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                        共 {totalCount} 张卡片
                        {activeTag && "，包含当前标签及其子标签"}
                      </p>
                    </motion.div>

                    {filteredItems.length > 0 ? (
                      <motion.div
                        key={activeTag || "__all_cards__"}
                        variants={staggerContainer}
                        initial="hidden"
                        animate="visible"
                      >
                        {filteredItems.map(item => (
                          <motion.div
                            key={item.id}
                            variants={fadeUp}
                            transition={defaultTransition}
                          >
                            <CardListRow item={item} basePath={site.basePath} />
                          </motion.div>
                        ))}
                      </motion.div>
                    ) : (
                      <div className="empty-state content-panel">
                        <p className="text-base font-medium">当前标签下暂无卡片</p>
                        <p className="mt-1 text-sm">可以切换左侧标签，或返回全部卡片查看完整内容</p>
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
                {/* 页面标题：左对齐 */}
                <motion.div
                  className="mb-12"
                  initial={fadeUp.hidden}
                  animate={fadeUp.visible}
                  transition={defaultTransition}
                >
                  <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
                    {listTitle}
                  </h1>
                  <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
                    共 {list.pagination?.total || list.items.length}{" "}
                    {isQuestList ? "条求索" : "篇内容"}
                  </p>
                </motion.div>

                {/* 内容列表 */}
                {filteredItems.length > 0 ? (
                  <motion.div
                    className={isArticleList ? "mx-auto max-w-4xl" : ""}
                    variants={staggerContainer}
                    initial="hidden"
                    animate="visible"
                  >
                    {filteredItems.map(item => (
                      <motion.div key={item.id} variants={fadeUp} transition={defaultTransition}>
                        {isArticleList ? (
                          <ArticleListRow item={item} basePath={site.basePath} />
                        ) : isQuestList ? (
                          <QuestListRow item={item} basePath={site.basePath} />
                        ) : (
                          <CardListRow item={item} basePath={site.basePath} />
                        )}
                      </motion.div>
                    ))}
                  </motion.div>
                ) : (
                  <div className="empty-state">
                    <p className="text-base font-medium">暂无内容</p>
                    <p className="mt-1 text-sm">开始创作你的第一篇内容吧</p>
                  </div>
                )}

                {/* 分页 */}
                {list.pagination && list.pagination.total > list.pagination.pageSize && (
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
