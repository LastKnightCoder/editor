import { memo } from "react";
import { Header, Footer } from "@blog/components/Layout";
import { ScrollToTop } from "@blog/components/Common";
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

/* 主打卡片 — 左侧大版块 */
const FeaturedCard = memo(
  ({ item, basePath }: { item: TimelineItem; basePath: string }) => (
    <a
      href={joinPath(basePath, item.href)}
      className="content-panel group flex h-full flex-col gap-5 p-8 fade-in-up stagger-1"
    >
      <div className="flex items-center justify-between">
        <span className="type-badge">{typeLabels[item.type]}</span>
        <span className="text-sm text-[var(--color-text-tertiary)]">
          {formatDate(item.publishTime, "relative")}
        </span>
      </div>

      <div className="flex-1 space-y-4">
        {item.title && (
          <h3 className="text-[1.625rem] font-semibold leading-tight text-[var(--color-text-primary)] transition-opacity group-hover:opacity-70 sm:text-3xl">
            {item.title}
          </h3>
        )}
        <p className="line-clamp-5 text-base leading-relaxed text-[var(--color-text-secondary)]">
          {item.summary}
        </p>
      </div>

      <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-primary)]">
        <span>阅读全文</span>
        <svg
          className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17 8l4 4m0 0l-4 4m4-4H3"
          />
        </svg>
      </div>
    </a>
  ),
);

FeaturedCard.displayName = "FeaturedCard";

/* 侧边紧凑卡片 — 右栏堆叠 */
const CompactCard = memo(
  ({
    item,
    basePath,
    stagger,
  }: {
    item: TimelineItem;
    basePath: string;
    stagger: number;
  }) => (
    <a
      href={joinPath(basePath, item.href)}
      className={`content-panel group flex flex-1 flex-col gap-3 p-5 fade-in-up stagger-${stagger}`}
    >
      <div className="flex items-center justify-between">
        <span className="type-badge">{typeLabels[item.type]}</span>
        <span className="text-xs text-[var(--color-text-tertiary)]">
          {formatDate(item.publishTime, "relative")}
        </span>
      </div>
      {item.title && (
        <h3 className="text-sm font-semibold leading-snug text-[var(--color-text-primary)] transition-opacity group-hover:opacity-70 line-clamp-2">
          {item.title}
        </h3>
      )}
      <p className="text-xs leading-relaxed text-[var(--color-text-secondary)] line-clamp-3 flex-1">
        {item.summary}
      </p>
    </a>
  ),
);

CompactCard.displayName = "CompactCard";

/* 底部网格卡片 */
const GridCard = memo(
  ({
    item,
    basePath,
    stagger,
  }: {
    item: TimelineItem;
    basePath: string;
    stagger: number;
  }) => (
    <a
      href={joinPath(basePath, item.href)}
      className={`content-panel group flex flex-col gap-3 p-6 fade-in-up stagger-${stagger}`}
    >
      <div className="flex items-center justify-between">
        <span className="type-badge">{typeLabels[item.type]}</span>
        <span className="text-xs text-[var(--color-text-tertiary)]">
          {formatDate(item.publishTime, "relative")}
        </span>
      </div>
      {item.title && (
        <h3 className="text-base font-semibold leading-snug text-[var(--color-text-primary)] transition-opacity group-hover:opacity-70 line-clamp-2">
          {item.title}
        </h3>
      )}
      <p className="text-sm leading-relaxed text-[var(--color-text-secondary)] line-clamp-2 flex-1">
        {item.summary}
      </p>
    </a>
  ),
);

GridCard.displayName = "GridCard";

const HomePage = memo(() => {
  const initData = getInitData();
  const { site, navigation } = initData;
  const content = initData.content as HomeData;
  const docCollections = initData.docCollections || [];

  const docStats = content.docStats || { projects: 0, documents: 0 };
  const stats = [
    {
      label: "文章",
      value:
        content.stats?.articles ??
        content.timeline.filter((i) => i.type === "article").length,
    },
    {
      label: "卡片",
      value:
        content.stats?.cards ??
        content.timeline.filter((i) => i.type === "card").length,
    },
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

  const [featured, second, third, ...remaining] = content.timeline;
  const sidebarItems = [second, third].filter((x): x is TimelineItem => !!x);

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
        {/* ── Hero ── */}
        {content.hero && (
          <section className="py-24 sm:py-32">
            <div className="mx-auto max-w-[var(--content-max-width)] px-4 sm:px-6 lg:px-8">
              <div className="max-w-3xl">
                <p className="fade-in-up stagger-1 mb-5 text-xs font-semibold tracking-[0.18em] text-[var(--color-text-tertiary)] uppercase">
                  Welcome to my digital garden
                </p>

                <h1 className="fade-in-up stagger-2 text-5xl font-bold leading-[1.10] tracking-tight text-[var(--color-text-primary)] sm:text-6xl lg:text-[4.25rem]">
                  {content.hero.title}
                </h1>

                <p className="fade-in-up stagger-3 mt-5 max-w-xl text-lg font-light leading-[1.6] text-[var(--color-text-secondary)]">
                  {content.hero.description}
                </p>

                {/* 统计：大数字排列 */}
                <div className="fade-in-up stagger-4 mt-10 border-t border-[var(--color-border-ring)] pt-8">
                  <div className="flex flex-wrap gap-8">
                    {stats.map((stat) => (
                      <div key={stat.label} className="flex flex-col gap-0.5">
                        <span className="text-2xl font-semibold tabular-nums text-[var(--color-text-primary)]">
                          {stat.value}
                        </span>
                        <span className="text-xs tracking-wide text-[var(--color-text-tertiary)]">
                          {stat.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 快速入口：全部 ghost 风格，不用主色 */}
                <div className="fade-in-up stagger-5 mt-6 flex flex-wrap gap-2">
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
            </div>
          </section>
        )}

        {/* ── 最新内容 ── */}
        {content.timeline.length > 0 && (
          <section className="pb-28">
            <div className="mx-auto max-w-[var(--content-max-width)] px-4 sm:px-6 lg:px-8">
              <h2 className="mb-6 text-xs font-semibold tracking-[0.18em] text-[var(--color-text-tertiary)] uppercase">
                最新内容
              </h2>

              {/* 主区：编辑式两栏 */}
              {(featured || sidebarItems.length > 0) && (
                <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
                  {featured && (
                    <div className="lg:flex-[3]">
                      <FeaturedCard item={featured} basePath={site.basePath} />
                    </div>
                  )}

                  {sidebarItems.length > 0 && (
                    <div className="flex flex-col gap-4 lg:flex-[2]">
                      {sidebarItems.map((item, i) => (
                        <CompactCard
                          key={`${item.type}-${item.id}`}
                          item={item}
                          basePath={site.basePath}
                          stagger={Math.min(i + 2, 4) as 2 | 3 | 4}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 更多内容：三列网格 */}
              {remaining.length > 0 && (
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {remaining.map((item, i) => (
                    <GridCard
                      key={`${item.type}-${item.id}`}
                      item={item}
                      basePath={site.basePath}
                      stagger={Math.min(i + 1, 6) as 1 | 2 | 3 | 4 | 5 | 6}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {content.timeline.length === 0 && (
          <div className="empty-state">
            <p className="text-base font-medium">暂无内容</p>
            <p className="mt-1 text-sm">开始创作你的第一篇内容吧</p>
          </div>
        )}
      </main>

      <Footer title={site.title} />
      <ScrollToTop />
    </div>
  );
});

HomePage.displayName = "HomePage";

export default HomePage;
