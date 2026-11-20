import { useCallback, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Editor as SlateEditor } from "slate";
import { useOverlayDismiss } from "@/page/PageProvider";
import useContentSession from "@/hooks/useContentSession";
import { collaborationCommands, localContentCommands } from "@/commands/contracts/collaboration";
import type {
  ContentSessionTarget,
  DocumentHistoryAction,
  DocumentHistoryEntry,
  DocumentHistoryPreview,
} from "@tau/collaboration";
import { useHistoryMarks } from "./HistoryMarks";

export interface UseContentHistoryOptions {
  contentId?: number;
  source?: Omit<ContentSessionTarget, "contentId">;
  sharedDocumentId?: string;
  /** 宿主正文编辑器实例；未就绪时正文标注与滚动定位静默降级（面板仍可用） */
  getEditor: () => SlateEditor | undefined;
}

export type HistoryEditorProps = ReturnType<typeof useHistoryMarks>;

export interface ContentHistoryController {
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: boolean;
  error: string | undefined;
  rows: DocumentHistoryEntry[];
  /** 未筛选的最新一条 sequence（「当前版本」判断用，不受作者筛选影响） */
  headSequence: number | undefined;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  isListPending: boolean;
  selected: number | undefined;
  select: (sequence: number) => void;
  clearSelection: () => void;
  preview: DocumentHistoryPreview | undefined;
  isPreviewPending: boolean;
  canApply: boolean;
  confirming: DocumentHistoryAction | undefined;
  beginConfirm: (kind: DocumentHistoryAction["kind"]) => void;
  cancelConfirm: () => void;
  applyPending: boolean;
  applyAction: () => void;
  /** 透传给正文编辑器：选中条目的块级标注（与其它装饰经 composeEditorMarks 合并） */
  editorProps: HistoryEditorProps;
  filterActor: string | undefined;
  setFilterActor: (actorId: string | undefined) => void;
}

const errorMessage = (failure: unknown) =>
  failure instanceof Error ? failure.message : "历史加载失败";

export function useContentHistory({
  contentId,
  source,
  sharedDocumentId,
  getEditor,
}: UseContentHistoryOptions): ContentHistoryController {
  const [isOpen, setOpen] = useState(false);
  const [selected, setSelected] = useState<number>();
  const [confirming, setConfirming] = useState<DocumentHistoryAction>();
  const [filterActor, setFilterActor] = useState<string | undefined>();
  const { entry, error: sessionError } = useContentSession(contentId, source);
  const id = sharedDocumentId ?? entry?.documentId ?? "";
  const local = !sharedDocumentId && entry?.mode === "local";
  const api = local ? localContentCommands : collaborationCommands;
  const client = useQueryClient();
  const key = ["content-history", local, id] as const;

  const history = useInfiniteQuery({
    queryKey: key,
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) => api.historyList.call(id, pageParam),
    getNextPageParam: rows => (rows.length === 50 ? rows.at(-1)?.sequence : undefined),
    enabled: Boolean(id) && isOpen,
  });
  const rows = history.data?.pages.flat() ?? [];
  const current = selected ?? rows[0]?.sequence;
  const preview = useQuery({
    queryKey: [...key, current],
    queryFn: () => api.historyPreview.call(id, current ?? 0),
    enabled: Boolean(id) && isOpen && current !== undefined,
  });
  const apply = useMutation({
    mutationFn: (action: DocumentHistoryAction) => api.historyApply.call(id, action),
    onSuccess: async () => {
      setConfirming(undefined);
      setSelected(undefined);
      await client.invalidateQueries({ queryKey: key });
    },
  });
  const detail = preview.data;

  const beginConfirm = useCallback(
    (kind: DocumentHistoryAction["kind"]) => {
      if (!detail) return;
      apply.reset();
      setConfirming({
        kind,
        operationId: crypto.randomUUID(),
        sequence: detail.entry.sequence,
      });
    },
    [apply, detail]
  );
  const applyAction = useCallback(() => {
    if (!confirming || !detail) return;
    // 恢复要乐观并发校验：以预览时的 head 修订为准，正文已变则被服务端拒绝
    apply.mutate({
      ...confirming,
      expectedRevision: confirming.kind === "restore" ? detail.headRevision : undefined,
    });
  }, [apply, confirming, detail]);

  useOverlayDismiss(() => setOpen(false), isOpen);

  const marks = useHistoryMarks(isOpen ? detail : undefined, getEditor);
  const visibleRows = useMemo(
    () => (filterActor ? rows.filter(row => row.actorId === filterActor) : rows),
    [rows, filterActor]
  );

  return {
    open: () => setOpen(true),
    close: () => {
      setConfirming(undefined);
      setOpen(false);
    },
    toggle: () => setOpen(previous => !previous),
    isOpen,
    error:
      sessionError ??
      (history.error || preview.error || apply.error
        ? errorMessage(history.error ?? preview.error ?? apply.error)
        : undefined),
    rows: visibleRows,
    headSequence: rows[0]?.sequence,
    hasNextPage: Boolean(history.hasNextPage),
    isFetchingNextPage: history.isFetchingNextPage,
    fetchNextPage: () => void history.fetchNextPage(),
    isListPending: history.isPending,
    selected: current,
    select: sequence => {
      setSelected(sequence);
      setConfirming(undefined);
      apply.reset();
    },
    clearSelection: () => {
      setSelected(undefined);
      setConfirming(undefined);
    },
    preview: detail,
    isPreviewPending: history.isPending || preview.isPending,
    canApply: Boolean(detail) && !apply.isPending,
    confirming,
    beginConfirm,
    cancelConfirm: () => {
      setConfirming(undefined);
      apply.reset();
    },
    applyPending: apply.isPending,
    applyAction,
    editorProps: marks,
    filterActor,
    setFilterActor,
  };
}
