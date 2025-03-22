import React, { useMemo, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import { useMarkdownContext } from "./MarkdownContext";

const remarkPlugins = [remarkMath, remarkGfm];
const rehypePlugins = [rehypeKatex];

interface MarkdownRendererProps {
  content: string;
  className?: string;
  markdownComponents: any;
  shouldRender: boolean;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className,
  markdownComponents,
  shouldRender,
}) => {
  const { cache, isVisible } = useMarkdownContext();

  // 生成缓存键
  const cacheKey = `${content}-${className || ""}-${markdownComponents ? "withComponent" : "noComponent"}`;

  // 使用useMemo来缓存渲染结果
  const renderedContent = useMemo(() => {
    // 检查缓存中是否已存在
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    // 渲染新内容并缓存
    const newRenderedContent = (
      <ReactMarkdown
        className={className}
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    );

    cache.set(cacheKey, newRenderedContent);
    return newRenderedContent;
  }, [content, className, markdownComponents, cacheKey, cache]);

  // 如果侧边栏关闭或不应该渲染，则直接返回null
  if (!isVisible || !shouldRender) return null;

  return <>{renderedContent}</>;
};

export default memo(MarkdownRenderer);
