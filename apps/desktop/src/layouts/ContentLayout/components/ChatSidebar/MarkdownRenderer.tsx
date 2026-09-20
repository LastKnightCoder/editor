import React, {
  useMemo,
  memo,
  useCallback,
  useRef,
  Children,
  cloneElement,
  isValidElement,
} from "react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import classnames from "classnames";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkCjkFriendly from "remark-cjk-friendly/parseOnly";
import remarkCjkFriendlyGfmStrikethrough from "remark-cjk-friendly-gfm-strikethrough/parseOnly";
import { Tooltip } from "antd";
import MarkdownContext, { useMarkdownContext, MarkdownMessageMeta } from "./MarkdownContext";
import { remarkDocumentReference } from "@tau/shared";
import remarkPdfCitation from "@/utils/remark-pdf-citation";
import { getRefTypeLabel, getRefTypeColor } from "@/utils";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import { getProjectItemById, getRootDocumentsByDocumentItemId } from "@/commands";
import { getDiaryEntryById } from "@/commands/diary";
import LocalImage from "@/components/LocalImage";
import LocalImagePreviewPortal from "@/components/LocalImagePreviewPortal";
import useThemeColors from "@/hooks/useThemeColors";
import styles from "./MarkdownRenderer.module.less";
import { MARKDOWN_BLOCK_CODE_ATTRIBUTE, MARKDOWN_BLOCK_CODE_VALUE } from "./codeBlockUtils";

const remarkPlugins = [
  remarkMath,
  remarkGfm,
  remarkCjkFriendly,
  remarkCjkFriendlyGfmStrikethrough,
  remarkDocumentReference,
  remarkPdfCitation,
];
const rehypePlugins = [rehypeKatex];

const MarkdownImage = ({
  src,
  alt,
  className,
  props,
}: {
  src: string;
  alt?: string;
  className?: string;
  props: Record<string, unknown>;
}) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const imageClassName = className ? `block ${className}` : "block";

  return (
    <span className="my-4 block">
      <button
        type="button"
        className="block cursor-zoom-in text-left"
        onClick={() => setPreviewOpen(true)}
        aria-label="点击放大图片"
      >
        <LocalImage url={src} alt={alt} className={imageClassName} {...props} />
      </button>
      {previewOpen ? (
        <LocalImagePreviewPortal url={src} alt={alt} onClose={() => setPreviewOpen(false)} />
      ) : null}
    </span>
  );
};

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
    const openInNewTab = useTabStore(state => state.openInNewTab);
    const { accentColor, secondaryTextClass } = useThemeColors();

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
        } else if (type === "diary-daily") {
          try {
            const entry = await getDiaryEntryById(id);
            openInNewTab(TabType.DailyNote, {
              date: entry.date,
            });
          } catch (error) {
            console.error("Failed to get diary entry:", error);
            openInNewTab(TabType.DailyNote);
          }
        }
      },
      [openInNewTab]
    );

    // 自定义组件，用于渲染文档引用
    const customComponents = useMemo(() => {
      const CustomSpanComponent = markdownComponents?.span;
      return {
        ...markdownComponents,
        pre: ({ children, className, node: _node, ...props }: any) => {
          const childrenWithBlockCodeMarker = Children.map(children, child => {
            if (!isValidElement<Record<string, unknown>>(child)) {
              return child;
            }

            return cloneElement(child, {
              [MARKDOWN_BLOCK_CODE_ATTRIBUTE]: MARKDOWN_BLOCK_CODE_VALUE,
            } as Record<string, string>);
          });

          return (
            <div
              {...props}
              data-markdown-pre="true"
              className={classnames(styles.markdownPre, className)}
            >
              {childrenWithBlockCodeMarker}
            </div>
          );
        },
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
                  className="document-reference inline-block cursor-pointer rounded px-1 py-0.5 text-sm font-medium transition-all duration-200 hover:scale-105"
                  style={{
                    color: refColor,
                    backgroundColor: `${refColor}15`,
                    border: `1px solid ${refColor}30`,
                  }}
                  onClick={() => handleReferenceClick(id, type)}
                  onMouseEnter={e => {
                    e.currentTarget.style.backgroundColor = `${refColor}25`;
                  }}
                  onMouseLeave={e => {
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
          return <hr {...props} className={styles.markdownHr} />;
        },
        ul: ({ className, children, ...props }: any) => {
          return (
            <ul {...props} className={classnames(styles.bulletedList, className)}>
              {children}
            </ul>
          );
        },
        ol: ({ className, children, ...props }: any) => {
          return (
            <ol {...props} className={classnames(styles.numberedList, className)}>
              {children}
            </ol>
          );
        },
        li: ({ className, children, ...props }: any) => {
          return (
            <li {...props} className={classnames(styles.listItem, className)}>
              {children}
            </li>
          );
        },
        blockquote: ({ children, className, ...props }: any) => {
          return (
            <blockquote
              {...props}
              className={classnames(
                "relative my-4 py-[0.75em] pl-[1.5em] italic leading-relaxed transition-colors duration-200",
                secondaryTextClass,
                "[&_p+p]:mt-2 [&_p]:my-0",
                className
              )}
            >
              <div
                aria-hidden="true"
                className="absolute bottom-1 left-0 top-1 w-1 select-none rounded-full"
                style={{ backgroundColor: accentColor }}
              />
              {children}
            </blockquote>
          );
        },
        img: ({ src, alt, node: _node, className, ...props }: any) => {
          if (typeof src !== "string" || !src) {
            return null;
          }
          return <MarkdownImage src={src} alt={alt} className={className} props={props} />;
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
      accentColor,
      secondaryTextClass,
    ]);

    // 如果侧边栏关闭或不应该渲染，则直接返回null
    if (!isVisible || !shouldRender) return null;

    return <>{renderedContent}</>;
  }
);

MarkdownRenderer.displayName = "MarkdownRenderer";

export default MarkdownRenderer;
