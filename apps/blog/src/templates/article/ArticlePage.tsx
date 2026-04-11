import { memo, useMemo } from "react";
import { Header, Footer } from "@blog/components/Layout";
import DocCollectionsMenu from "@blog/components/Layout/DocCollectionsMenu";
import { Tag, ScrollToTop } from "@blog/components/Common";
import { Editor, EditorServicesProvider } from "@tau/editor";
import Outline from "@blog/components/Outline";
import { getInitData, formatDate, getReadingTime, joinPath } from "@blog/utils";
import { ArticleData } from "@blog/types";
import { HeaderElement } from "@tau/editor";
import { getInlineElementText } from "@blog/utils/editor";
import DndProvider from "@blog/components/DndProvider";
import { createBlogEditorServices } from "@blog/services/editorServices";
import { blogEditorExtensions } from "@blog/editorExtensions";
import "@tau/themes/light.less";
import "@tau/themes/dark.less";

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
  const { site, navigation } = initData;
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
    const editor = document.querySelector('[data-slate-editor="true"]');
    if (!editor) return;
    const headerElements = editor.querySelectorAll("h1, h2, h3, h4, h5, h6");
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

  const metaParts = [
    article.author,
    formatDate(article.createTime),
    `约 ${readingTime} 分钟`,
  ].filter(Boolean);

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
        {/* Banner（可选） */}
        {article.bannerBg && (
          <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 lg:px-8">
            <img
              src={article.bannerBg}
              alt={article.title}
              className="w-full rounded-xl object-cover"
              style={{ maxHeight: "420px" }}
            />
          </div>
        )}

        {/* 主布局：内容列 + 右侧 TOC */}
        <div className="mx-auto flex max-w-7xl gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          {/* 阅读列（居中，最大 720px） */}
          <article
            className="mx-auto min-w-0 w-full"
            style={{ maxWidth: "720px" }}
          >
            {/* 文章头部 */}
            <header className="mb-10">
              <span className="type-badge mb-4 inline-flex">深度阅读</span>
              <h1 className="text-3xl font-bold leading-tight text-[var(--color-text-primary)] sm:text-4xl">
                {article.title}
              </h1>
              <p className="mt-4 text-sm text-[var(--color-text-secondary)]">
                {metaParts.join(" · ")}
              </p>
              {article.tags && article.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
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

            <div className="mb-10 h-px bg-[var(--color-border-ring)]" />

            {/* 正文内容 */}
            <DndProvider>
              <EditorServicesProvider services={createBlogEditorServices()}>
                <Editor
                  initValue={article.content}
                  readonly
                  extensions={blogEditorExtensions}
                />
              </EditorServicesProvider>
            </DndProvider>

            {/* 更新时间 */}
            {article.updateTime !== article.createTime && (
              <>
                <div className="mt-10 h-px bg-[var(--color-border-ring)]" />
                <p className="mt-4 text-sm text-[var(--color-text-tertiary)]">
                  最后更新于 {formatDate(article.updateTime, "full")}
                </p>
              </>
            )}
          </article>

          {/* 右侧 TOC */}
          {headers.length > 0 && (
            <aside className="hidden w-56 shrink-0 xl:block">
              <div className="sticky top-24 max-h-[calc(100vh-120px)] overflow-y-auto pb-8">
                <h4 className="mb-3 px-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  目录
                </h4>
                <Outline headers={headers} onClick={handleHeaderClick} />
              </div>
            </aside>
          )}
        </div>
      </main>

      <Footer title={site.title} />
      <ScrollToTop />
    </div>
  );
});

ArticlePage.displayName = "ArticlePage";

export default ArticlePage;
