import { registerContentWriter } from "../services/contentWriteCoordinator";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import { useEffect, useRef, useState } from "react";
import { useMemoizedFn, useThrottleFn } from "ahooks";
import type { Descendant } from "slate";
import * as tauri from "../services/tauri";
import { parseInvokeError } from "../services/errors";
import type { ContentDetailResponse } from "../types";
import {
  EMPTY_EDITOR_CONTENT,
  getContentLength,
  normalizeEditorContent,
} from "../features/cards/editorContentUtils";
import {
  createContentSyncSourceId,
  publishContentUpdate,
  subscribeContentUpdate,
} from "../features/cards/contentSyncBus";

type UseEditContentOptions = {
  transport?: {
    load(contentId: number): Promise<ContentDetailResponse>;
    save(payload: Parameters<typeof tauri.updateContent>[0]): Promise<ContentDetailResponse>;
  };
  guard?: () => void;
  canWrite?: () => boolean;
  wait?: number;
  beforeSave?: () => Promise<void>;
  onSaved?: (detail: ContentDetailResponse) => void;
  onSaveError?: (error: unknown) => void;
  onContentSync?: (content: Descendant[]) => void;
  /** 协作正文由会话负责保存；本机正文走 direct。 */
  saveMode?: "direct" | false;
  /** 变化时强制重拉一次（页面 onResume 等）；拉回内容与当前一致则不重建编辑器 */
  refreshKey?: number | string;
  /** 首载/重拉成功：完整响应透出（含元数据），调用方不必再发一次 getContentDetail */
  onLoaded?: (detail: ContentDetailResponse) => void;
  onLoadError?: (error: unknown) => void;
};

type UseEditContentResult = {
  content: Descendant[];
  syncVersion: number;
  loading: boolean;
  saving: boolean;
  error: string;
  handleEditorContentChange: (content: Descendant[], contracts?: ContentContractDictionary) => void;
  flushNow: () => Promise<boolean>;
  retryLastFailed: () => Promise<boolean>;
};

export function useEditContent(
  contentId: number | undefined,
  options?: UseEditContentOptions
): UseEditContentResult {
  const [content, setContent] = useState<Descendant[]>(EMPTY_EDITOR_CONTENT);
  const [syncVersion, setSyncVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const metadataRef = useRef<ContentDetailResponse | undefined>(undefined);
  const writeTail = useRef<Promise<boolean>>(Promise.resolve(true));
  const sourceIdRef = useRef(createContentSyncSourceId());
  const latestContentRef = useRef<Descendant[]>(EMPTY_EDITOR_CONTENT);
  const lastSavedSnapshotRef = useRef(JSON.stringify(EMPTY_EDITOR_CONTENT));
  const lastFailedContentRef = useRef<Descendant[] | null>(null);
  const loadRequestSeqRef = useRef(0);
  const onLoadedRef = useRef(options?.onLoaded);
  onLoadedRef.current = options?.onLoaded;
  const onLoadErrorRef = useRef(options?.onLoadError);
  onLoadErrorRef.current = options?.onLoadError;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const notifyContentSync = useMemoizedFn((next: Descendant[]) => {
    options?.onContentSync?.(next);
  });

  const saveContent = useMemoizedFn((next?: Descendant[]) => {
    const requested = structuredClone(next ?? latestContentRef.current);
    const generation = loadRequestSeqRef.current;
    const write = writeTail.current.then(async () => {
      if (generation !== loadRequestSeqRef.current) return false;
      if (!contentId || contentId <= 0) {
        return false;
      }
      if (options?.saveMode === false) {
        return true;
      }

      const normalized = normalizeEditorContent(requested);
      const nextSnapshot = JSON.stringify(normalized);
      if (nextSnapshot === lastSavedSnapshotRef.current) {
        return true;
      }

      setSaving(true);
      setError("");
      try {
        options?.guard?.();
        if (options?.canWrite?.() === false) throw new Error("当前正文不可编辑");
        await options?.beforeSave?.();
        if (generation !== loadRequestSeqRef.current) return false;
        options?.guard?.();
        if (options?.canWrite?.() === false) throw new Error("当前正文不可编辑");
        const count = getContentLength(normalized);
        const updatedDetail = await (options?.transport?.save ?? tauri.updateContent)({
          contentId,
          content: normalized,
          count,
          contracts: metadataRef.current?.contracts ?? undefined,
          expectedRevision: metadataRef.current?.revision ?? undefined,
          expectedDocumentId: metadataRef.current?.documentId ?? undefined,
          expectedSourceId: metadataRef.current?.librarySourceId ?? undefined,
        });
        options?.guard?.();
        const savedContent = normalizeEditorContent(updatedDetail.content);
        const savedCount = updatedDetail.count;
        const updateTime = updatedDetail.updateTime;

        if (generation !== loadRequestSeqRef.current) return true;
        metadataRef.current = {
          ...updatedDetail,
          contracts: updatedDetail.contracts
            ? { ...updatedDetail.contracts, ...metadataRef.current?.contracts }
            : undefined,
        };
        const unchanged = JSON.stringify(latestContentRef.current) === nextSnapshot;
        if (unchanged) latestContentRef.current = savedContent;
        lastSavedSnapshotRef.current = JSON.stringify(savedContent);
        lastFailedContentRef.current = null;
        publishContentUpdate({
          contentId,
          content: savedContent,
          sourceId: sourceIdRef.current,
          updateTime,
          count: savedCount,
          document: updatedDetail,
        });
        if (unchanged) notifyContentSync(savedContent);
        options?.onSaved?.(updatedDetail);
        return true;
      } catch (saveError) {
        lastFailedContentRef.current = normalized;
        // 协作内容被数据库层守卫拒绝直写：给出明确指引而非通用保存失败
        const parsed = parseInvokeError(saveError);
        setError(
          parsed.code === "COLLABORATION_WRITE_REQUIRED"
            ? "内容协作中，暂不支持直接修改"
            : "自动保存失败，请稍后重试"
        );
        options?.onSaveError?.(saveError);
        return false;
      } finally {
        setSaving(false);
      }
    });
    writeTail.current = write;
    return write;
  });

  const { run: throttledSave, cancel: cancelThrottledSave } = useThrottleFn(
    (next: Descendant[]) => {
      void saveContent(next);
    },
    {
      wait: options?.wait ?? 1000,
      leading: false,
      trailing: true,
    }
  );

  const handleEditorContentChange = useMemoizedFn(
    (next: Descendant[], contracts?: ContentContractDictionary) => {
      if (options?.canWrite?.() === false) return;
      options?.guard?.();
      if (metadataRef.current && contracts)
        metadataRef.current = { ...metadataRef.current, contracts };
      const normalized = normalizeEditorContent(next);
      latestContentRef.current = normalized;
      throttledSave(normalized);
    }
  );

  const flushNow = useMemoizedFn(async () => {
    cancelThrottledSave();
    return await saveContent(latestContentRef.current);
  });

  const retryLastFailed = useMemoizedFn(async () => {
    cancelThrottledSave();
    if (!lastFailedContentRef.current) {
      return true;
    }
    return await saveContent(lastFailedContentRef.current);
  });

  const [documentIdentity, setDocumentIdentity] = useState<{
    library: string;
    document: string;
    contentId: number;
  }>();
  useEffect(() => {
    if (
      !documentIdentity ||
      documentIdentity.contentId !== contentId ||
      options?.saveMode === false
    )
      return;
    return registerContentWriter(documentIdentity.library, documentIdentity.document, {
      flush: flushNow,
      clean: () => JSON.stringify(latestContentRef.current) === lastSavedSnapshotRef.current,
    });
  }, [documentIdentity, contentId, options?.saveMode, flushNow]);

  const refreshKey = options?.refreshKey;
  useEffect(() => {
    const requestSeq = ++loadRequestSeqRef.current;
    const nextId = contentId ?? -1;
    if (nextId <= 0) {
      latestContentRef.current = EMPTY_EDITOR_CONTENT;
      lastSavedSnapshotRef.current = JSON.stringify(EMPTY_EDITOR_CONTENT);
      lastFailedContentRef.current = null;
      setContent(EMPTY_EDITOR_CONTENT);
      setError("");
      setLoading(false);
      notifyContentSync(EMPTY_EDITOR_CONTENT);
      return;
    }

    setLoading(true);
    setError("");
    const current = optionsRef.current;
    Promise.resolve()
      .then(() => {
        current?.guard?.();
        return (current?.transport?.load ?? tauri.getContentDetail)(nextId);
      })
      .then(result => {
        if (loadRequestSeqRef.current !== requestSeq) {
          return;
        }
        current?.guard?.();
        const incoming = JSON.stringify(normalizeEditorContent(result.content));
        if (
          current?.transport &&
          metadataRef.current?.contentId === nextId &&
          JSON.stringify(latestContentRef.current) !== lastSavedSnapshotRef.current &&
          incoming !== JSON.stringify(latestContentRef.current)
        ) {
          setError("正文已变化，本机输入仍保留，请先处理保存冲突");
          return;
        }
        metadataRef.current = result;
        setDocumentIdentity(
          result.librarySourceId && result.documentId
            ? { library: result.librarySourceId, document: result.documentId, contentId: nextId }
            : undefined
        );
        const loaded = normalizeEditorContent(result.content);
        const snapshot = JSON.stringify(loaded);
        latestContentRef.current = loaded;
        lastFailedContentRef.current = null;
        // refreshKey 重拉时内容可能未变（本地刚保存过），快照一致就不 bump
        // syncVersion，避免编辑器因 key 变化整树重建
        if (snapshot !== lastSavedSnapshotRef.current) {
          lastSavedSnapshotRef.current = snapshot;
          setContent(loaded);
          setSyncVersion(value => value + 1);
          notifyContentSync(loaded);
        }
        onLoadedRef.current?.(result);
      })
      .catch(loadError => {
        if (loadRequestSeqRef.current !== requestSeq) {
          return;
        }
        setError("内容加载失败");
        onLoadErrorRef.current?.(loadError);
      })
      .finally(() => {
        if (loadRequestSeqRef.current === requestSeq) {
          setLoading(false);
        }
      });
    return () => {
      if (loadRequestSeqRef.current === requestSeq) loadRequestSeqRef.current++;
    };
  }, [contentId, refreshKey, notifyContentSync]);

  useEffect(() => {
    const nextId = contentId ?? -1;
    if (nextId <= 0) {
      return;
    }
    return subscribeContentUpdate(nextId, sourceIdRef.current, (nextContent, metadata) => {
      try {
        optionsRef.current?.guard?.();
      } catch {
        return;
      }
      if (
        JSON.stringify(latestContentRef.current) !== lastSavedSnapshotRef.current &&
        JSON.stringify(nextContent) !== JSON.stringify(latestContentRef.current)
      ) {
        setError("正文已在其他视图变化，本机输入仍保留，请先处理保存冲突");
        return;
      }
      if (metadata) metadataRef.current = metadata;
      const normalized = normalizeEditorContent(nextContent);
      latestContentRef.current = normalized;
      lastSavedSnapshotRef.current = JSON.stringify(normalized);
      lastFailedContentRef.current = null;
      setContent(normalized);
      setSyncVersion(value => value + 1);
      setError("");
      notifyContentSync(normalized);
    });
  }, [contentId, notifyContentSync]);

  useEffect(() => {
    return () => {
      cancelThrottledSave();
    };
  }, [cancelThrottledSave]);

  return {
    content,
    syncVersion,
    loading,
    saving,
    error,
    handleEditorContentChange,
    flushNow,
    retryLastFailed,
  };
}

export default useEditContent;
