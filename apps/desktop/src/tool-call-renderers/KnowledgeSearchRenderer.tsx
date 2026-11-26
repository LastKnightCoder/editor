import { useMemo, useState } from "react";
import type { Descendant } from "slate";
import Editor from "@/components/ContentEditor";
import type { ToolCallCustomRendererProps } from "./types";
import {
  ToolBadge,
  ToolCard,
  ToolCardBody,
  ToolCardHeader,
  ToolMutedText,
  ToolSectionTitle,
} from "@tau/chat-ui";
import ContentDetailModal from "./knowledge/ContentDetailModal";
import { ErrorBoundary } from "@tau/ui";
import { markdownToContent } from "@/services/content-editing";
import { Button, toast } from "@tau/ui";
import { openEntity } from "@/services/open-content";
import { normalizeEntityRefKind } from "@/entity/ref";
import { isMaterialKind } from "@/entity/material";
import { locatesSection } from "@/entity/section-location";
import { openMaterial } from "@/services/open-material";

import { useToolReadI18n, type ReadTranslate } from "./read.i18n";

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
  section?: { blockStart: number; headingPath: string };
}

interface KnowledgeSearchOutput {
  success: boolean;
  message?: string;
  error?: string;
  count: number;
  results: KnowledgeSearchResultItem[];
}

const PREVIEW_BLOCK_COUNT = 3;
const CONTRACT_PAYLOAD = "tau.contract-payload";

type PreviewNode = {
  type?: string;
  node?: PreviewNode;
  children?: PreviewNode[];
};

/** 索引正文里没有 Markdown 语法的节点存成无损载荷（children 为空，编辑器无法渲染），预览前还原为原节点 */
const unwrapContractPayloads = (nodes: PreviewNode[]): PreviewNode[] =>
  nodes.map(entry => {
    const node = entry.type === CONTRACT_PAYLOAD && entry.node ? entry.node : entry;
    return Array.isArray(node.children)
      ? { ...node, children: unwrapContractPayloads(node.children) }
      : node;
  });

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

const formatTime = (timestamp: number, locale: string, t: ReadTranslate): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return t("read.time.today");
  if (diffDays === 1) return t("read.time.yesterday");
  if (diffDays < 7) return t("read.time.days", { count: diffDays });
  if (diffDays < 30) return t("read.time.weeks", { count: Math.floor(diffDays / 7) });

  return new Intl.DateTimeFormat(locale, {
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
    month: "2-digit",
    day: "2-digit",
  }).format(date);
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
  const { t, locale } = useToolReadI18n();
  // 预览是搜索时输出里的快照（纯渲染，不回源拉内容）；点击进详情弹窗才按需取实时内容
  const previewContent = useMemo(
    () =>
      item.content.trim()
        ? (unwrapContractPayloads(
            markdownToContent(item.content).slice(0, PREVIEW_BLOCK_COUNT) as PreviewNode[]
          ) as Descendant[])
        : [],
    [item.content]
  );

  return (
    <div
      className="border-line-1 rounded-tau-sm hover:bg-hover active:bg-press ease-tau-out cursor-pointer border px-3 py-2.5 transition-colors duration-[140ms]"
      onClick={onClick}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="text-tau-body text-ink-1 min-w-0 flex-1 truncate font-medium">
          {item.title}
        </div>
        <ToolBadge isDark={isDark}>{item.typeName}</ToolBadge>
      </div>
      <div className="text-ink-2 pointer-events-none mt-1.5 max-h-[120px] overflow-hidden">
        {previewContent.length > 0 ? (
          <ErrorBoundary>
            <Editor key={item.id} initValue={previewContent} readonly />
          </ErrorBoundary>
        ) : (
          <ToolMutedText isDark={isDark}>{t("read.noPreview")}</ToolMutedText>
        )}
      </div>
      <ToolMutedText isDark={isDark} className="mt-1 tabular-nums">
        {formatTime(item.updateTime, locale, t)}
      </ToolMutedText>
    </div>
  );
};

const KnowledgeSearchRenderer = ({
  execution,
  isDark,
  renderDefault,
}: ToolCallCustomRendererProps) => {
  const { t } = useToolReadI18n();
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
          <ToolSectionTitle isDark={isDark}>{t("read.search")}</ToolSectionTitle>
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
        <ToolCardHeader isDark={isDark}>
          <ToolSectionTitle isDark={isDark}>{t("read.results")}</ToolSectionTitle>
          <ToolMutedText isDark={isDark} className="mt-1">
            {data.message || t("read.count", { count: data.count })}
          </ToolMutedText>
        </ToolCardHeader>
        <ToolCardBody>
          {items.length === 0 ? (
            <ToolMutedText isDark={isDark}>{t("read.empty")}</ToolMutedText>
          ) : (
            <div className="space-y-2">
              {visibleItems.map(item => (
                <ResultItemPreview
                  key={`${item.type}-${item.id}`}
                  item={item}
                  isDark={isDark}
                  onClick={() => {
                    const kind = normalizeEntityRefKind(item.type);
                    const section = locatesSection(item.type) ? item.section : null;
                    if (isMaterialKind(item.type)) {
                      void openMaterial(
                        { kind: item.type, id: item.id },
                        section ? { block: section.blockStart } : undefined
                      ).catch(error => toast.error(String(error)));
                      return;
                    }
                    if (kind && section)
                      void openEntity(
                        { kind, id: item.id },
                        { at: { block: section.blockStart } }
                      ).catch(error => toast.error(String(error)));
                    else setSelectedItem(item);
                  }}
                />
              ))}
              {hasMore && (
                <div className="flex justify-center pt-1">
                  <Button variant="ghost" size="sm" onClick={() => setExpanded(v => !v)}>
                    {expanded ? t("read.collapse") : t("read.more", { count: items.length - 5 })}
                  </Button>
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
