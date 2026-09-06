import { useEffect, useState } from "react";
import { App } from "antd";
import { invoke } from "@/electron";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import useCollaborationStore from "@/stores/useCollaborationStore";
import { getAllIndexResults } from "@/utils/search";
import { IndexType, SearchResult } from "@/types/search";

const CONTENT_TYPES: IndexType[] = [
  "card",
  "article",
  "project-item",
  "document-item",
  "diary-daily",
];

export default function ShareContentDialog({
  open,
  onClose,
  onShared,
}: {
  open: boolean;
  onClose: () => void;
  onShared: (documentId: string) => void;
}) {
  const { message } = App.useApp();
  const extensions = useDynamicExtensionsStore(state => state.extensions);
  const excludeContentIds = useCollaborationStore(state =>
    state.sessions
      .map(session => session.source?.contentId)
      .filter((id): id is number => id !== undefined)
  );
  const [initialContents, setInitialContents] = useState<SearchResult[]>([]);

  useEffect(() => {
    let cancelled = false;
    getAllIndexResults()
      .then(results => {
        if (!cancelled) setInitialContents(results);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleSelect = async (selected: SearchResult | SearchResult[]) => {
    const item = Array.isArray(selected) ? selected[0] : selected;
    if (!item) return;
    try {
      const result = await invoke<{ documentId: string }>(
        "collaboration:create-content",
        item.contentId,
        "content",
        item.contentId,
        item.title
      );
      onShared(result.documentId);
    } catch (failure) {
      message.error(failure instanceof Error ? failure.message : "操作失败");
    }
  };

  return (
    <ContentSelectorModal
      open={open}
      onCancel={onClose}
      onSelect={handleSelect}
      title="共享本地内容"
      subtitle="选择一段本地内容发起协作"
      contentType={CONTENT_TYPES}
      extensions={extensions}
      excludeContentIds={excludeContentIds}
      initialContents={initialContents}
      emptyDescription="没有找到匹配的内容"
    />
  );
}
