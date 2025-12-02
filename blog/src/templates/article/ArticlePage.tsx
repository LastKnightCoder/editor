import { memo, useMemo } from "react";
import { Header, Footer, ArticleSidebar } from "@blog/components/Layout";
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

const ArticlePage = memo(() => {
  const initData = getInitData();
  const { site, navigation, articleList } = initData;
  const article = initData.content as ArticleData;

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

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        title={site.title}
        basePath={site.basePath}
        navigation={navigation}
      />

      <main className="flex-1">
        <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8">
          {/* 左侧：文章列表 */}
          {articleList && articleList.length > 0 && (
            <ArticleSidebar
              articles={articleList}
              basePath={site.basePath}
              currentId={article.id}
              title="全部文章"
            />
          )}

          {/* 中间：文章内容 */}
          <article className="min-w-0 flex-1">
            {/* 文章头部 */}
            <header className="mb-8">
              {/* Banner */}
              {article.bannerBg && (
                <div
                  className="mb-6 h-48 rounded-xl bg-cover bg-center"
                  style={{ backgroundImage: `url(${article.bannerBg})` }}
                />
              )}

              <h1 className="mb-4 text-4xl font-bold text-[var(--color-text-primary)]">
                {article.title}
              </h1>

              <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-[var(--color-text-secondary)]">
                {article.author && (
                  <span className="flex items-center gap-1">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                    {article.author}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  {formatDate(article.createTime)}
                </span>
                <span className="flex items-center gap-1">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  约 {readingTime} 分钟阅读
                </span>
              </div>

              {article.tags && article.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
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
            </header>

            {/* 文章内容 - 使用主项目的 Editor */}
            <DndProvider>
              <div className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-container)] p-8">
                <Editor initValue={article.content} readonly />
              </div>
            </DndProvider>

            {/* 更新时间 */}
            {article.updateTime !== article.createTime && (
              <div className="mt-8 text-sm text-[var(--color-text-tertiary)]">
                最后更新于 {formatDate(article.updateTime, "full")}
              </div>
            )}
          </article>

          {/* 右侧：目录 - 复用主项目的 Outline 组件 */}
          {headers.length > 0 && (
            <aside className="sticky top-20 hidden w-56 shrink-0 xl:block">
              <div className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-container)] p-4">
                <h4 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
                  目录
                </h4>
                <Outline headers={headers} onClick={handleHeaderClick} />
              </div>
            </aside>
          )}
        </div>
      </main>

      <Footer title={site.title} />
    </div>
  );
});

ArticlePage.displayName = "ArticlePage";

export default ArticlePage;
