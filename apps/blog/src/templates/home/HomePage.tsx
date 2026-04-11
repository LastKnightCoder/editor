import { memo } from "react";
import { Header } from "@blog/components/Layout";
import DocCollectionsMenu from "@blog/components/Layout/DocCollectionsMenu";
import { getInitData, formatDate, joinPath } from "@blog/utils";
import { HomeData, TimelineItem } from "@blog/types";
import "@tau/themes/light.less";
import "@tau/themes/dark.less";

const typeLabels: Record<string, string> = {
  card: "卡片",
  article: "文章",
  doc: "文档",
};

const HomePage = memo(() => {
  const initData = getInitData();
  const { site, navigation } = initData;
  const content = initData.content as HomeData;
  const docCollections = initData.docCollections || [];

  const docStats = content.docStats || { projects: 0, documents: 0 };
  const articleCount =
    content.stats?.articles ??
    content.timeline.filter((i) => i.type === "article").length;
  const cardCount =
    content.stats?.cards ??
    content.timeline.filter((i) => i.type === "card").length;

  const stats = [
    { label: "文章", value: articleCount },
    { label: "卡片", value: cardCount },
    { label: "项目", value: docStats.projects },
    { label: "知识库", value: docStats.documents },
  ];

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

  const recentItems = content.timeline.slice(0, 5);

  return (
    <div className="flex h-[100dvh] flex-col overflow-y-auto lg:overflow-hidden">
      <Header
        title={site.title}
        basePath={site.basePath}
        navigation={navigation}
        customNav={desktopDocNav}
        mobileCustomNav={mobileDocNav}
      />

      <main className="flex flex-1 items-center px-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-[var(--content-max-width)] flex-col gap-12 py-10 lg:flex-row lg:items-center lg:gap-20 lg:py-0">
          {/* 左栏：Hero + 统计 + 导航 */}
          {content.hero && (
            <div className="shrink-0 lg:w-[46%]">
              <p className="fade-in-up stagger-1 mb-4 text-xs font-semibold tracking-[0.18em] text-[var(--color-text-tertiary)] uppercase">
                Welcome to my digital garden
              </p>

              <h1 className="fade-in-up stagger-2 text-4xl font-bold leading-[1.08] tracking-tight text-[var(--color-text-primary)] sm:text-5xl lg:text-[3.25rem]">
                {content.hero.title}
              </h1>

              <p className="fade-in-up stagger-3 mt-5 text-base leading-[1.8] text-[var(--color-text-secondary)]">
                {content.hero.description}
              </p>

              {/* 统计行 */}
              <div className="fade-in-up stagger-4 mt-8 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--color-text-tertiary)]">
                {stats.map((stat, i) => (
                  <span key={stat.label} className="flex items-center gap-x-4">
                    <span>
                      <span className="font-semibold tabular-nums text-[var(--color-text-primary)]">
                        {stat.value}
                      </span>{" "}
                      {stat.label}
                    </span>
                    {i < stats.length - 1 && (
                      <span className="text-[var(--color-text-quaternary)]">
                        ·
                      </span>
                    )}
                  </span>
                ))}
              </div>

              {/* 导航入口 */}
              <div className="fade-in-up stagger-5 mt-5 flex flex-wrap gap-2.5">
                <a
                  href={joinPath(site.basePath, "/articles")}
                  className="nav-entry nav-entry-ghost"
                >
                  文章
                </a>
                <a
                  href={joinPath(site.basePath, "/cards")}
                  className="nav-entry nav-entry-ghost"
                >
                  卡片
                </a>
                {docCollections.length > 0 && (
                  <a
                    href={joinPath(site.basePath, "/docs")}
                    className="nav-entry nav-entry-ghost"
                  >
                    文档
                  </a>
                )}
              </div>
            </div>
          )}

          {/* 右栏：最近动态列表 */}
          {recentItems.length > 0 && (
            <div className="flex-1">
              <p className="fade-in-up stagger-2 mb-4 text-xs font-semibold tracking-[0.18em] text-[var(--color-text-tertiary)] uppercase">
                最近更新
              </p>
              <div className="space-y-px">
                {recentItems.map((item, i) => (
                  <a
                    key={`${item.type}-${item.id}`}
                    href={joinPath(site.basePath, item.href)}
                    className={`group flex items-center gap-4 rounded-lg px-4 py-3.5 transition-colors hover:bg-[var(--color-bg-canvas)] fade-in-up stagger-${Math.min(i + 3, 6)}`}
                  >
                    <span className="shrink-0 text-[0.6875rem] font-medium uppercase tracking-wider text-[var(--color-text-quaternary)]">
                      {typeLabels[item.type]}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-text-primary)] transition-opacity group-hover:opacity-70">
                      {item.title || item.summary}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-[var(--color-text-tertiary)]">
                      {formatDate(item.publishTime, "relative")}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
});

HomePage.displayName = "HomePage";

export default HomePage;
