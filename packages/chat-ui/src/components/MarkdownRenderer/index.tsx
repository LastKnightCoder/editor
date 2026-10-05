import React, { Children, cloneElement, isValidElement, useMemo, memo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkCjkFriendly from "remark-cjk-friendly/parseOnly";
import remarkCjkFriendlyGfmStrikethrough from "remark-cjk-friendly-gfm-strikethrough/parseOnly";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { remarkDocumentReference } from "@tau/shared";
import { cn } from "@tau/ui";
import { CodeBlock } from "../Message/CodeBlock";
import {
  DOCUMENT_REFERENCE_CLASS,
  INLINE_CODE_CLASS,
  MARKDOWN_LINK_CLASS,
  markdownTypographyComponents,
} from "../Message/markdownTypography";

// 默认的 remark 和 rehype 插件
const defaultRemarkPlugins = [
  remarkGfm,
  remarkCjkFriendly,
  remarkCjkFriendlyGfmStrikethrough,
  remarkMath,
];
const defaultRehypePlugins = [rehypeKatex];

// 文档引用类型对应的标签
const REF_TYPE_LABELS: Record<string, string> = {
  card: "卡片",
  article: "文章",
  "project-item": "项目项",
  "diary-daily": "日记",
  default: "引用",
};

export interface MarkdownRendererProps {
  /** Markdown 内容 */
  content: string;
  /** 自定义 className */
  className?: string;
  /** 透传给宿主的代码语言渲染器（图表等）；排版本身不区分明暗 */
  isDark?: boolean;
  /** 自定义组件覆盖（如自定义代码块、链接等） */
  components?: Record<string, React.ComponentType<any>>;
  /** 额外的 remark 插件 */
  remarkPlugins?: any[];
  /** 额外的 rehype 插件 */
  rehypePlugins?: any[];
  /** 是否启用文档引用解析 */
  enableDocumentReference?: boolean;
  /** 文档引用点击回调 */
  onReferenceClick?: (id: number, type: string, text: string) => void;
  /** 链接点击回调 */
  onLinkClick?: (href: string, event: React.MouseEvent) => void;
  /** 特定代码语言的自定义渲染器，key 为语言名（优先级高于内置渲染器） */
  codeLanguageRenderers?: Record<string, React.ComponentType<{ code: string; isDark?: boolean }>>;
}

/**
 * 创建链接组件
 */
const createLinkComponent = (onLinkClick?: (href: string, event: React.MouseEvent) => void) => {
  return memo(function LinkComponent({
    href,
    children,
    ...props
  }: {
    href?: string;
    children?: React.ReactNode;
  }) {
    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLAnchorElement>) => {
        if (onLinkClick && href) {
          e.preventDefault();
          onLinkClick(href, e);
        }
      },
      [href]
    );

    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={MARKDOWN_LINK_CLASS}
        onClick={onLinkClick ? handleClick : undefined}
        {...props}
      >
        {children}
      </a>
    );
  });
};

/**
 * 创建文档引用渲染组件
 */
const createSpanComponent = (
  onReferenceClick?: (id: number, type: string, text: string) => void
) => {
  return memo(function SpanComponent({
    className,
    children,
    ...props
  }: {
    className?: string;
    children?: React.ReactNode;
    "data-id"?: string;
    "data-type"?: string;
    "data-text"?: string;
  }) {
    // 检查是否是文档引用
    if (className === "document-reference") {
      const id = parseInt(props["data-id"] || "0", 10);
      const type = props["data-type"] || "";
      const text = props["data-text"] || "";

      const refLabel = REF_TYPE_LABELS[type] || REF_TYPE_LABELS.default;

      return (
        <span
          role="link"
          tabIndex={0}
          className={DOCUMENT_REFERENCE_CLASS}
          onClick={() => onReferenceClick?.(id, type, text)}
          onKeyDown={event => {
            if (event.key === "Enter") onReferenceClick?.(id, type, text);
          }}
          title={`${refLabel}: ${text}`}
        >
          {children}
        </span>
      );
    }

    // 其他 span 元素使用默认处理
    return (
      <span className={className} {...props}>
        {children}
      </span>
    );
  });
};

/** 围栏代码由 pre 打标记，与行内代码区分（无语言的围栏也走代码块） */
const BLOCK_CODE_ATTR = "data-markdown-block-code";

const PreComponent = ({ children, node: _node, ...props }: any) => (
  <div {...props} className="my-3 first:mt-0 last:mb-0 [&>*]:m-0">
    {Children.map(children, child =>
      isValidElement<Record<string, unknown>>(child)
        ? cloneElement(child, { [BLOCK_CODE_ATTR]: "true" } as Record<string, string>)
        : child
    )}
  </div>
);

/**
 * 创建代码块渲染组件
 * 图表等专属语言通过宿主插槽注入，shared 不加载专属渲染器。
 */
const createCodeComponent = (options: {
  isDark: boolean;
  codeLanguageRenderers?: Record<string, React.ComponentType<{ code: string; isDark?: boolean }>>;
}) => {
  return memo(function CodeComponent(props: Record<string, unknown>) {
    const { children, className, node: _node, [BLOCK_CODE_ATTR]: blockCode, ...rest } = props;
    const match = /language-([\w-]+)/.exec(typeof className === "string" ? className : "");
    const language = match ? match[1] : undefined;

    if (!blockCode && !language) {
      return (
        <code {...rest} className={INLINE_CODE_CLASS}>
          {children as React.ReactNode}
        </code>
      );
    }

    const code = String(children).replace(/\n$/, "");
    const CustomRenderer = language ? options.codeLanguageRenderers?.[language] : undefined;
    if (CustomRenderer) {
      return <CustomRenderer code={code} isDark={options.isDark} />;
    }
    return <CodeBlock code={code} language={language ?? "text"} />;
  });
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = memo(function MarkdownRenderer({
  content,
  className,
  isDark = false,
  components,
  remarkPlugins = [],
  rehypePlugins = [],
  enableDocumentReference = false,
  onReferenceClick,
  onLinkClick,
  codeLanguageRenderers,
}) {
  // 合并插件
  const mergedRemarkPlugins = useMemo(() => {
    const plugins = [...defaultRemarkPlugins, ...remarkPlugins];
    // 如果启用文档引用，添加解析插件
    if (enableDocumentReference) {
      plugins.push(remarkDocumentReference);
    }
    return plugins;
  }, [remarkPlugins, enableDocumentReference]);

  const mergedRehypePlugins = useMemo(
    () => [...defaultRehypePlugins, ...rehypePlugins],
    [rehypePlugins]
  );

  // 创建链接组件
  const LinkComponent = useMemo(() => createLinkComponent(onLinkClick), [onLinkClick]);

  // 创建 span 组件（用于文档引用）
  const SpanComponent = useMemo(() => createSpanComponent(onReferenceClick), [onReferenceClick]);

  // 创建代码组件
  const CodeComponent = useMemo(
    () =>
      createCodeComponent({
        isDark,
        codeLanguageRenderers,
      }),
    [isDark, codeLanguageRenderers]
  );

  // 合并组件
  const mergedComponents = useMemo(() => {
    const defaultComponents: Record<string, React.ComponentType<any>> = {
      ...markdownTypographyComponents,
      pre: PreComponent,
      code: CodeComponent,
      a: LinkComponent,
    };

    // 如果启用文档引用，添加 span 组件
    if (enableDocumentReference) {
      defaultComponents.span = SpanComponent;
    }

    return {
      ...defaultComponents,
      ...components,
    };
  }, [CodeComponent, components, LinkComponent, SpanComponent, enableDocumentReference]);

  return (
    <ReactMarkdown
      className={cn("markdown-renderer text-ink-1", className)}
      remarkPlugins={mergedRemarkPlugins}
      rehypePlugins={mergedRehypePlugins}
      components={mergedComponents}
    >
      {content}
    </ReactMarkdown>
  );
});

export default MarkdownRenderer;
