import { memo, useMemo } from "react";
import { Header, Footer, DocSidebar } from "@blog/components/Layout";
import { Breadcrumb } from "@blog/components/Common";
import Editor from "@/components/Editor";
import Outline from "@/components/Outline";
import { getInitData, formatDate, joinPath } from "@blog/utils";
import { DocData } from "@blog/types";
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

const DocPage = memo(() => {
  const initData = getInitData();
  const { site, navigation, sidebar } = initData;
  const doc = initData.content as DocData;

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

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        title={site.title}
        basePath={site.basePath}
        navigation={navigation}
      />

      <main className="flex-1">
        <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8">
          {/* 左侧：文档导航（层级结构） */}
          {sidebar && sidebar.length > 0 && (
            <DocSidebar
              items={sidebar}
              basePath={site.basePath}
              title="文档导航"
            />
          )}

          {/* 中间：文档内容 */}
          <article className="min-w-0 flex-1">
            {/* 面包屑导航 */}
            {doc.breadcrumb && doc.breadcrumb.length > 0 && (
              <div className="mb-6">
                <Breadcrumb items={doc.breadcrumb} />
              </div>
            )}

            {/* 文档标题 */}
            <header className="mb-8">
              <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">
                {doc.title}
              </h1>
              <div className="mt-2 text-sm text-(--color-text-tertiary)">
                更新于 {formatDate(doc.updateTime)}
              </div>
            </header>

            {/* 文档内容 - 使用主项目的 Editor */}
            <DndProvider>
              <div className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-container)] p-8">
                <Editor initValue={doc.content} readonly />
              </div>
            </DndProvider>

            {/* 上一页/下一页导航 */}
            {(doc.prevPage || doc.nextPage) && (
              <div className="mt-8 flex items-center justify-between">
                {doc.prevPage ? (
                  <a
                    href={joinPath(site.basePath, doc.prevPage.href)}
                    className="group flex items-center gap-2 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-container)] px-4 py-3 transition-colors hover:border-[var(--color-primary)]"
                  >
                    <svg
                      className="h-5 w-5 text-[var(--color-text-tertiary)] transition-colors group-hover:text-[var(--color-primary)]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                    <div className="text-left">
                      <div className="text-xs text-[var(--color-text-tertiary)]">
                        上一篇
                      </div>
                      <div className="text-sm font-medium text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)]">
                        {doc.prevPage.title}
                      </div>
                    </div>
                  </a>
                ) : (
                  <div />
                )}

                {doc.nextPage ? (
                  <a
                    href={joinPath(site.basePath, doc.nextPage.href)}
                    className="group flex items-center gap-2 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-container)] px-4 py-3 transition-colors hover:border-[var(--color-primary)]"
                  >
                    <div className="text-right">
                      <div className="text-xs text-[var(--color-text-tertiary)]">
                        下一篇
                      </div>
                      <div className="text-sm font-medium text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)]">
                        {doc.nextPage.title}
                      </div>
                    </div>
                    <svg
                      className="h-5 w-5 text-[var(--color-text-tertiary)] transition-colors group-hover:text-[var(--color-primary)]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </a>
                ) : (
                  <div />
                )}
              </div>
            )}
          </article>

          {/* 右侧：页面目录 - 复用主项目的 Outline 组件 */}
          {headers.length > 0 && (
            <aside className="sticky top-20 hidden w-56 shrink-0 xl:block">
              <div className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-container)] p-4">
                <h4 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">
                  页面目录
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

DocPage.displayName = "DocPage";

export default DocPage;
