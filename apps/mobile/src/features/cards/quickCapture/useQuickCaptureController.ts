// 快速捕获控制器：600ms 防抖落库、草稿 localStorage 持久化、
// 清空即删卡。原先寄生在 AppShell 的约 300 行逻辑下沉至此。

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useMemoizedFn } from "ahooks";
import type { EditorRef } from "@tau/editor";
import type { NodeTreeEditor } from "@tau/editor-collab";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import type { Descendant } from "slate";
import type { ContentDetailResponse } from "../../../types";
import * as tauri from "../../../services/tauri";
import { useSingleFlight } from "../../../hooks/useSingleFlight";
import useLocalContentDocument from "../../../hooks/useLocalContentDocument";
import {
  EMPTY_EDITOR_CONTENT,
  getContentLength,
  isEditorContentEmpty,
  normalizeEditorContent,
} from "../editorContentUtils";
import {
  clearQuickCaptureDraft,
  hasQuickCaptureDraft,
  writeQuickCaptureDraft,
} from "../quickCaptureDraft";
import { toast } from "../../../components/toast";

const QUICK_CAPTURE_DEBOUNCE_MS = 600;

export type QuickCaptureControllerDeps = {
  presentError: (error: unknown, fallback: string) => void;
  refreshCards: () => Promise<unknown>;
};

export function useQuickCaptureController(deps: QuickCaptureControllerDeps) {
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<ContentDetailResponse>();
  const metadataRef = useRef<ContentDetailResponse | undefined>(undefined);
  const editorRef = useRef<EditorRef | null>(null);

  const contentRef = useRef<Descendant[]>(EMPTY_EDITOR_CONTENT);
  const cardIdRef = useRef<number | null>(null);
  const contentIdRef = useRef<number | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const lastSavedSnapshotRef = useRef("");

  const { presentError, refreshCards } = deps;

  // 页面挂载 = 快速捕获打开：重置会话；存在未完成草稿时提示恢复
  useEffect(() => {
    if (hasQuickCaptureDraft()) {
      toast.info("检测到未完成的快速捕获草稿，可点击 + 继续编辑");
    }
    return () => {
      clearDebounceTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearDebounceTimer = useMemoizedFn(() => {
    if (debounceTimerRef.current === null) return;
    if (typeof window !== "undefined") {
      window.clearTimeout(debounceTimerRef.current);
    } else {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = null;
  });

  const resetSession = useMemoizedFn(() => {
    clearDebounceTimer();
    cardIdRef.current = null;
    contentIdRef.current = null;
    metadataRef.current = undefined;
    setDetail(undefined);
    dirtyRef.current = false;
    lastSavedSnapshotRef.current = "";
    contentRef.current = EMPTY_EDITOR_CONTENT;
  });

  const persist = useMemoizedFn(async (): Promise<boolean> => {
    // 首次落库前同步暂停临时编辑器，接入持久正文时不覆盖在途输入。
    if (!metadataRef.current) flushSync(() => setSaving(true));
    else setSaving(true);
    try {
      (
        editorRef.current?.getEditor() as Partial<NodeTreeEditor> | undefined
      )?.flushNodeTreeInputs?.();
      await localDocument?.flush();
      const normalizedContent = structuredClone(normalizeEditorContent(contentRef.current));
      if (isEditorContentEmpty(normalizedContent)) return true;
      const contentKey = JSON.stringify(normalizedContent);
      if (contentKey === lastSavedSnapshotRef.current && metadataRef.current) {
        clearQuickCaptureDraft();
        return true;
      }
      let cardId = cardIdRef.current;
      let contentId = contentIdRef.current;
      if (cardId === null) {
        const created = await tauri.createQuickCard({
          content: normalizedContent,
          count: getContentLength(normalizedContent),
        });
        cardId = created.id;
        contentId = created.contentId;
        cardIdRef.current = cardId;
        contentIdRef.current = contentId;
      }
      if (!contentId) throw new Error("CONTENT_NOT_FOUND: 正文不存在");
      if (!metadataRef.current) {
        const created = await tauri.getContentDetail(contentId);
        if (
          !created.contracts ||
          !created.documentId ||
          !created.librarySourceId ||
          !created.revision
        )
          throw new Error("CONTENT_CONTRACT_INVALID: 新建正文身份不完整");
        metadataRef.current = created;
        setDetail(created);
        contentRef.current = created.content;
        lastSavedSnapshotRef.current = JSON.stringify(created.content);
        clearQuickCaptureDraft();
        return true;
      }
      const metadata = metadataRef.current;
      const updated = await tauri.updateContent({
        contentId,
        content: normalizedContent,
        count: getContentLength(normalizedContent),
        contracts: metadata.contracts ?? undefined,
        expectedRevision: metadata.revision ?? undefined,
        expectedDocumentId: metadata.documentId ?? undefined,
        expectedSourceId: metadata.librarySourceId ?? undefined,
      });
      metadataRef.current = {
        ...updated,
        contracts: { ...updated.contracts, ...metadataRef.current.contracts },
      };
      setDetail(metadataRef.current);
      lastSavedSnapshotRef.current = JSON.stringify(updated.content);
      if (JSON.stringify(contentRef.current) === contentKey) clearQuickCaptureDraft();
      return true;
    } catch (error) {
      presentError(error, "快速捕获保存失败，请稍后重试");
      return false;
    } finally {
      setSaving(false);
    }
  });

  const flushQueue = useSingleFlight(async (): Promise<boolean> => {
    let allSucceeded = true;
    // 有界重试：编辑器可能因选区/输入法合成连续触发内容事件（内容未必变化），
    // 无界 do-while 会在 persist 空转（快照未变不落库）时自旋卡死主线程
    let remainingRounds = 8;
    do {
      dirtyRef.current = false;
      const success = await persist();
      if (!success) {
        allSucceeded = false;
      }
    } while (dirtyRef.current && --remainingRounds > 0);
    return allSucceeded;
  });

  const schedulePersist = useMemoizedFn(() => {
    clearDebounceTimer();
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void flushQueue();
    }, QUICK_CAPTURE_DEBOUNCE_MS);
  });

  const handleContentChange = useMemoizedFn(
    (content: Descendant[], contracts?: ContentContractDictionary) => {
      if (metadataRef.current && contracts)
        metadataRef.current = { ...metadataRef.current, contracts };
      const normalized = normalizeEditorContent(content);
      // 选区变化/输入法合成会以相同内容重复触发 onChange，
      // 内容未变时不标脏，否则防抖被无限重启、flush 也会空转
      if (JSON.stringify(normalized) === JSON.stringify(contentRef.current)) {
        return;
      }
      contentRef.current = normalized;
      writeQuickCaptureDraft(normalized);
      dirtyRef.current = true;
      schedulePersist();
    }
  );

  const localDocument = useLocalContentDocument({
    contentId: detail?.contentId,
    content: detail?.content ?? EMPTY_EDITOR_CONTENT,
    metadata: detail,
    version: 0,
    onChange: handleContentChange,
  });

  const handleClear = useMemoizedFn(async (): Promise<boolean> => {
    if (saving) return false;
    clearDebounceTimer();
    const cardId = cardIdRef.current;
    setSaving(true);
    try {
      if (cardId !== null) {
        const changed = await tauri.deleteCard(cardId);
        if (changed <= 0) {
          throw new Error("CARD_NOT_FOUND: card does not exist");
        }
        await refreshCards();
      }
      resetSession();
      clearQuickCaptureDraft();
      return true;
    } catch (error) {
      presentError(error, "清空快速捕获内容失败，请稍后重试");
      return false;
    } finally {
      setSaving(false);
    }
  });

  /** 关闭：flush 持久化队列 → 空内容且已建卡则删卡 → 复位并返回 true（调用方负责 goBack） */
  const runClose = useSingleFlight(async (content?: Descendant[]): Promise<boolean> => {
    clearDebounceTimer();
    const normalizedContent = normalizeEditorContent(content ?? contentRef.current);
    contentRef.current = normalizedContent;

    if (!isEditorContentEmpty(normalizedContent)) {
      dirtyRef.current = true;
      const persisted = await flushQueue();
      if (!persisted) return false;
    }

    const finalContent = normalizeEditorContent(contentRef.current);
    const currentCardId = cardIdRef.current;
    if (isEditorContentEmpty(finalContent) && currentCardId !== null) {
      setSaving(true);
      try {
        const changed = await tauri.deleteCard(currentCardId);
        if (changed <= 0) {
          throw new Error("CARD_NOT_FOUND: card does not exist");
        }
      } catch (error) {
        presentError(error, "删除空白捕获卡片失败");
        return false;
      } finally {
        setSaving(false);
      }
    }

    clearQuickCaptureDraft();
    resetSession();
    await refreshCards();
    return true;
  });

  const requestClose = useMemoizedFn(async (content?: Descendant[]): Promise<boolean> => {
    // 关闭入口（X/下拉/系统返回）可能几乎同时触发：进行中的关闭直接复用结果，
    // 避免并行链各自落库+刷新叠加成 IPC 风暴；saving 仅对新发起的关闭生效
    if (runClose.isActive()) {
      return runClose();
    }
    if (saving) return false;
    return runClose(content);
  });

  return useMemo(
    () => ({
      saving,
      editorRef,
      document: localDocument,
      readonly: !detail && (saving || cardIdRef.current !== null),
      onContentChange: handleContentChange,
      onClear: handleClear,
      requestClose,
    }),
    [saving, detail, localDocument, handleContentChange, handleClear, requestClose]
  );
}
