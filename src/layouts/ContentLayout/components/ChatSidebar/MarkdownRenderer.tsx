import React, { useMemo, memo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import { useNavigate } from "react-router-dom";
import { Tooltip } from "antd";
import { useMarkdownContext } from "./MarkdownContext";
import remarkDocumentReference from "@/utils/remark-document-reference";
import { getRefTypeLabel, getRefTypeColor } from "@/utils";
import {
  getProjectItemById,
  getDocumentItem,
  getRootDocumentsByDocumentItemId,
} from "@/commands";
import useProjectsStore from "@/stores/useProjectsStore";
import useDocumentsStore from "@/stores/useDocumentsStore";

const remarkPlugins = [remarkMath, remarkGfm, remarkDocumentReference];
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
  const navigate = useNavigate();

  // 处理文档引用点击
  const handleReferenceClick = useCallback(
    async (id: number, type: string) => {
      if (type === "card") {
        navigate(`/cards/detail/${id}`);
      } else if (type === "article") {
        navigate(`/articles/detail/${id}`);
      } else if (type === "project-item") {
        const projectItem = await getProjectItemById(id);
        if (!projectItem) return;
        const projectId = projectItem.projects[0];
        if (!projectId) return;

        navigate(`/projects/detail/${projectId}`);
        useProjectsStore.setState({
          activeProjectItemId: projectItem.id,
          hideProjectItemList: false,
        });
      } else if (type === "document-item") {
        const documentItem = await getDocumentItem(id);
        if (!documentItem) return;
        const documents = await getRootDocumentsByDocumentItemId(
          documentItem.id,
        );
        if (!documents) return;
        const document = documents[0];
        if (!document) return;

        navigate(`/documents/detail/${document.id}`);
        useDocumentsStore.setState({
          activeDocumentItemId: documentItem.id,
          hideDocumentItemsList: false,
        });
      }
    },
    [navigate],
  );

  // 自定义组件，用于渲染文档引用
  const customComponents = useMemo(
    () => ({
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
            className="my-4 border-[1px] border-gray-300 dark:border-gray-600"
          />
        );
      },
    }),
    [markdownComponents, handleReferenceClick],
  );

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
        components={customComponents}
      >
        {content}
      </ReactMarkdown>
    );

    cache.set(cacheKey, newRenderedContent);
    return newRenderedContent;
  }, [content, className, customComponents, cacheKey, cache]);

  // 如果侧边栏关闭或不应该渲染，则直接返回null
  if (!isVisible || !shouldRender) return null;

  return <>{renderedContent}</>;
};

export default memo(MarkdownRenderer);
