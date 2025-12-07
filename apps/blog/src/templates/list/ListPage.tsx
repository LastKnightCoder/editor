import { memo } from "react";
import classNames from "classnames";
import { Header } from "@blog/components/Layout";
import DocCollectionsMenu from "@blog/components/Layout/DocCollectionsMenu";
import { Tag, Pagination } from "@blog/components/Common";
import { getInitData, formatDate, joinPath } from "@blog/utils";
import { ListData, ListItem } from "@blog/types";
// 导入主项目的主题样式
import "@tau/themes/light.less";
import "@tau/themes/dark.less";

const typeStyles: Record<ListData["type"], string> = {
  card: "type-badge--card",
  article: "type-badge--article",
  doc: "type-badge--doc",
};

const typeLabels = {
  card: "卡片",
  article: "文章",
  doc: "文档",
};

const typeIcons: Record<ListData["type"], JSX.Element> = {
  card: (
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"
      />
    </svg>
  ),
  article: (
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
      />
    </svg>
  ),
  doc: (
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    </svg>
  ),
};

const TypeIcon = ({ type }: { type: ListData["type"] }) =>
  typeIcons[type] ?? typeIcons.article;

// 列表项卡片
const ListItemCard = memo(
  ({ item, basePath }: { item: ListItem; basePath: string }) => {
    return (
      <a
        href={joinPath(basePath, item.href)}
        className={classNames("timeline-card group fade-in-up")}
      >
        {/* 标题 */}
        {item.title && (
          <h3 className="mb-3 text-lg font-semibold leading-snug text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-primary)]">
            {item.title}
          </h3>
        )}

        {/* 摘要 */}
        <p className="mb-4 line-clamp-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">
          {item.summary}
        </p>

        {/* 底部信息 */}
        <div className="flex items-center justify-between">
          {/* 标签 */}
          <div className="flex flex-wrap gap-1.5">
            {item.tags.slice(0, 3).map((tag) => (
              <Tag key={tag} name={tag} size="sm" />
            ))}
          </div>

          {/* 日期 */}
          <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-quaternary)]">
            <svg
              className="h-3.5 w-3.5"
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
            {formatDate(item.createTime)}
          </span>
        </div>

        {/* 悬停指示器 */}
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-[var(--color-primary)] opacity-0 transition-opacity group-hover:opacity-100">
          <span>查看详情</span>
          <svg
            className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17 8l4 4m0 0l-4 4m4-4H3"
            />
          </svg>
        </div>
      </a>
    );
  },
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
          {/* 主内容区 */}
          <div className="flex-1">
            {/* 页面头部 */}
            <div className="content-area mb-8 overflow-hidden">
              {/* 顶部装饰 */}
              <div className="h-1 w-full bg-gradient-to-r from-[var(--color-primary)] via-cyan-400 to-[var(--color-primary)]" />

              <div className="p-6 sm:p-8">
                {/* 类型标签 */}
                <div className="mb-3">
                  <span
                    className={classNames("type-badge", typeStyles[list.type])}
                  >
                    <TypeIcon type={list.type} />
                    {typeLabels[list.type]}
                  </span>
                </div>

                {/* 标题 */}
                <h1 className="text-2xl font-bold text-[var(--color-text-primary)] sm:text-3xl">
                  {list.title || `全部${typeLabels[list.type]}`}
                </h1>

                {/* 统计 */}
                <p className="mt-2 flex items-center gap-2 text-sm text-[var(--color-text-tertiary)]">
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
                      d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12"
                    />
                  </svg>
                  共 {list.pagination?.total || list.items.length} 篇内容
                </p>
              </div>
            </div>

            {/* 内容列表 */}
            {list.items.length > 0 ? (
              <>
                <div className="grid gap-6 sm:grid-cols-2">
                  {list.items.map((item) => (
                    <ListItemCard
                      key={item.id}
                      item={item}
                      basePath={site.basePath}
                    />
                  ))}
                </div>

                {/* 分页 */}
                {list.pagination &&
                  list.pagination.total > list.pagination.pageSize && (
                    <div className="mt-12">
                      <Pagination
                        current={list.pagination.current}
                        total={list.pagination.total}
                        pageSize={list.pagination.pageSize}
                        basePath={joinPath(site.basePath, `/${list.type}s`)}
                      />
                    </div>
                  )}
              </>
            ) : (
              <div className="empty-state">
                <svg
                  className="mb-4 h-12 w-12 text-[var(--color-text-quaternary)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  />
                </svg>
                <p className="text-base font-medium">暂无内容</p>
                <p className="mt-1 text-sm">开始创作你的第一篇内容吧</p>
              </div>
            )}
          </div>

          {/* 右侧标签筛选 */}
          {list.tags && list.tags.length > 0 && (
            <aside className="hidden w-64 shrink-0 lg:block">
              <div className="sticky top-[104px] max-h-[calc(100vh-104px-2rem)] overflow-y-auto pb-8">
                <div className="sidebar-container">
                  <h3 className="mb-4 flex items-center gap-2 font-semibold text-[var(--color-text-primary)]">
                    <span className="h-4 w-1 rounded-full bg-gradient-to-b from-[var(--color-primary)] to-cyan-400" />
                    标签筛选
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {list.tags.map((tag) => (
                      <Tag
                        key={tag.name}
                        name={`${tag.name} (${tag.count})`}
                        href={joinPath(
                          site.basePath,
                          `/${list.type}s?tag=${encodeURIComponent(tag.name)}`,
                        )}
                        active={list.activeTag === tag.name}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
});

ListPage.displayName = "ListPage";

export default ListPage;
