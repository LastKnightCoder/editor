import { memo, useMemo } from "react";
import { Header, ArticleSidebar } from "@blog/components/Layout";
import DocCollectionsMenu from "@blog/components/Layout/DocCollectionsMenu";
import { Tag } from "@blog/components/Common";
import Editor from "@/components/Editor";
import Outline from "@/components/Outline";
import { getInitData, formatDate, getReadingTime, joinPath } from "@blog/utils";
import { ArticleData } from "@blog/types";
import { HeaderElement } from "@/components/Editor/types";
import { getInlineElementText } from "@/utils";
import DndProvider from "@/components/DndProvider";
// 导入主项目的主题样式
import "@/themes/light.less";
import "@/themes/dark.less";

// 从内容中提取标题
function extractHeaders(content: unknown[]) {
  const headers: { level: number; title: string }[] = [];
  for (const node of content) {
    if (node && typeof node === "object") {
      const n = node as Record<string, unknown>;
      if (n.type === "header" && Array.isArray(n.children)) {
        const header = n as unknown as HeaderElement;
        headers.push({
          level: header.level,
          title: header.children.map(getInlineElementText).join(""),
        });
      }
    }
  }
  return headers;
}

// 元信息项组件
const MetaItem = memo(
  ({
    icon,
    label,
    value,
  }: {
    icon: React.ReactNode;
    label: string;
    value: string;
  }) => (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-[var(--color-text-quaternary)]">
        {icon}
        {label}
      </span>
      <span className="text-sm font-medium text-[var(--color-text-primary)]">
        {value}
      </span>
    </div>
  ),
);

MetaItem.displayName = "MetaItem";

const ArticlePage = memo(() => {
  const initData = getInitData();
  const { site, navigation, articleList } = initData;
  const article = initData.content as ArticleData;
  const docCollections = initData.docCollections || [];

  const readingTime = useMemo(
    () => getReadingTime(article.content),
    [article.content],
  );

  const headers = useMemo(
    () => extractHeaders(article.content),
    [article.content],
  );

  const handleHeaderClick = (index: number) => {
    const headerElements = document.querySelectorAll(
      '[data-slate-node="element"][data-type="header"]',
    );
    const target = headerElements[index];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

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
          {/* 左侧文章列表 */}
          {articleList && articleList.length > 0 && (
            <div className="hidden w-64 shrink-0 lg:block">
              <div className="sticky top-[104px]">
                <ArticleSidebar
                  articles={articleList}
                  basePath={site.basePath}
                  currentId={article.id}
                  title="全部文章"
                />
              </div>
            </div>
          )}

          {/* 主内容区 */}
          <article className="min-w-0 flex-1">
            <div className="content-area overflow-hidden">
              {/* 文章头部 */}
              <section className="relative">
                {/* Banner 图片 */}
                {article.bannerBg && (
                  <div className="relative h-64 overflow-hidden sm:h-72">
                    <div
                      className="absolute inset-0 bg-cover bg-center"
                      style={{ backgroundImage: `url(${article.bannerBg})` }}
                    />
                    {/* 渐变遮罩 */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg-container)] via-transparent to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-transparent" />
                  </div>
                )}

                {/* 文章信息 */}
                <div
                  className={
                    article.bannerBg
                      ? "relative -mt-20 px-6 pb-6 sm:px-8"
                      : "p-6 sm:p-8"
                  }
                >
                  {/* 类型标签 */}
                  <div className="mb-4">
                    <span className="type-badge type-badge--article">
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
                      深度阅读
                    </span>
                  </div>

                  {/* 标题 */}
                  <h1 className="text-3xl font-bold leading-tight text-[var(--color-text-primary)] sm:text-4xl">
                    {article.title}
                  </h1>

                  {/* 元信息卡片 */}
                  <div className="mt-6 flex flex-wrap gap-6 rounded-xl border border-[var(--color-border-secondary)] bg-[var(--color-bg-canvas)]/50 p-5 backdrop-blur-sm sm:gap-8">
                    {article.author && (
                      <MetaItem
                        icon={
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
                              d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                            />
                          </svg>
                        }
                        label="作者"
                        value={article.author}
                      />
                    )}
                    <MetaItem
                      icon={
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
                      }
                      label="发布"
                      value={formatDate(article.createTime)}
                    />
                    <MetaItem
                      icon={
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
                            d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      }
                      label="阅读时间"
                      value={`约 ${readingTime} 分钟`}
                    />
                  </div>

                  {/* 标签 */}
                  {article.tags && article.tags.length > 0 && (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {article.tags.map((tag) => (
                        <Tag
                          key={tag}
                          name={tag}
                          href={joinPath(
                            site.basePath,
                            `/articles?tag=${encodeURIComponent(tag)}`,
                          )}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {/* 文章内容 */}
              <section className="border-t border-[var(--color-border-secondary)] p-6 sm:p-8">
                <DndProvider>
                  <div className="prose-container">
                    <Editor initValue={article.content} readonly />
                  </div>
                </DndProvider>
              </section>

              {/* 底部更新时间 */}
              {article.updateTime !== article.createTime && (
                <section className="border-t border-[var(--color-border-secondary)] px-6 py-4 sm:px-8">
                  <div className="flex items-center gap-2 text-sm text-[var(--color-text-quaternary)]">
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
                        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                      />
                    </svg>
                    最后更新于 {formatDate(article.updateTime, "full")}
                  </div>
                </section>
              )}
            </div>
          </article>

          {/* 右侧目录 */}
          {headers.length > 0 && (
            <aside className="hidden w-60 shrink-0 xl:block">
              <div className="sticky top-[104px]">
                <div className="sidebar-container">
                  <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
                    <span className="h-4 w-1 rounded-full bg-gradient-to-b from-[var(--color-primary)] to-cyan-400" />
                    目录
                  </h4>
                  <Outline headers={headers} onClick={handleHeaderClick} />
                </div>
              </div>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
});

ArticlePage.displayName = "ArticlePage";

export default ArticlePage;
