import { useEffect, useMemo, useRef, useState } from "react";
import { Descendant } from "slate";
import { EditorRef } from "@tau/editor/src";
import Editor from "@/components/ContentEditor";
import type { ToolCallCustomRendererProps } from "./types";
import {
  ToolBadge,
  ToolCard,
  ToolCardBody,
  ToolCardHeader,
  ToolMutedText,
  ToolSectionTitle,
} from "./ui";
import ContentDetailModal from "./knowledge/ContentDetailModal";
import ErrorBoundary from "@/components/ErrorBoundary";
import useEditContent from "@/hooks/useEditContent";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import { getContentById } from "@/commands/content";

interface KnowledgeSearchResultItem {
  id: number;
  contentId: number;
  type: string;
  typeName: string;
  title: string;
  content: string;
  updateTime: number;
  source: string;
  date?: string;
}

interface KnowledgeSearchOutput {
  success: boolean;
  message?: string;
  error?: string;
  count: number;
  results: KnowledgeSearchResultItem[];
}

const PREVIEW_BLOCK_COUNT = 3;

const parseOutput = (output?: string): KnowledgeSearchOutput | null => {
  if (!output) return null;
  try {
    const parsed = JSON.parse(output);
    if (parsed && typeof parsed === "object" && "results" in parsed) {
      return parsed as KnowledgeSearchOutput;
    }
    return null;
  } catch {
    return null;
  }
};

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "昨天";
  if (diffDays < 7) return `${diffDays} 天前`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} 周前`;

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return y === now.getFullYear() ? `${m}-${d}` : `${y}-${m}-${d}`;
};

const ResultItemPreview = ({
  item,
  isDark,
  onClick,
}: {
  item: KnowledgeSearchResultItem;
  isDark: boolean;
  onClick: () => void;
}) => {
  const editorRef = useRef<EditorRef>(null);
  const dynamicExtensions = useDynamicExtensionsStore(state => state.extensions);
  const [initValue, setInitValue] = useState<Descendant[] | null>(null);

  useEditContent(item.contentId, content => {
    editorRef.current?.setEditorValue(content.slice(0, PREVIEW_BLOCK_COUNT));
  });

  useEffect(() => {
    getContentById(item.contentId).then(data => {
      if (data?.content) {
        setInitValue(data.content.slice(0, PREVIEW_BLOCK_COUNT));
      }
    });
  }, [item.contentId]);

  return (
    <div
      className={`cursor-pointer rounded-xl border p-3 transition-colors ${
        isDark
          ? "border-white/10 bg-zinc-950/40 hover:bg-zinc-950/60"
          : "border-slate-200 bg-slate-50/60 hover:bg-slate-100/80"
      }`}
      onClick={onClick}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div
          className={`min-w-0 flex-1 truncate text-sm font-medium ${
            isDark ? "text-slate-100" : "text-slate-800"
          }`}
        >
          {item.title}
        </div>
        <ToolBadge isDark={isDark}>{item.typeName}</ToolBadge>
      </div>
      <div className="pointer-events-none mt-1.5 max-h-[120px] overflow-hidden">
        {initValue ? (
          <ErrorBoundary>
            <Editor
              previewBlocks={PREVIEW_BLOCK_COUNT}
              key={item.contentId}
              ref={editorRef}
              initValue={initValue}
              readonly
              extensions={dynamicExtensions}
            />
          </ErrorBoundary>
        ) : (
          <ToolMutedText isDark={isDark}>加载中...</ToolMutedText>
        )}
      </div>
      <ToolMutedText isDark={isDark} className="mt-1">
        {formatTime(item.updateTime)}
      </ToolMutedText>
    </div>
  );
};

const KnowledgeSearchRenderer = ({
  execution,
  isDark,
  renderDefault,
}: ToolCallCustomRendererProps) => {
  const data = useMemo(() => parseOutput(execution.output), [execution.output]);
  const [expanded, setExpanded] = useState(false);
  const [selectedItem, setSelectedItem] = useState<KnowledgeSearchResultItem | null>(null);

  if (!data) {
    return <>{renderDefault()}</>;
  }

  if (!data.success && data.error) {
    return (
      <ToolCard isDark={isDark}>
        <ToolCardHeader isDark={isDark}>
          <ToolSectionTitle isDark={isDark}>知识库搜索</ToolSectionTitle>
        </ToolCardHeader>
        <ToolCardBody>
          <ToolMutedText isDark={isDark}>{data.error}</ToolMutedText>
        </ToolCardBody>
      </ToolCard>
    );
  }

  const items = data.results;
  const visibleItems = expanded ? items : items.slice(0, 5);
  const hasMore = items.length > 5;

  return (
    <>
      <ToolCard isDark={isDark}>
        <ToolCardHeader isDark={isDark} divided>
          <ToolSectionTitle isDark={isDark}>知识库搜索结果</ToolSectionTitle>
          <ToolMutedText isDark={isDark} className="mt-1">
            {data.message || `共 ${data.count} 条结果`}
          </ToolMutedText>
        </ToolCardHeader>
        <ToolCardBody>
          {items.length === 0 ? (
            <ToolMutedText isDark={isDark}>未找到相关内容。</ToolMutedText>
          ) : (
            <div className="space-y-2">
              {visibleItems.map(item => (
                <ResultItemPreview
                  key={`${item.type}-${item.id}`}
                  item={item}
                  isDark={isDark}
                  onClick={() => setSelectedItem(item)}
                />
              ))}
              {hasMore && (
                <div className="flex justify-center pt-1">
                  <button
                    type="button"
                    className={`inline-flex items-center justify-center rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${
                      isDark
                        ? "border-sky-400/30 bg-sky-400/10 text-sky-200 hover:border-sky-300/50 hover:bg-sky-400/15 hover:text-sky-100"
                        : "border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300 hover:bg-sky-100 hover:text-sky-800"
                    }`}
                    onClick={() => setExpanded(v => !v)}
                  >
                    {expanded ? "收起列表" : `展开剩余 ${items.length - 5} 条结果`}
                  </button>
                </div>
              )}
            </div>
          )}
        </ToolCardBody>
      </ToolCard>

      <ContentDetailModal
        contentId={selectedItem?.contentId}
        title={selectedItem?.title ?? ""}
        typeName={selectedItem?.typeName ?? ""}
        visible={!!selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </>
  );
};

export default KnowledgeSearchRenderer;
