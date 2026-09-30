import React, { memo, useCallback, useMemo } from "react";
import classNames from "classnames";
import MarkdownRenderer, {
  type MarkdownRendererProps,
} from "../MarkdownRenderer";
import LazySyntaxHighlighter from "../LazySyntaxHighlighter";
import styles from "./ChatMarkdownRenderer.module.less";
/**
 * message 实例的最小消费面（Mermaid 通知）；antd message 与 @tau/ui toast 结构均满足。
 * 纯类型依赖不产出运行时代码，browser-extension 侧消费本组件不受影响（D-073）。
 */
interface MessageApiLike {
  success(content: React.ReactNode): void;
  error(content: React.ReactNode): void;
}

export interface CodeBlockPreviewPayload {
  id: string;
  type: string;
  content: string;
  metadata: {
    type: string;
    language: string;
    title: string;
    description: string;
    timestamp: number;
    size: string;
  };
}

export interface CodeBlockPreviewCardProps {
  payload: CodeBlockPreviewPayload;
  isDark?: boolean;
  onPreview?: (payload: CodeBlockPreviewPayload) => void;
}

export interface ChatMarkdownRendererProps extends Omit<
  MarkdownRendererProps,
  "className" | "isDark" | "codeLanguageRenderers"
> {
  className?: string;
  isDark?: boolean;
  codeBlockPreviewLanguages?: string[];
  codeLanguageRenderers?: Record<
    string,
    React.ComponentType<{ code: string; isDark?: boolean }>
  >;
  onPreviewCodeBlock?: (payload: CodeBlockPreviewPayload) => void;
  messageApi?: MessageApiLike;
}

const DEFAULT_PREVIEW_LANGUAGES = [
  "html",
  "mermaid",
  "plantuml",
  "mind-map",
  "mindmap",
  "markmap",
  "tikz",
  "latex-tikz",
  "tex-tikz",
  "typst",
  "typ",
];

const LANGUAGE_ALIAS: Record<string, string> = {
  html: "html",
  mermaid: "mermaid",
  plantuml: "plantuml",
  "mind-map": "mind-map",
  mindmap: "mind-map",
  markmap: "mind-map",
  tikz: "tikz",
  "latex-tikz": "tikz",
  "tex-tikz": "tikz",
  typst: "typst",
  typ: "typst",
};

const PREVIEW_META: Record<string, { title: string; description: string }> = {
  html: {
    title: "HTML 预览",
    description: "点击打开 HTML 预览",
  },
  mermaid: {
    title: "Mermaid 图表预览",
    description: "点击打开 Mermaid 图表预览",
  },
  plantuml: {
    title: "PlantUML 图表预览",
    description: "点击打开 PlantUML 图表预览",
  },
  "mind-map": {
    title: "思维导图预览",
    description: "点击打开思维导图预览",
  },
  tikz: {
    title: "TikZ 图形预览",
    description: "点击打开 TikZ 图形预览",
  },
  typst: {
    title: "Typst 文档预览",
    description: "点击打开 Typst 文档预览",
  },
};

const isCompleteHtmlDocument = (code: string) =>
  /^<!DOCTYPE\s+html>/i.test(code.trim());

const toSizeLabel = (content: string) => {
  const sizeKB = (content.length / 1024).toFixed(1);
  return parseFloat(sizeKB) >= 0.1 ? `${sizeKB} KB` : `${content.length} B`;
};

const extractBlockTitle = (type: string, content: string) => {
  if (type === "html") {
    const titleMatch = content.match(/<title>(.*?)<\/title>/i);
    if (titleMatch?.[1]?.trim()) {
      return titleMatch[1].trim();
    }
  }

  if (type === "mind-map") {
    const firstLine = content
      .split("\n")[0]
      ?.trim()
      .replace(/^[*-]\s*/, "");
    if (firstLine) {
      return firstLine;
    }
  }

  return PREVIEW_META[type]?.title ?? `${type} 预览`;
};

export const buildCodeBlockPreviewPayload = (
  language: string,
  code: string,
): CodeBlockPreviewPayload | null => {
  const normalized = LANGUAGE_ALIAS[language.toLowerCase()];
  if (!normalized) {
    return null;
  }

  const now = Date.now();
  const title = extractBlockTitle(normalized, code);

  return {
    id: `chat-block-${normalized}-${now}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    type: normalized,
    content: code,
    metadata: {
      type: normalized,
      language: normalized,
      title,
      description:
        PREVIEW_META[normalized]?.description ?? `点击打开 ${normalized} 预览`,
      timestamp: now,
      size: toSizeLabel(code),
    },
  };
};

export const CodeBlockPreviewCard: React.FC<CodeBlockPreviewCardProps> = memo(
  function CodeBlockPreviewCard({ payload, isDark = false, onPreview }) {
    return (
      <button
        type="button"
        onClick={() => onPreview?.(payload)}
        className={classNames(styles.previewCard, {
          [styles.dark]: isDark,
        })}
      >
        <div className={styles.previewTitle}>{payload.metadata.title}</div>
        <div className={styles.previewDesc}>{payload.metadata.description}</div>
        <div className={styles.previewTag}>{payload.metadata.size}</div>
      </button>
    );
  },
);

const normalizePreviewLanguage = (language: string) =>
  LANGUAGE_ALIAS[language.toLowerCase()] || language.toLowerCase();

export const ChatMarkdownRenderer: React.FC<ChatMarkdownRendererProps> = memo(
  function ChatMarkdownRenderer({
    className,
    isDark = false,
    components,
    codeBlockPreviewLanguages = DEFAULT_PREVIEW_LANGUAGES,
    codeLanguageRenderers,
    onPreviewCodeBlock,
    ...props
  }) {
    const previewLanguageSet = useMemo(
      () =>
        new Set(
          codeBlockPreviewLanguages.map((language) =>
            normalizePreviewLanguage(language),
          ),
        ),
      [codeBlockPreviewLanguages],
    );

    const mergedCodeLanguageRenderers = useMemo(() => {
      const renderers: NonNullable<
        ChatMarkdownRendererProps["codeLanguageRenderers"]
      > = {
        ...codeLanguageRenderers,
      };

      DEFAULT_PREVIEW_LANGUAGES.forEach((language) => {
        if (renderers[language]) {
          return;
        }

        renderers[language] = ({ code }) => {
          const normalized = normalizePreviewLanguage(language);
          if (!previewLanguageSet.has(normalized)) {
            return (
              <LazySyntaxHighlighter language={language} isDark={isDark}>
                {code}
              </LazySyntaxHighlighter>
            );
          }

          if (normalized === "html" && !isCompleteHtmlDocument(code)) {
            return (
              <LazySyntaxHighlighter language="html" isDark={isDark}>
                {code}
              </LazySyntaxHighlighter>
            );
          }

          const payload = buildCodeBlockPreviewPayload(language, code);
          if (!payload) {
            return (
              <LazySyntaxHighlighter language={language} isDark={isDark}>
                {code}
              </LazySyntaxHighlighter>
            );
          }

          return (
            <CodeBlockPreviewCard
              payload={payload}
              isDark={isDark}
              onPreview={onPreviewCodeBlock}
            />
          );
        };
      });

      return renderers;
    }, [codeLanguageRenderers, isDark, onPreviewCodeBlock, previewLanguageSet]);

    const handleLinkClick = useCallback(
      (href: string, event: React.MouseEvent) => {
        props.onLinkClick?.(href, event);
      },
      [props],
    );

    return (
      <MarkdownRenderer
        {...props}
        className={classNames(styles.markdown, className)}
        isDark={isDark}
        components={components}
        codeLanguageRenderers={mergedCodeLanguageRenderers}
        onLinkClick={props.onLinkClick ? handleLinkClick : undefined}
      />
    );
  },
);

export default ChatMarkdownRenderer;
