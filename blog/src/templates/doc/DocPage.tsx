import { memo, useMemo } from "react";
import classNames from "classnames";
import { Header, DocSidebar } from "@blog/components/Layout";
import { Breadcrumb } from "@blog/components/Common";
import Editor from "@/components/Editor";
import Outline from "@/components/Outline";
import { getInitData, formatDate, joinPath } from "@blog/utils";
import { DocData } from "@blog/types";
import { HeaderElement } from "@/components/Editor/types";
import { getInlineElementText } from "@/utils";
import DndProvider from "@/components/DndProvider";
import DocCollectionsMenu from "@blog/components/Layout/DocCollectionsMenu";

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

// 导航按钮组件
const NavButton = memo(
  ({
    direction,
    href,
    title,
    basePath,
  }: {
    direction: "prev" | "next";
    href: string;
    title: string;
    basePath: string;
  }) => {
    const isPrev = direction === "prev";
    return (
      <a
        href={joinPath(basePath, href)}
        className={classNames(
          "group flex flex-1 flex-col gap-1 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-container)] p-5 transition-all",
          "hover:border-[var(--color-border-accent)] hover:shadow-lg",
          isPrev ? "items-start" : "items-end",
        )}
      >
        <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-[var(--color-text-quaternary)]">
          {isPrev && (
            <svg
              className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
          )}
          {isPrev ? "上一篇" : "下一篇"}
          {!isPrev && (
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
                d="M14 5l7 7m0 0l-7 7m7-7H3"
              />
            </svg>
          )}
        </span>
        <span className="text-base font-semibold text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-primary)]">
          {title}
        </span>
      </a>
    );
  },
);

NavButton.displayName = "NavButton";

const DocPage = memo(() => {
  const initData = getInitData();
  const { site, navigation, sidebar } = initData;
  const doc = initData.content as DocData;
  const docCollections = initData.docCollections || [];

  const headers = useMemo(() => extractHeaders(doc.content), [doc.content]);

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
          {/* 左侧文档导航 */}
          {sidebar && sidebar.length > 0 && (
            <div className="hidden w-64 shrink-0 lg:block">
              <div className="sticky top-[104px] max-h-[calc(100vh-104px-2rem)] overflow-y-auto pb-8">
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
          <article className="min-w-0 flex-1 space-y-6">
            {/* 面包屑导航 */}
            {doc.breadcrumb && doc.breadcrumb.length > 0 && (
              <Breadcrumb items={doc.breadcrumb} />
            )}

            {/* 文档内容 */}
            <DndProvider>
              <div className="content-area overflow-hidden">
                {/* 顶部装饰 */}
                <div className="relative h-1 w-full overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-primary)] via-cyan-400 to-transparent opacity-60" />
                </div>

                <div className="p-6 sm:p-8">
                  {/* 标题区域 */}
                  <div className="mb-8 border-b border-[var(--color-border-secondary)] pb-6">
                    {/* 类型标签 */}
                    <div className="mb-3">
                      <span className="type-badge type-badge--doc">
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
                        知识库
                      </span>
                    </div>

                    {/* 标题 */}
                    <h1 className="text-2xl font-bold text-[var(--color-text-primary)] sm:text-3xl">
                      {doc.title}
                    </h1>

                    {/* 更新时间 */}
                    <div className="mt-3 flex items-center gap-2 text-sm text-[var(--color-text-tertiary)]">
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
                      更新于 {formatDate(doc.updateTime)}
                    </div>
                  </div>

                  {/* 正文内容 */}
                  <div className="prose-container">
                    <Editor initValue={doc.content} readonly />
                  </div>
                </div>
              </div>
            </DndProvider>

            {/* 上下篇导航 */}
            {(doc.prevPage || doc.nextPage) && (
              <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:gap-6">
                {doc.prevPage ? (
                  <NavButton
                    direction="prev"
                    href={doc.prevPage.href}
                    title={doc.prevPage.title}
                    basePath={site.basePath}
                  />
                ) : (
                  <div className="hidden flex-1 sm:block" />
                )}
                {doc.nextPage && (
                  <NavButton
                    direction="next"
                    href={doc.nextPage.href}
                    title={doc.nextPage.title}
                    basePath={site.basePath}
                  />
                )}
              </div>
            )}
          </article>

          {/* 右侧页面目录 */}
          {headers.length > 0 && (
            <aside className="hidden w-60 shrink-0 xl:block">
              <div className="sticky top-[104px] max-h-[calc(100vh-104px-2rem)] overflow-y-auto pb-8">
                <div className="sidebar-container">
                  <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
                    <span className="h-4 w-1 rounded-full bg-gradient-to-b from-[var(--color-primary)] to-cyan-400" />
                    页面目录
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

DocPage.displayName = "DocPage";

export default DocPage;
