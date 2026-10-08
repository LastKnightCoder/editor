import React, { useMemo, memo, useRef, Children, cloneElement, isValidElement } from "react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@tau/ui";
import { DOCUMENT_REFERENCE_CLASS, markdownTypographyComponents } from "@tau/chat-ui";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkCjkFriendly from "remark-cjk-friendly/parseOnly";
import remarkCjkFriendlyGfmStrikethrough from "remark-cjk-friendly-gfm-strikethrough/parseOnly";
import {
  FileText,
  FolderKanban,
  Globe,
  Highlighter,
  Layers,
  PenLine,
  type LucideIcon,
} from "lucide-react";
import { Tooltip, toast } from "@tau/ui";
import MarkdownContext, { useMarkdownContext, MarkdownMessageMeta } from "./MarkdownContext";
import { remarkDocumentReference } from "@tau/shared";
import remarkPdfCitation from "@/utils/remark-pdf-citation";
import { getRefTypeLabel } from "@/utils";
import { openContent, openEntity } from "@/services/open-content";
import { normalizeEntityRefKind } from "@/entity/ref";
import { openMaterial } from "@/services/open-material";
import { isMaterialKind } from "@/entity/material";
import { locatesSection } from "@/entity/section-location";
import LocalImage from "@/components/LocalImage";
import LocalImagePreviewPortal from "@/components/LocalImagePreviewPortal";
import { MARKDOWN_BLOCK_CODE_ATTRIBUTE, MARKDOWN_BLOCK_CODE_VALUE } from "./codeBlockUtils";

/* 对话正文排版取自 @tau/chat-ui 的 markdownTypographyComponents，这里只覆盖代码块、文档引用与图片。 */

const remarkPlugins = [
  remarkMath,
  remarkGfm,
  remarkCjkFriendly,
  remarkCjkFriendlyGfmStrikethrough,
  remarkDocumentReference,
  remarkPdfCitation,
];
const rehypePlugins = [rehypeKatex];

const REF_ICONS: Record<string, LucideIcon> = {
  card: Layers,
  article: FileText,
  "project-item": FolderKanban,
  "diary-moment": PenLine,
  excerpt: Highlighter,
  "pdf-annotation": FileText,
  "web-clip": Globe,
};

/** 文档引用在新壳层内打开（卡片 / 文章 / 项目文档 / 日记；外部材料打开到原处）；不支持时 toast 说明 */
async function openReference(id: number, type: string, block?: number) {
  try {
    const kind = normalizeEntityRefKind(type);
    if (isMaterialKind(type)) {
      if (locatesSection(type) && Number.isSafeInteger(block) && block! >= 0)
        await openMaterial({ kind: type, id }, { block: block! });
      else await openMaterial({ kind: type, id });
    } else if (kind && locatesSection(type) && Number.isSafeInteger(block) && block! >= 0)
      await openEntity({ kind, id }, { at: { block: block! } });
    else await openContent(type, id);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "无法打开引用内容");
  }
}

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

  return (
    <span className="my-3 block">
      <button
        type="button"
        className="block cursor-zoom-in text-left"
        onClick={() => setPreviewOpen(true)}
        aria-label="点击放大图片"
      >
        <LocalImage
          url={src}
          alt={alt}
          className={cn("rounded-tau-md block max-h-[420px] max-w-full", className)}
          {...props}
        />
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
              className={cn("my-3 first:mt-0 last:mb-0 [&>*]:m-0", className)}
            >
              {childrenWithBlockCodeMarker}
            </div>
          );
        },
        span: ({ className, children, ...props }: any) => {
          if (className === "document-reference") {
            const id = parseInt(props["data-id"], 10);
            const type = props["data-type"];
            const text = props["data-text"];
            const block =
              props["data-block"] === undefined ? undefined : Number(props["data-block"]);
            const Icon = REF_ICONS[type] ?? FileText;

            return (
              <Tooltip content={`${getRefTypeLabel(type)}：${text}`} placement="top">
                <span
                  role="link"
                  tabIndex={0}
                  className={DOCUMENT_REFERENCE_CLASS}
                  onClick={() => void openReference(id, type, block)}
                  onKeyDown={event => {
                    if (event.key === "Enter") void openReference(id, type, block);
                  }}
                >
                  <Icon aria-hidden size="0.95em" strokeWidth={1.9} className="shrink-0" />
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

          return (
            <span className={className} {...props}>
              {children}
            </span>
          );
        },
        ...markdownTypographyComponents,
        img: ({ src, alt, node: _node, className, ...props }: any) => {
          if (typeof src !== "string" || !src) {
            return null;
          }
          return <MarkdownImage src={src} alt={alt} className={className} props={props} />;
        },
      };
    }, [markdownComponents]);

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
    }, [content, className, customComponents, cacheKey, cache, baseContext, messageMeta]);

    // 如果侧边栏关闭或不应该渲染，则直接返回null
    if (!isVisible || !shouldRender) return null;

    return <>{renderedContent}</>;
  }
);

MarkdownRenderer.displayName = "MarkdownRenderer";

export default MarkdownRenderer;
