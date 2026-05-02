import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Header, DocSidebar } from "@blog/components/Layout";
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

const DOC_SIDEBAR_SCROLL_STORAGE_KEY = "blog:doc-sidebar-scroll";
const DOC_SIDEBAR_COLLAPSE_STORAGE_KEY = "blog:doc-sidebar-collapse";

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
  const blogSettings = initData.settings;
  const sidebarScrollRef = useRef<HTMLDivElement | null>(null);
  const [activeHeaderIndex, setActiveHeaderIndex] = useState(0);

  const headers = useMemo(() => extractHeaders(doc.content), [doc.content]);
  const activeCollectionTitle = useMemo(() => {
    for (const collection of docCollections) {
      const activeItem = collection.items.find((item) => item.active);
      if (activeItem) {
        return activeItem.title;
      }
    }
    return doc.breadcrumb?.[0]?.label || "文档";
  }, [doc.breadcrumb, docCollections]);

  const sidebarData = useMemo(() => {
    if (!sidebar || sidebar.length === 0) {
      return { title: activeCollectionTitle, items: [] };
    }

    if (
      sidebar.length === 1 &&
      !sidebar[0].href &&
      sidebar[0].children &&
      sidebar[0].children.length > 0
    ) {
      return {
        title: sidebar[0].title || activeCollectionTitle,
        items: sidebar[0].children,
      };
    }

    return {
      title: activeCollectionTitle,
      items: sidebar,
    };
  }, [activeCollectionTitle, sidebar]);

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

  const sidebarScrollStorageKey = useMemo(
    () =>
      `${DOC_SIDEBAR_SCROLL_STORAGE_KEY}:${site.basePath}:${sidebarData.title}`,
    [sidebarData.title, site.basePath],
  );
  const sidebarCollapseStorageKey = useMemo(
    () =>
      `${DOC_SIDEBAR_COLLAPSE_STORAGE_KEY}:${site.basePath}:${sidebarData.title}`,
    [sidebarData.title, site.basePath],
  );

  useEffect(() => {
    if (sidebarData.items.length === 0) {
      return;
    }

    const container = sidebarScrollRef.current;
    if (!container) {
      return;
    }

    const restoreScrollPosition = () => {
      const rawScrollTop = window.localStorage.getItem(sidebarScrollStorageKey);
      const savedScrollTop = rawScrollTop ? Number(rawScrollTop) : NaN;

      if (Number.isFinite(savedScrollTop) && savedScrollTop >= 0) {
        container.scrollTop = savedScrollTop;
        return;
      }

      const activeItem = container.querySelector<HTMLElement>(
        "[data-doc-sidebar-active='true']",
      );
      activeItem?.scrollIntoView({ block: "nearest" });
    };

    const frameId = window.requestAnimationFrame(restoreScrollPosition);
    const handleScroll = () => {
      window.localStorage.setItem(
        sidebarScrollStorageKey,
        String(container.scrollTop),
      );
    };

    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.cancelAnimationFrame(frameId);
      container.removeEventListener("scroll", handleScroll);
    };
  }, [doc.currentPath, sidebarData.items.length, sidebarScrollStorageKey]);

  useEffect(() => {
    const scrollContainer = document.querySelector<HTMLElement>(
      "[data-primary-scroll-container]",
    );
    const editor = document.querySelector('[data-slate-editor="true"]');
    if (!scrollContainer || !editor) {
      return;
    }

    const headerElements = Array.from(
      editor.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"),
    );
    if (headerElements.length === 0) {
      return;
    }

    const updateActiveHeader = () => {
      const containerTop = scrollContainer.getBoundingClientRect().top;
      const activationLine = containerTop + 96;
      let nextActiveIndex = 0;

      for (let index = 0; index < headerElements.length; index++) {
        const rect = headerElements[index].getBoundingClientRect();
        if (rect.top <= activationLine) {
          nextActiveIndex = index;
          continue;
        }
        break;
      }

      setActiveHeaderIndex((current) =>
        current === nextActiveIndex ? current : nextActiveIndex,
      );
    };

    updateActiveHeader();
    scrollContainer.addEventListener("scroll", updateActiveHeader, {
      passive: true,
    });
    window.addEventListener("resize", updateActiveHeader);

    return () => {
      scrollContainer.removeEventListener("scroll", updateActiveHeader);
      window.removeEventListener("resize", updateActiveHeader);
    };
  }, [headers]);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <Header
        title={site.title}
        basePath={site.basePath}
        navigation={navigation}
        customNav={desktopDocNav}
        mobileCustomNav={mobileDocNav}
      />

      <main className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0 gap-8 px-4 py-10 sm:px-6 lg:px-8">
          {/* 左侧文档导航 */}
          {sidebarData.items.length > 0 && (
            <div className="hidden min-h-0 w-60 shrink-0 lg:block">
              <div
                ref={sidebarScrollRef}
                className="panel-scroll-area scroll-region-contained scrollbar-hidden"
              >
                <DocSidebar
                  items={sidebarData.items}
                  basePath={site.basePath}
                  title={sidebarData.title}
                  currentPath={doc.currentPath}
                  storageKey={sidebarCollapseStorageKey}
                />
              </div>
            </div>
          )}

          <div className="outline-layout-shell" data-prose-width="wide">
            <div className="panel-scroll-area" data-primary-scroll-container>
              {/* 主内容区 */}
              <article
                className="outline-content-frame min-w-0"
                data-has-outline={headers.length > 0}
                data-prose-width="wide"
              >
                <div>
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
                    <EditorServicesProvider
                      services={createBlogEditorServices(blogSettings)}
                    >
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
                          className="group flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-accent)]"
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
                          className="group flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-accent)]"
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
            </div>

            {headers.length > 0 && (
              <aside className="outline-panel hidden xl:block">
                <div className="panel-scroll-area scrollbar-inset scroll-region-contained">
                  <h4 className="mb-3 px-2.5 text-xs font-medium uppercase tracking-[0.15em] text-[var(--color-text-tertiary)]">
                    页面目录
                  </h4>
                  <Outline
                    headers={headers}
                    activeIndex={activeHeaderIndex}
                    onClick={handleHeaderClick}
                  />
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

DocPage.displayName = "DocPage";

export default DocPage;
