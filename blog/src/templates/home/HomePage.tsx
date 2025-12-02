import { memo } from "react";
import { Header, Footer } from "@blog/components/Layout";
import { Tag } from "@blog/components/Common";
import { getInitData, formatDate, joinPath } from "@blog/utils";
import { HomeData, TimelineItem } from "@blog/types";
// 导入主项目的主题样式
import "@/themes/light.less";
import "@/themes/dark.less";

const TimelineCard = memo(
  ({ item, basePath }: { item: TimelineItem; basePath: string }) => {
    const typeLabels = {
      card: "卡片",
      article: "文章",
      doc: "文档",
    };

    const typeColors = {
      card: "bg-blue-500",
      article: "bg-green-500",
      doc: "bg-purple-500",
    };

    return (
      <a
        href={joinPath(basePath, item.href)}
        className="group block rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-container)] p-6 transition-all hover:border-[var(--color-primary)]/50 hover:shadow-lg"
      >
        <div className="mb-3 flex items-center gap-3">
          <span
            className={`${typeColors[item.type]} rounded-full px-2 py-0.5 text-xs text-white`}
          >
            {typeLabels[item.type]}
          </span>
          <span className="text-sm text-[var(--color-text-tertiary)]">
            {formatDate(item.publishTime, "relative")}
          </span>
        </div>

        {item.title && (
          <h3 className="mb-2 text-lg font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)]">
            {item.title}
          </h3>
        )}

        <p className="mb-4 line-clamp-3 text-sm text-[var(--color-text-secondary)]">
          {item.summary}
        </p>

        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {item.tags.slice(0, 3).map((tag) => (
              <Tag key={tag} name={tag} />
            ))}
            {item.tags.length > 3 && (
              <span className="text-xs text-[var(--color-text-tertiary)]">
                +{item.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </a>
    );
  },
);

TimelineCard.displayName = "TimelineCard";

const HomePage = memo(() => {
  const initData = getInitData();
  const { site, navigation } = initData;
  const content = initData.content as HomeData;

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        title={site.title}
        basePath={site.basePath}
        navigation={navigation}
      />

      <main className="flex-1">
        {/* Hero Section */}
        {content.hero && (
          <section className="relative overflow-hidden bg-gradient-to-br from-[var(--color-bg-page)] via-[var(--color-bg-canvas)] to-[var(--color-primary)]/5 py-20">
            <div className="mx-auto max-w-6xl px-4 text-center">
              <h1 className="mb-4 bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-info)] bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
                {content.hero.title}
              </h1>
              <p className="mx-auto max-w-2xl text-lg text-[var(--color-text-secondary)]">
                {content.hero.description}
              </p>
            </div>

            {/* 装饰元素 */}
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[var(--color-primary)]/10 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-[var(--color-info)]/10 blur-3xl" />
          </section>
        )}

        {/* Timeline Section */}
        <section className="py-16">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="mb-8 text-2xl font-bold text-[var(--color-text-primary)]">
              最新内容
            </h2>

            {content.timeline.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {content.timeline.map((item) => (
                  <TimelineCard
                    key={`${item.type}-${item.id}`}
                    item={item}
                    basePath={site.basePath}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-canvas)] py-20 text-center">
                <p className="text-[var(--color-text-secondary)]">暂无内容</p>
              </div>
            )}
          </div>
        </section>
      </main>

      <Footer title={site.title} />
    </div>
  );
});

HomePage.displayName = "HomePage";

export default HomePage;
