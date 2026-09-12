import { useEffect, useRef, useState } from "react";
import { useMemoizedFn, useThrottleFn } from "ahooks";
import type { Descendant } from "slate";
import * as tauri from "../services/tauri";
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
  wait?: number;
  onSaved?: (detail: ContentDetailResponse) => void;
  onSaveError?: (error: unknown) => void;
  onContentSync?: (content: Descendant[]) => void;
  /** 变化时强制重拉一次（页面 onResume 等）；拉回内容与当前一致则不重建编辑器 */
  refreshKey?: number;
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
  handleEditorContentChange: (content: Descendant[]) => void;
  throttleHandleEditorContentChange: (content: Descendant[]) => void;
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

  const sourceIdRef = useRef(createContentSyncSourceId());
  const latestContentRef = useRef<Descendant[]>(EMPTY_EDITOR_CONTENT);
  const lastSavedSnapshotRef = useRef(JSON.stringify(EMPTY_EDITOR_CONTENT));
  const lastFailedContentRef = useRef<Descendant[] | null>(null);
  const loadRequestSeqRef = useRef(0);
  const onLoadedRef = useRef(options?.onLoaded);
  onLoadedRef.current = options?.onLoaded;
  const onLoadErrorRef = useRef(options?.onLoadError);
  onLoadErrorRef.current = options?.onLoadError;
  const notifyContentSync = useMemoizedFn((next: Descendant[]) => {
    options?.onContentSync?.(next);
  });

  const saveContent = useMemoizedFn(async (next?: Descendant[]) => {
    if (!contentId || contentId <= 0) {
      return false;
    }

    const normalized = normalizeEditorContent(next ?? latestContentRef.current);
    const nextSnapshot = JSON.stringify(normalized);
    if (nextSnapshot === lastSavedSnapshotRef.current) {
      return true;
    }

    setSaving(true);
    setError("");
    try {
      const updated = await tauri.updateContent({
        contentId,
        content: normalized,
        count: getContentLength(normalized),
      });
      const savedContent = normalizeEditorContent(updated.content);
      latestContentRef.current = savedContent;
      lastSavedSnapshotRef.current = JSON.stringify(savedContent);
      lastFailedContentRef.current = null;
      publishContentUpdate({
        contentId,
        content: savedContent,
        sourceId: sourceIdRef.current,
        updateTime: updated.updateTime,
        count: updated.count,
      });
      notifyContentSync(savedContent);
      options?.onSaved?.(updated);
      return true;
    } catch (saveError) {
      lastFailedContentRef.current = normalized;
      setError("自动保存失败，请稍后重试");
      options?.onSaveError?.(saveError);
      return false;
    } finally {
      setSaving(false);
    }
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

  const handleEditorContentChange = useMemoizedFn((next: Descendant[]) => {
    const normalized = normalizeEditorContent(next);
    latestContentRef.current = normalized;
    throttledSave(normalized);
  });

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

  const refreshKey = options?.refreshKey;
  useEffect(() => {
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

    const requestSeq = ++loadRequestSeqRef.current;
    setLoading(true);
    setError("");
    tauri
      .getContentDetail(nextId)
      .then(result => {
        if (loadRequestSeqRef.current !== requestSeq) {
          return;
        }
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
  }, [contentId, refreshKey, notifyContentSync]);

  useEffect(() => {
    const nextId = contentId ?? -1;
    if (nextId <= 0) {
      return;
    }
    return subscribeContentUpdate(nextId, sourceIdRef.current, nextContent => {
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
    throttleHandleEditorContentChange: handleEditorContentChange,
    flushNow,
    retryLastFailed,
  };
}

export default useEditContent;
