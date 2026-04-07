import React, { useMemo, memo, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import { Tooltip } from "antd";
import MarkdownContext, {
  useMarkdownContext,
  MarkdownMessageMeta,
} from "./MarkdownContext";
import { remarkDocumentReference } from "@tau/shared";
import remarkPdfCitation from "@/utils/remark-pdf-citation";
import { getRefTypeLabel, getRefTypeColor } from "@/utils";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import {
  getProjectItemById,
  getRootDocumentsByDocumentItemId,
} from "@/commands";
import { getDiaryEntryById } from "@/commands/diary";

const remarkPlugins = [
  remarkMath,
  remarkGfm,
  remarkDocumentReference,
  remarkPdfCitation,
];
const rehypePlugins = [rehypeKatex];

interface MarkdownRendererProps {
  content: string;
  className?: string;
  markdownComponents: any;
  shouldRender: boolean;
  messageMeta?: MarkdownMessageMeta;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = memo(
  ({ content, className, markdownComponents, shouldRender, messageMeta }) => {
    const baseContext = useMarkdownContext();
    const { cache, isVisible } = baseContext;
    const openInNewTab = useTabStore((state) => state.openInNewTab);

    // 处理文档引用点击
    const handleReferenceClick = useCallback(
      async (id: number, type: string) => {
        if (type === "card") {
          openInNewTab(TabType.CardDetail, { id });
        } else if (type === "article") {
          openInNewTab(TabType.ArticleDetail, { id });
        } else if (type === "project-item") {
          // 获取项目项所属的项目
          try {
            const projectItem = await getProjectItemById(id);
            if (projectItem && projectItem.projects.length > 0) {
              const projectId = projectItem.projects[0];
              openInNewTab(TabType.ProjectDetail, {
                id: projectId,
                itemId: id,
              });
            } else {
              // 如果没有找到项目，回退到项目列表
              openInNewTab(TabType.ProjectList);
            }
          } catch (error) {
            console.error("Failed to get project item:", error);
            openInNewTab(TabType.ProjectList);
          }
        } else if (type === "document-item") {
          // 获取知识库项所属的知识库
          try {
            const documents = await getRootDocumentsByDocumentItemId(id);
            if (documents && documents.length > 0) {
              const documentId = documents[0].id;
              openInNewTab(TabType.DocumentDetail, {
                id: documentId,
                itemId: id,
              });
            } else {
              openInNewTab(TabType.DocumentList);
            }
          } catch (error) {
            console.error("Failed to get document:", error);
            openInNewTab(TabType.DocumentList);
          }
        } else if (
          type === "diary-daily" ||
          type === "diary-weekly" ||
          type === "diary-monthly"
        ) {
          const viewModeMap: Record<string, "daily" | "weekly" | "monthly"> = {
            "diary-daily": "daily",
            "diary-weekly": "weekly",
            "diary-monthly": "monthly",
          };
          try {
            const entry = await getDiaryEntryById(id);
            openInNewTab(TabType.DailyNote, {
              viewMode: viewModeMap[type],
              date: entry.date,
            });
          } catch (error) {
            console.error("Failed to get diary entry:", error);
            openInNewTab(TabType.DailyNote, {
              viewMode: viewModeMap[type],
            });
          }
        }
      },
      [openInNewTab],
    );

    // 自定义组件，用于渲染文档引用
    const customComponents = useMemo(() => {
      const CustomSpanComponent = markdownComponents?.span;
      return {
        ...markdownComponents,
        span: ({ className, children, ...props }: any) => {
          // 检查是否是文档引用
          if (className === "document-reference") {
            const id = parseInt(props["data-id"], 10);
            const type = props["data-type"];
            const text = props["data-text"];

            const refColor = getRefTypeColor(type);
            const refLabel = getRefTypeLabel(type);

            return (
              <Tooltip title={`${refLabel}: ${text}`} placement="top">
                <span
                  className="document-reference cursor-pointer inline-block px-1 py-0.5 rounded text-sm font-medium transition-all duration-200 hover:scale-105"
                  style={{
                    color: refColor,
                    backgroundColor: `${refColor}15`,
                    border: `1px solid ${refColor}30`,
                  }}
                  onClick={() => handleReferenceClick(id, type)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = `${refColor}25`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = `${refColor}15`;
                  }}
                >
                  {children}
                </span>
              </Tooltip>
            );
          }

          if (CustomSpanComponent) {
            return (
              <CustomSpanComponent className={className} {...props}>
                {children}
              </CustomSpanComponent>
            );
          }

          // 其他 span 元素使用默认处理
          return (
            <span className={className} {...props}>
              {children}
            </span>
          );
        },
        hr: ({ ...props }: any) => {
          return (
            <hr
              {...props}
              className="my-4 border border-gray-300 dark:border-gray-600"
            />
          );
        },
      };
    }, [markdownComponents, handleReferenceClick]);

    const componentsVersionRef = useRef(0);
    const componentsVersion = useMemo(() => {
      componentsVersionRef.current += 1;
      return componentsVersionRef.current;
    }, [markdownComponents]);

    // 生成缓存键
    const metaKey = `${messageMeta?.chatId ?? "none"}-${messageMeta?.messageIndex ?? "none"}-${messageMeta?.blockIndex ?? "none"}-${messageMeta?.isStreaming ?? false}`;
    const cacheKey = `${componentsVersion}-${metaKey}-${content}-${className || ""}-${markdownComponents ? "withComponent" : "noComponent"}`;

    // 使用useMemo来缓存渲染结果
    const renderedContent = useMemo(() => {
      if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
      }

      // 渲染新内容并缓存
      const contextValue = {
        ...baseContext,
        messageMeta: messageMeta ?? baseContext.messageMeta,
      };

      const newRenderedContent = (
        <MarkdownContext.Provider value={contextValue}>
          <ReactMarkdown
            className={className}
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            components={customComponents}
          >
            {content}
          </ReactMarkdown>
        </MarkdownContext.Provider>
      );

      cache.set(cacheKey, newRenderedContent);
      return newRenderedContent;
    }, [
      content,
      className,
      customComponents,
      cacheKey,
      cache,
      baseContext,
      messageMeta,
    ]);

    // 如果侧边栏关闭或不应该渲染，则直接返回null
    if (!isVisible || !shouldRender) return null;

    return <>{renderedContent}</>;
  },
);

MarkdownRenderer.displayName = "MarkdownRenderer";

export default MarkdownRenderer;
