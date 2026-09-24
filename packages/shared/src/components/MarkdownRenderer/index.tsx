import React, { useMemo, memo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkCjkFriendly from "remark-cjk-friendly/parseOnly";
import remarkCjkFriendlyGfmStrikethrough from "remark-cjk-friendly-gfm-strikethrough/parseOnly";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { MessageInstance } from "antd/es/message/interface";
import classNames from "classnames";
import remarkDocumentReference from "../../utils/remark-document-reference";
import MermaidRenderer from "../MermaidRenderer";
import LazySyntaxHighlighter from "../LazySyntaxHighlighter";
import PlantUML from "../PlantUML";

// 默认的 remark 和 rehype 插件
const defaultRemarkPlugins = [
  remarkGfm,
  remarkCjkFriendly,
  remarkCjkFriendlyGfmStrikethrough,
  remarkMath,
];
const defaultRehypePlugins = [rehypeKatex];

// 文档引用类型对应的颜色
const REF_TYPE_COLORS: Record<string, string> = {
  card: "#1890ff",
  article: "#52c41a",
  "project-item": "#faad14",
  "diary-daily": "#8b5cf6",
  "diary-weekly": "#06b6d4",
  "diary-monthly": "#d946ef",
  default: "#8c8c8c",
};

// 文档引用类型对应的标签
const REF_TYPE_LABELS: Record<string, string> = {
  card: "卡片",
  article: "文章",
  "project-item": "项目项",
  "diary-daily": "日记",
  "diary-weekly": "周记",
  "diary-monthly": "月记",
  default: "引用",
};

export interface MarkdownRendererProps {
  /** Markdown 内容 */
  content: string;
  /** 自定义 className */
  className?: string;
  /** 是否为暗色主题 */
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
  /** antd message 实例，由消费端通过 App.useApp() 获取后传入，用于 Mermaid 等组件的通知反馈 */
  messageApi?: MessageInstance;
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
        className="text-blue-500 hover:text-blue-600 hover:underline"
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

      const refColor = REF_TYPE_COLORS[type] || REF_TYPE_COLORS.default;
      const refLabel = REF_TYPE_LABELS[type] || REF_TYPE_LABELS.default;

      const handleClick = () => {
        onReferenceClick?.(id, type, text);
      };

      return (
        <span
          className="document-reference inline-block cursor-pointer rounded px-1 py-0.5 text-sm font-medium transition-all duration-200 hover:scale-105"
          style={{
            color: refColor,
            backgroundColor: `${refColor}15`,
            border: `1px solid ${refColor}30`,
          }}
          onClick={handleClick}
          title={`${refLabel}: ${text}`}
          onMouseEnter={e => {
            e.currentTarget.style.backgroundColor = `${refColor}25`;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.backgroundColor = `${refColor}15`;
          }}
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

/**
 * 创建代码块渲染组件
 * 内置 mermaid / plantuml 检测，支持自定义语言渲染器扩展
 */
const createCodeComponent = (options: {
  isDark: boolean;
  messageApi?: MessageInstance;
  codeLanguageRenderers?: Record<string, React.ComponentType<{ code: string; isDark?: boolean }>>;
}) => {
  return memo(function CodeComponent(props: { children?: React.ReactNode; className?: string }) {
    const { children, className, ...rest } = props;
    const match = /language-([\w-]+)/.exec(className || "");
    const language = match ? match[1] : undefined;
    const code = String(children).replace(/\n$/, "");

    // 有语言标记的代码块
    if (language) {
      // 1. 优先检查外部自定义渲染器
      const CustomRenderer = options.codeLanguageRenderers?.[language];
      if (CustomRenderer) {
        return <CustomRenderer code={code} isDark={options.isDark} />;
      }

      // 2. 内置 mermaid 渲染
      if (language === "mermaid") {
        return (
          <MermaidRenderer code={code} isDark={options.isDark} messageApi={options.messageApi} />
        );
      }

      // 3. 内置 plantuml 渲染（经渲染服务器 img 直出，无需宿主 fetch）
      if (language === "plantuml") {
        return <PlantUML content={code} isDark={options.isDark} />;
      }

      // 4. 其他语言使用 LazySyntaxHighlighter
      return (
        <LazySyntaxHighlighter language={language} isDark={options.isDark} {...rest}>
          {code}
        </LazySyntaxHighlighter>
      );
    }

    // 行内代码或无语言代码块
    return (
      <code {...rest} className={className}>
        {children}
      </code>
    );
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
  messageApi,
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
        messageApi,
        codeLanguageRenderers,
      }),
    [isDark, messageApi, codeLanguageRenderers]
  );

  // 合并组件
  const mergedComponents = useMemo(() => {
    const defaultComponents: Record<string, React.ComponentType<any>> = {
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

  // 基础样式类
  const baseClassName = useMemo(() => {
    return classNames(
      "markdown-renderer",
      // 文本颜色
      isDark ? "text-gray-200" : "text-gray-800",
      // 标题
      "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-4",
      "[&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-5 [&_h2]:mb-3",
      "[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2",
      "[&_h4]:text-base [&_h4]:font-semibold [&_h4]:mt-3 [&_h4]:mb-2",
      // 段落
      "[&_p]:my-2 [&_p]:leading-relaxed",
      // 列表
      "[&_ul]:my-2 [&_ul]:pl-6 [&_ul]:list-disc",
      "[&_ol]:my-2 [&_ol]:pl-6 [&_ol]:list-decimal",
      "[&_li]:my-1",
      // 引用
      "[&_blockquote]:border-l-4 [&_blockquote]:pl-4 [&_blockquote]:my-3 [&_blockquote]:italic",
      isDark
        ? "[&_blockquote]:border-gray-600 [&_blockquote]:text-gray-400"
        : "[&_blockquote]:border-gray-300 [&_blockquote]:text-gray-600",
      // 表格
      "[&_table]:w-full [&_table]:my-3 [&_table]:border-collapse",
      "[&_th]:border [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold",
      "[&_td]:border [&_td]:px-3 [&_td]:py-2",
      isDark
        ? "[&_th]:border-gray-600 [&_th]:bg-zinc-800 [&_td]:border-gray-600"
        : "[&_th]:border-gray-300 [&_th]:bg-gray-100 [&_td]:border-gray-300",
      // 分隔线
      "[&_hr]:my-4 [&_hr]:border-t",
      isDark ? "[&_hr]:border-gray-600" : "[&_hr]:border-gray-300",
      // 图片
      "[&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-2",
      // 任务列表
      "[&_input[type=checkbox]]:mr-2",
      className
    );
  }, [isDark, className]);

  return (
    <ReactMarkdown
      className={baseClassName}
      remarkPlugins={mergedRemarkPlugins}
      rehypePlugins={mergedRehypePlugins}
      components={mergedComponents}
    >
      {content}
    </ReactMarkdown>
  );
});

export default MarkdownRenderer;
