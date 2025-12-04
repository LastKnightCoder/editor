import { memo } from "react";
import classNames from "classnames";
import { Header } from "@blog/components/Layout";
import DocCollectionsMenu from "@blog/components/Layout/DocCollectionsMenu";
import { getInitData, formatDate, joinPath } from "@blog/utils";
import { HomeData, TimelineItem } from "@blog/types";
// 导入主项目的主题样式
import "@/themes/light.less";
import "@/themes/dark.less";

// 类型图标映射
const TypeIcon = ({ type }: { type: TimelineItem["type"] }) => {
  const icons = {
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
  return icons[type];
};

// 类型标签样式
const typeStyles = {
  card: "type-badge--card",
  article: "type-badge--article",
  doc: "type-badge--doc",
};

const typeLabels = {
  card: "卡片",
  article: "文章",
  doc: "文档",
};

// 时间线卡片组件
const TimelineCard = memo(
  ({
    item,
    basePath,
    index,
  }: {
    item: TimelineItem;
    basePath: string;
    index: number;
  }) => {
    return (
      <a
        href={joinPath(basePath, item.href)}
        className={classNames(
          "timeline-card group fade-in-up",
          `stagger-${Math.min(index + 1, 6)}`,
        )}
      >
        {/* 类型标签 */}
        <div className="mb-4 flex items-center justify-between">
          <span className={classNames("type-badge", typeStyles[item.type])}>
            <TypeIcon type={item.type} />
            <span>{typeLabels[item.type]}</span>
          </span>
          <span className="text-xs text-[var(--color-text-quaternary)]">
            {formatDate(item.publishTime, "relative")}
          </span>
        </div>

        {/* 标题 */}
        {item.title && (
          <h3 className="mb-3 text-lg font-semibold leading-snug text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-primary)]">
            {item.title}
          </h3>
        )}

        {/* 摘要 */}
        <p className="line-clamp-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">
          {item.summary}
        </p>

        {/* 底部指示器 */}
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-[var(--color-primary)] opacity-0 transition-opacity group-hover:opacity-100">
          <span>阅读全文</span>
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

TimelineCard.displayName = "TimelineCard";

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
        {/* Hero 区域 */}
        {content.hero && (
          <section className="hero-section py-16 sm:py-20">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
                {/* 左侧内容 */}
                <div className="max-w-2xl space-y-6">
                  {/* 装饰标签 */}
                  <div className="fade-in-up stagger-1">
                    <span className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary-subtle)] px-4 py-1.5 text-sm font-medium text-[var(--color-primary)]">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-primary)]" />
                      数字花园 · 知识库
                    </span>
                  </div>

                  {/* 主标题 */}
                  <h1 className="fade-in-up stagger-2 text-4xl font-bold leading-tight text-[var(--color-text-primary)] sm:text-5xl">
                    {content.hero.title}
                  </h1>

                  {/* 描述 */}
                  <p className="fade-in-up stagger-3 text-lg leading-relaxed text-[var(--color-text-secondary)]">
                    {content.hero.description}
                  </p>
                </div>

                {/* 右侧统计 - 简洁的分隔线设计 */}
                <div
                  className="fade-in-up flex items-center gap-8 lg:gap-10"
                  style={{ animationDelay: "0.4s" }}
                >
                  {stats.map((stat, index) => (
                    <div
                      key={stat.label}
                      className="flex items-center gap-8 lg:gap-10"
                    >
                      {index > 0 && (
                        <div className="h-10 w-px bg-[var(--color-border-primary)]" />
                      )}
                      <div className="text-center">
                        <span className="block text-2xl font-semibold text-[var(--color-text-primary)]">
                          {stat.value}
                        </span>
                        <span className="text-sm text-[var(--color-text-tertiary)]">
                          {stat.label}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 内容区域 */}
        <section className="py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {/* 区域标题 */}
            <div className="mb-10 flex items-center gap-4">
              <h2 className="text-2xl font-semibold text-[var(--color-text-primary)]">
                最新内容
              </h2>
              <div className="h-px flex-1 bg-gradient-to-r from-[var(--color-border-primary)] to-transparent" />
            </div>

            {/* 内容网格 */}
            {content.timeline.length > 0 ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {content.timeline.map((item, index) => (
                  <TimelineCard
                    key={`${item.type}-${item.id}`}
                    item={item}
                    basePath={site.basePath}
                    index={index}
                  />
                ))}
              </div>
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
        </section>
      </main>
    </div>
  );
});

HomePage.displayName = "HomePage";

export default HomePage;
