import { memo, useMemo } from "react";
import { motion } from "motion/react";
import { Header } from "@blog/components/Layout";
import DocCollectionsMenu from "@blog/components/Layout/DocCollectionsMenu";
import { Tag, ScrollToTop } from "@blog/components/Common";
import { Editor, EditorProvider } from "@tau/editor";
import Outline from "@blog/components/Outline";
import { getInitData, formatDate, getReadingTime, joinPath } from "@blog/utils";
import { ArticleData } from "@blog/types";
import { HeaderElement } from "@tau/editor";
import { getInlineElementText } from "@blog/utils/editor";
import DndProvider from "@blog/components/DndProvider";
import { createBlogEditorRegistry, createBlogEditorConfig } from "@blog/services/editorRegistry";
import { blogEditorExtensions } from "@blog/editorExtensions";
import useBlogTheme from "@blog/hooks/useBlogTheme";
import { fadeUp, defaultTransition } from "@blog/utils/motion";
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
  const blogSettings = initData.settings;
  const blogTheme = useBlogTheme();
  const blogEditorRegistry = useMemo(() => createBlogEditorRegistry(), []);
  const blogEditorConfig = useMemo(
    () => createBlogEditorConfig(blogSettings, blogTheme),
    [blogSettings, blogTheme]
  );

  const readingTime = useMemo(() => getReadingTime(article.content), [article.content]);

  const headers = useMemo(() => extractHeaders(article.content), [article.content]);

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
      <DocCollectionsMenu collections={docCollections} basePath={site.basePath} variant="desktop" />
    ) : undefined;
  const mobileDocNav =
    docCollections.length > 0 ? (
      <DocCollectionsMenu collections={docCollections} basePath={site.basePath} variant="mobile" />
    ) : undefined;

  const metaParts = [
    article.author,
    formatDate(article.createTime),
    `约 ${readingTime} 分钟`,
  ].filter(Boolean);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <Header
        title={site.title}
        basePath={site.basePath}
        navigation={navigation}
        customNav={desktopDocNav}
        mobileCustomNav={mobileDocNav}
        rssHref={initData.rss?.href}
        searchHref={initData.search?.href}
      />

      <main className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0 gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="outline-layout-shell" data-prose-width="prose">
            <div className="panel-scroll-area" data-primary-scroll-container>
              <article
                className="outline-content-frame min-w-0"
                data-has-outline={headers.length > 0}
                data-prose-width="prose"
              >
                <div className="mx-auto w-full min-w-0" style={{ maxWidth: "720px" }}>
                  {/* Banner */}
                  {article.bannerBg && (
                    <div className="-mx-4 pb-10 sm:mx-0" style={{ maxWidth: "960px" }}>
                      <img
                        src={article.bannerBg}
                        alt={article.title}
                        className="w-full rounded-2xl object-cover"
                        style={{ maxHeight: "420px" }}
                      />
                    </div>
                  )}

                  {/* 文章头部 */}
                  <motion.header
                    className="mb-12"
                    initial={fadeUp.hidden}
                    animate={fadeUp.visible}
                    transition={defaultTransition}
                  >
                    <p className="mb-5 text-xs font-medium uppercase tracking-[0.15em] text-[var(--color-text-tertiary)]">
                      {metaParts.join(" · ")}
                    </p>
                    <h1 className="text-4xl font-bold leading-[1.08] tracking-tighter text-[var(--color-text-primary)] sm:text-5xl">
                      {article.title}
                    </h1>
                  </motion.header>

                  {/* 短分割线 */}
                  <div className="mb-12 flex">
                    <div className="h-px w-16 bg-[var(--color-border-ring-heavy)]" />
                  </div>

                  {/* 正文内容 */}
                  <DndProvider>
                    <EditorProvider
                      registry={blogEditorRegistry}
                      config={blogEditorConfig}
                      extensions={blogEditorExtensions}
                    >
                      <Editor initValue={article.content} readonly />
                    </EditorProvider>
                  </DndProvider>

                  {/* 标签区域（文章底部） */}
                  {article.tags && article.tags.length > 0 && (
                    <div className="mt-12 flex flex-wrap gap-2">
                      {article.tags.map(tag => (
                        <Tag
                          key={tag}
                          name={tag}
                          href={joinPath(site.basePath, `/articles?tag=${encodeURIComponent(tag)}`)}
                        />
                      ))}
                    </div>
                  )}

                  {/* 更新时间 */}
                  {article.updateTime !== article.createTime && (
                    <>
                      <div className="mt-12 h-px bg-[var(--color-border-ring)]" />
                      <p className="mt-4 text-sm text-[var(--color-text-tertiary)]">
                        最后更新于 {formatDate(article.updateTime, "full")}
                      </p>
                    </>
                  )}
                </div>
              </article>
            </div>

            {headers.length > 0 && (
              <aside className="outline-panel hidden xl:block">
                <div className="panel-scroll-area scrollbar-inset scroll-region-contained">
                  <h4 className="mb-3 px-2.5 text-xs font-medium uppercase tracking-[0.15em] text-[var(--color-text-tertiary)]">
                    目录
                  </h4>
                  <Outline headers={headers} onClick={handleHeaderClick} />
                </div>
              </aside>
            )}
          </div>
        </div>
      </main>

      <ScrollToTop />
    </div>
  );
});

ArticlePage.displayName = "ArticlePage";

export default ArticlePage;
