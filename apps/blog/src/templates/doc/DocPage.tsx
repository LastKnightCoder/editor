import { memo, useMemo } from "react";
import { Header, Footer, DocSidebar } from "@blog/components/Layout";
import { Breadcrumb, ScrollToTop } from "@blog/components/Common";
import { Editor, EditorServicesProvider } from "@tau/editor";
import Outline from "@blog/components/Outline";
import { getInitData, formatDate, joinPath } from "@blog/utils";
import { DocData } from "@blog/types";
import { HeaderElement } from "@tau/editor";
import { getInlineElementText } from "@blog/utils/editor";
import DndProvider from "@blog/components/DndProvider";
import DocCollectionsMenu from "@blog/components/Layout/DocCollectionsMenu";
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

const DocPage = memo(() => {
  const initData = getInitData();
  const { site, navigation, sidebar } = initData;
  const doc = initData.content as DocData;
  const docCollections = initData.docCollections || [];

  const headers = useMemo(() => extractHeaders(doc.content), [doc.content]);

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
          {/* 左侧文档导航 */}
          {sidebar && sidebar.length > 0 && (
            <div className="hidden w-60 shrink-0 lg:block">
              <div className="sticky top-24 max-h-[calc(100vh-120px)] overflow-y-auto pb-8">
                <DocSidebar
                  items={sidebar}
                  basePath={site.basePath}
                  title="文档导航"
                  currentPath={doc.currentPath}
                />
              </div>
            </div>
          )}

          {/* 主内容区 */}
          <article className="min-w-0 flex-1">
            <div className="mx-auto" style={{ maxWidth: "800px" }}>
              {/* 面包屑 */}
              {doc.breadcrumb && doc.breadcrumb.length > 0 && (
                <div className="mb-6">
                  <Breadcrumb items={doc.breadcrumb} />
                </div>
              )}

              {/* 标题区域 */}
              <div className="mb-8 border-b border-[var(--color-border-ring)] pb-6">
                <h1 className="text-2xl font-bold text-[var(--color-text-primary)] sm:text-3xl">
                  {doc.title}
                </h1>
                <p className="mt-3 text-sm text-[var(--color-text-tertiary)]">
                  更新于 {formatDate(doc.updateTime)}
                </p>
              </div>

              {/* 正文 */}
              <DndProvider>
                <EditorServicesProvider services={createBlogEditorServices()}>
                  <Editor
                    initValue={doc.content}
                    readonly
                    extensions={blogEditorExtensions}
                  />
                </EditorServicesProvider>
              </DndProvider>

              {/* 上下篇导航：简洁文本链接 */}
              {(doc.prevPage || doc.nextPage) && (
                <div className="mt-16 flex items-center justify-between border-t border-[var(--color-border-ring)] pt-6">
                  {doc.prevPage ? (
                    <a
                      href={joinPath(site.basePath, doc.prevPage.href)}
                      className="group flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                    >
                      <span className="text-[var(--color-text-tertiary)] transition-transform group-hover:-translate-x-0.5">
                        &larr;
                      </span>
                      {doc.prevPage.title}
                    </a>
                  ) : (
                    <span />
                  )}
                  {doc.nextPage && (
                    <a
                      href={joinPath(site.basePath, doc.nextPage.href)}
                      className="group flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                    >
                      {doc.nextPage.title}
                      <span className="text-[var(--color-text-tertiary)] transition-transform group-hover:translate-x-0.5">
                        &rarr;
                      </span>
                    </a>
                  )}
                </div>
              )}
            </div>
          </article>

          {/* 右侧 TOC */}
          {headers.length > 0 && (
            <aside className="hidden w-56 shrink-0 xl:block">
              <div className="sticky top-24 max-h-[calc(100vh-120px)] overflow-y-auto pb-8">
                <h4 className="mb-3 px-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  页面目录
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

DocPage.displayName = "DocPage";

export default DocPage;
