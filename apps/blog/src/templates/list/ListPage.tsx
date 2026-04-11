import { memo } from "react";
import classNames from "classnames";
import { Header, Footer } from "@blog/components/Layout";
import DocCollectionsMenu from "@blog/components/Layout/DocCollectionsMenu";
import { Tag, Pagination, ScrollToTop } from "@blog/components/Common";
import { getInitData, formatDate, joinPath } from "@blog/utils";
import { ListData, ListItem } from "@blog/types";
import "@tau/themes/light.less";
import "@tau/themes/dark.less";

const typeLabels: Record<string, string> = {
  card: "卡片",
  article: "文章",
  doc: "文档",
};

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

  const [featured, ...rest] = list.items;

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
          <div className="list-column py-16 sm:py-20">
            {/* 页面标题 */}
            <div className="mb-10 text-center">
              <h1 className="text-3xl font-bold text-[var(--color-text-primary)] sm:text-4xl">
                {list.title || `全部${typeLabels[list.type] || "内容"}`}
              </h1>
              <p className="mt-3 text-base text-[var(--color-text-secondary)]">
                共 {list.pagination?.total || list.items.length} 篇内容
              </p>
            </div>

            {/* 水平标签过滤栏 */}
            {list.tags && list.tags.length > 0 && (
              <div className="tag-scroll-bar mb-10 justify-center">
                <a
                  href={joinPath(site.basePath, `/${list.type}s`)}
                  className={classNames(
                    "tag shrink-0",
                    !list.activeTag && "active",
                  )}
                >
                  全部
                </a>
                {list.tags.map((tag) => (
                  <a
                    key={tag.name}
                    href={joinPath(
                      site.basePath,
                      `/${list.type}s?tag=${encodeURIComponent(tag.name)}`,
                    )}
                    className={classNames(
                      "tag shrink-0",
                      list.activeTag === tag.name && "active",
                    )}
                  >
                    {tag.name} ({tag.count})
                  </a>
                ))}
              </div>
            )}

            {/* 内容列表 */}
            {list.items.length > 0 ? (
              <div className="space-y-8">
                {/* 首条大卡片 */}
                {featured && (
                  <FeaturedListItem item={featured} basePath={site.basePath} />
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
                    basePath={joinPath(site.basePath, `/${list.type}s`)}
                  />
                </div>
              )}
          </div>
        </div>
      </main>

      <Footer title={site.title} />
      <ScrollToTop />
    </div>
  );
});

ListPage.displayName = "ListPage";

export default ListPage;
