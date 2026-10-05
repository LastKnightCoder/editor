// 快速捕获控制器：600ms 防抖落库、草稿 localStorage 持久化、
// 清空即删卡。原先寄生在 AppShell 的约 300 行逻辑下沉至此。

import { useEffect, useMemo, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import type { Descendant } from "slate";
import * as tauri from "../../../services/tauri";
import { useSingleFlight } from "../../../hooks/useSingleFlight";
import {
  EMPTY_EDITOR_CONTENT,
  getContentLength,
  isEditorContentEmpty,
  normalizeEditorContent,
} from "../editorContentUtils";
import { clearQuickCaptureDraft, hasQuickCaptureDraft } from "../quickCaptureDraft";
import { toast } from "../../../components/toast";

const QUICK_CAPTURE_DEBOUNCE_MS = 600;

export type QuickCaptureControllerDeps = {
  presentError: (error: unknown, fallback: string) => void;
  refreshCards: () => Promise<unknown>;
};

export function useQuickCaptureController(deps: QuickCaptureControllerDeps) {
  const [saving, setSaving] = useState(false);

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
    dirtyRef.current = false;
    lastSavedSnapshotRef.current = "";
    contentRef.current = EMPTY_EDITOR_CONTENT;
  });

  const persist = useMemoizedFn(async (): Promise<boolean> => {
    const normalizedContent = normalizeEditorContent(contentRef.current);
    contentRef.current = normalizedContent;
    if (isEditorContentEmpty(normalizedContent)) {
      return true;
    }

    const contentKey = JSON.stringify(normalizedContent);
    if (contentKey === lastSavedSnapshotRef.current) {
      clearQuickCaptureDraft();
      return true;
    }

    setSaving(true);
    try {
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
      } else {
        if (!contentId || contentId <= 0) {
          const detail = await tauri.getCardDetail(cardId);
          contentId = detail.contentId;
          contentIdRef.current = contentId;
        }
        await tauri.updateContent({
          contentId,
          content: normalizedContent,
          count: getContentLength(normalizedContent),
        });
      }

      lastSavedSnapshotRef.current = contentKey;
      clearQuickCaptureDraft();
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

  const handleContentChange = useMemoizedFn((content: Descendant[]) => {
    const normalized = normalizeEditorContent(content);
    // 选区变化/输入法合成会以相同内容重复触发 onChange，
    // 内容未变时不标脏，否则防抖被无限重启、flush 也会空转
    if (JSON.stringify(normalized) === JSON.stringify(contentRef.current)) {
      return;
    }
    contentRef.current = normalized;
    dirtyRef.current = true;
    schedulePersist();
  });

  const handleClear = useMemoizedFn(() => {
    if (saving) return;
    clearDebounceTimer();
    dirtyRef.current = false;
    contentRef.current = EMPTY_EDITOR_CONTENT;
    lastSavedSnapshotRef.current = "";
    clearQuickCaptureDraft();

    const cardId = cardIdRef.current;
    if (cardId === null) return;

    setSaving(true);
    void (async () => {
      try {
        const changed = await tauri.deleteCard(cardId);
        if (changed <= 0) {
          throw new Error("CARD_NOT_FOUND: card does not exist");
        }
        cardIdRef.current = null;
        contentIdRef.current = null;
        await refreshCards();
      } catch (error) {
        presentError(error, "清空快速捕获内容失败，请稍后重试");
      } finally {
        setSaving(false);
      }
    })();
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
      onContentChange: handleContentChange,
      onClear: handleClear,
      requestClose,
    }),
    [saving, handleContentChange, handleClear, requestClose]
  );
}
