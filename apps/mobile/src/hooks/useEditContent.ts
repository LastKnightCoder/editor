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
  wait?: number;
  beforeSave?: () => Promise<void>;
  onSaved?: (detail: ContentDetailResponse) => void;
  onSaveError?: (error: unknown) => void;
  onContentSync?: (content: Descendant[]) => void;
  /** 保存模式：direct=常规直写（默认）；collabProjection=协作不可用期的本地兜底，改动
   *  经 collab_project_content 专用通道落本地库（不触碰服务端，云端单一写者约束不变），
   *  重连后由作者选择保留本机或采用云端；false=停用保存（内容绑定协作且会话 live：
   *  云端 Y.Doc 为唯一写者，本地库只接收投影；加载路径保留供元数据展示与降级只读兜底） */
  saveMode?: "direct" | "collabProjection" | false;
  /** saveMode=collabProjection 且写入成功：宿主据此标记「有本地兜底改动待裁决」 */
  onProjectionPersisted?: () => void;
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
        await options?.beforeSave?.();
        if (generation !== loadRequestSeqRef.current) return false;
        const count = getContentLength(normalized);
        let savedContent = normalized;
        let savedCount = count;
        let updateTime = Date.now();
        let updatedDetail: ContentDetailResponse | undefined;
        let persistedViaProjection = false;

        /** 投影通道写入；未写入（unbound=幂等跳过 / drift=漂移已自动解绑）返回 false，
         *  由常规直写接管——此时绑定已不在，直写会被数据库层放行 */
        const projectContent = async () => {
          const binding = await tauri.collabGetBinding(contentId);
          if (!binding) return false;
          const result = await tauri.collabProjectContent({
            contentId,
            documentId: binding.documentId,
            content: normalized,
            count,
            contracts: metadataRef.current?.contracts ?? undefined,
            expectedRevision: metadataRef.current?.revision ?? undefined,
            expectedDocumentId: metadataRef.current?.documentId ?? undefined,
            expectedSourceId: metadataRef.current?.librarySourceId ?? undefined,
          });
          if (!result.reason) updatedDetail = await tauri.getContentDetail(contentId);
          return !result.reason;
        };

        if (options?.saveMode === "collabProjection") {
          // 协作不可用时的本地兜底：先走投影专用通道（不改动服务端，等作者重连后裁决）
          persistedViaProjection = await projectContent();
        }

        if (!persistedViaProjection) {
          try {
            const updated = await tauri.updateContent({
              contentId,
              content: normalized,
              count,
              contracts: metadataRef.current?.contracts ?? undefined,
              expectedRevision: metadataRef.current?.revision ?? undefined,
              expectedDocumentId: metadataRef.current?.documentId ?? undefined,
              expectedSourceId: metadataRef.current?.librarySourceId ?? undefined,
            });
            updatedDetail = updated;
            savedContent = normalizeEditorContent(updated.content);
            savedCount = updated.count;
            updateTime = updated.updateTime;
          } catch (failure) {
            // 常规直写被协作守卫拒绝（绑定仍在、会话未就绪）：改走投影通道落本地库
            if (parseInvokeError(failure).code !== "COLLABORATION_WRITE_REQUIRED") {
              throw failure;
            }
            persistedViaProjection = await projectContent();
            // 兜底投影仍未写入（极端竞态下绑定同时消失）：按保存失败处理，绝不静默吞改动
            if (!persistedViaProjection) throw failure;
          }
        }

        if (generation !== loadRequestSeqRef.current) return true;
        if (updatedDetail)
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
        // 经投影通道落库＝有本机改动未推云端：宿主据此标记，重连后交作者裁决
        if (persistedViaProjection) options?.onProjectionPersisted?.();
        if (updatedDetail) options?.onSaved?.(updatedDetail);
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
        metadataRef.current = result;
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
    return subscribeContentUpdate(nextId, sourceIdRef.current, (nextContent, metadata) => {
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
