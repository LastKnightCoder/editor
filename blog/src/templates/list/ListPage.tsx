import { memo } from "react";
import { Header, Footer } from "@blog/components/Layout";
import { Tag, Pagination } from "@blog/components/Common";
import { getInitData, formatDate, joinPath } from "@blog/utils";
import { ListData, ListItem } from "@blog/types";
// 导入主项目的主题样式
import "@/themes/light.less";
import "@/themes/dark.less";

const ListItemCard = memo(
  ({ item, basePath }: { item: ListItem; basePath: string }) => {
    return (
      <a
        href={joinPath(basePath, item.href)}
        className="group block rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-container)] p-6 transition-all hover:border-[var(--color-primary)]/50 hover:shadow-md"
      >
        {item.title && (
          <h3 className="mb-2 text-lg font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)]">
            {item.title}
          </h3>
        )}

        <p className="mb-4 line-clamp-3 text-sm text-[var(--color-text-secondary)]">
          {item.summary}
        </p>

        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-2">
            {item.tags.slice(0, 3).map((tag) => (
              <Tag key={tag} name={tag} />
            ))}
          </div>
          <span className="text-xs text-[var(--color-text-tertiary)]">
            {formatDate(item.createTime)}
          </span>
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

  const typeLabels = {
    card: "卡片",
    article: "文章",
    doc: "文档",
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        title={site.title}
        basePath={site.basePath}
        navigation={navigation}
      />

      <main className="flex-1 py-12">
        <div className="mx-auto max-w-6xl px-4">
          {/* 页面标题 */}
          <div className="mb-8">
            <h1 className="mb-2 text-3xl font-bold text-[var(--color-text-primary)]">
              {list.title || `全部${typeLabels[list.type]}`}
            </h1>
            <p className="text-[var(--color-text-secondary)]">
              共 {list.pagination?.total || list.items.length} 篇
              {typeLabels[list.type]}
            </p>
          </div>

          <div className="flex gap-8">
            {/* 主内容区 */}
            <div className="flex-1">
              {list.items.length > 0 ? (
                <>
                  <div className="grid gap-6 md:grid-cols-2">
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
                <div className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-canvas)] py-20 text-center">
                  <p className="text-[var(--color-text-secondary)]">暂无内容</p>
                </div>
              )}
            </div>

            {/* 侧边栏：标签筛选 */}
            {list.tags && list.tags.length > 0 && (
              <aside className="hidden w-64 shrink-0 lg:block">
                <div className="sticky top-20 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-container)] p-4">
                  <h3 className="mb-4 font-semibold text-[var(--color-text-primary)]">
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
              </aside>
            )}
          </div>
        </div>
      </main>

      <Footer title={site.title} />
    </div>
  );
});

ListPage.displayName = "ListPage";

export default ListPage;
