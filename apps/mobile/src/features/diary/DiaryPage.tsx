import { useEffect, useMemo, useRef, useState } from "react";
import { useMemoizedFn, useThrottleFn } from "ahooks";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Editor, type EditorRef } from "@tau/editor/src";
import type { Descendant } from "slate";
import { useMobileTheme } from "../../hooks/useMobileTheme";
import { resolveScreenMotion } from "../../navigation/screenTransition";
import type { PageTransitionConfig } from "../../navigation/types";
import type { DiaryType } from "../../types";
import { EMPTY_EDITOR_CONTENT, normalizeEditorContent } from "../cards/editorContentUtils";
import { MobileEditorBottomToolbar } from "../cards/editorToolbar/MobileEditorBottomToolbar";
import { useMobileEditorToolbarController } from "../cards/editorToolbar/useMobileEditorToolbarController";
import { mobileCardPreviewExtensions } from "../cards/editorExtensions";
import { formatDiaryPeriodLabel } from "./dateKey";
import { useDiaryStore } from "./store/useDiaryStore";

type DiaryPageProps = {
  onBack: () => void;
  onError: (error: unknown, fallback: string) => void;
  transition?: PageTransitionConfig;
  isVisible?: boolean;
};

const MODE_OPTIONS: Array<{ value: DiaryType; label: string }> = [
  { value: "daily", label: "日记" },
  { value: "weekly", label: "周记" },
  { value: "monthly", label: "月记" },
];

export function DiaryPage({ onBack, onError, transition, isVisible = true }: DiaryPageProps) {
  const { theme } = useMobileTheme();
  const editorRef = useRef<EditorRef | null>(null);
  const applyingStoreContentRef = useRef(false);
  const latestContentRef = useRef<Descendant[]>(normalizeEditorContent(EMPTY_EDITOR_CONTENT));
  const lastSavedSnapshotRef = useRef(JSON.stringify(normalizeEditorContent(EMPTY_EDITOR_CONTENT)));
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);
  const appliedEditorKeyRef = useRef<string | null>(null);
  const [editorContent, setEditorContent] = useState<Descendant[]>(
    normalizeEditorContent(EMPTY_EDITOR_CONTENT)
  );

  const mode = useDiaryStore(state => state.mode);
  const baseDate = useDiaryStore(state => state.baseDate);
  const currentEntry = useDiaryStore(state => state.currentEntry);
  const loading = useDiaryStore(state => state.loading);
  const initialize = useDiaryStore(state => state.initialize);
  const setMode = useDiaryStore(state => state.setMode);
  const shiftDate = useDiaryStore(state => state.shiftDate);
  const saveCurrentContent = useDiaryStore(state => state.saveCurrentContent);
  const clearError = useDiaryStore(state => state.clearError);
  const activeSegmentId = useDiaryStore(state => state.activeSegmentId);
  const selectSegment = useDiaryStore(state => state.selectSegment);
  const appendSegment = useDiaryStore(state => state.appendSegment);
  const deleteCurrentSegment = useDiaryStore(state => state.deleteCurrentSegment);
  const [segmentBusy, setSegmentBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const currentSegment =
    currentEntry?.segments?.find(segment => segment.id === activeSegmentId) ??
    currentEntry?.segments?.[0];

  const reducedMotion = useReducedMotion();
  const motionProps = resolveScreenMotion(transition, reducedMotion === true);
  const toolbarController = useMobileEditorToolbarController({ editorRef });

  const periodLabel = useMemo(() => formatDiaryPeriodLabel(mode, baseDate), [mode, baseDate]);
  const editorKey = useMemo(
    () =>
      currentEntry?.id != null
        ? `diary-editor-${currentEntry.id}-${currentSegment?.id ?? "empty"}`
        : `diary-editor-draft-${mode}-${baseDate}`,
    [currentEntry?.id, currentSegment?.id, mode, baseDate]
  );

  useEffect(() => {
    void initialize().catch(initError => {
      onError(initError, "日记初始化失败");
    });
  }, [initialize, onError]);

  useEffect(() => {
    if (
      appliedEditorKeyRef.current === editorKey &&
      JSON.stringify(latestContentRef.current) !== lastSavedSnapshotRef.current
    ) {
      return;
    }
    appliedEditorKeyRef.current = editorKey;
    const content = normalizeEditorContent(currentSegment?.content ?? EMPTY_EDITOR_CONTENT);
    latestContentRef.current = content;
    lastSavedSnapshotRef.current = JSON.stringify(content);
    setEditorContent(content);
    // Editor 是非受控组件，entry 更新时需要显式同步值，避免界面停留在旧内容。
    applyingStoreContentRef.current = true;
    editorRef.current?.setEditorValue(content);
    Promise.resolve().then(() => {
      applyingStoreContentRef.current = false;
    });
    clearError();
    setConfirmDelete(false);
  }, [clearError, editorKey, currentSegment?.content]);

  const persistLatest = useMemoizedFn(async () => {
    const normalized = normalizeEditorContent(latestContentRef.current);
    const snapshot = JSON.stringify(normalized);
    if (snapshot === lastSavedSnapshotRef.current) {
      return true;
    }
    if (saveInFlightRef.current) {
      return await saveInFlightRef.current;
    }

    const task = saveCurrentContent(normalized)
      .then(() => {
        lastSavedSnapshotRef.current = snapshot;
        return true;
      })
      .catch(saveError => {
        onError(saveError, "日记自动保存失败");
        return false;
      })
      .finally(() => {
        saveInFlightRef.current = null;
      });

    saveInFlightRef.current = task;
    return await task;
  });

  const { run: runThrottledSave, cancel: cancelThrottledSave } = useThrottleFn(
    () => {
      void persistLatest();
    },
    {
      wait: 1000,
      leading: false,
      trailing: true,
    }
  );

  const flushNow = useMemoizedFn(async () => {
    cancelThrottledSave();
    do {
      if (!(await persistLatest())) return false;
    } while (
      JSON.stringify(normalizeEditorContent(latestContentRef.current)) !==
      lastSavedSnapshotRef.current
    );
    return true;
  });

  useEffect(() => {
    return () => {
      void flushNow();
    };
  }, [flushNow]);

  useEffect(() => {
    if (isVisible) {
      return;
    }
    void flushNow();
  }, [flushNow, isVisible]);

  const handleEditorChange = useMemoizedFn((value: Descendant[]) => {
    const normalized = normalizeEditorContent(value);
    latestContentRef.current = normalized;
    setEditorContent(normalized);
    toolbarController.syncSelection();

    const snapshot = JSON.stringify(normalized);
    if (applyingStoreContentRef.current) {
      return;
    }
    if (snapshot === lastSavedSnapshotRef.current) {
      return;
    }
    runThrottledSave();
  });

  const handleBack = useMemoizedFn(async () => {
    if (!(await flushNow())) return;
    onBack();
  });

  const handleSwitchMode = useMemoizedFn(async (nextMode: DiaryType) => {
    if (nextMode === mode) {
      return;
    }
    if (!(await flushNow())) return;
    try {
      await setMode(nextMode);
    } catch (modeError) {
      onError(modeError, "切换日记类型失败");
    }
  });

  const handleShiftDate = useMemoizedFn(async (delta: number) => {
    if (!(await flushNow())) return;
    try {
      await shiftDate(delta);
    } catch (shiftError) {
      onError(shiftError, "切换日期失败");
    }
  });

  const changeSegment = useMemoizedFn(async (action: () => void | Promise<void>) => {
    if (segmentBusy || !(await flushNow())) return;
    setSegmentBusy(true);
    try {
      await action();
    } catch (error) {
      onError(error, "日记片段操作失败");
    } finally {
      setSegmentBusy(false);
    }
  });

  return (
    <motion.div
      initial={motionProps.initial}
      animate={motionProps.animate}
      exit={motionProps.exit}
      className="mobile-kb-screen fixed inset-0 z-50 flex flex-col bg-gray-50 dark:bg-black"
    >
      <header className="mobile-topbar topbar-immersive flex items-center px-2">
        <button
          type="button"
          onClick={() => {
            void handleBack();
          }}
          className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors active:bg-gray-100 dark:text-neutral-300 dark:active:bg-neutral-800"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <h1 className="line-clamp-1 flex-1 px-2 text-center text-base font-semibold text-gray-900 dark:text-neutral-100">
          日记
        </h1>
        <div className="w-10" />
      </header>

      <div className="mobile-fixed-footer-scroll flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          <div className="flex gap-2 rounded-xl bg-white p-2 dark:bg-neutral-900">
            {MODE_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  void handleSwitchMode(option.value);
                }}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  mode === option.value
                    ? "bg-zinc-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                    : "bg-gray-50 text-gray-600 active:bg-gray-100 dark:bg-neutral-800 dark:text-neutral-300 dark:active:bg-neutral-700"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex items-center rounded-xl bg-white px-2 py-2 dark:bg-neutral-900">
            <button
              type="button"
              onClick={() => {
                void handleShiftDate(-1);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 transition-colors active:bg-gray-100 dark:text-neutral-300 dark:active:bg-neutral-800"
              aria-label="上一周期"
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <div className="min-w-0 flex-1 px-2 text-center">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-neutral-100">
                {periodLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void handleShiftDate(1);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 transition-colors active:bg-gray-100 dark:text-neutral-300 dark:active:bg-neutral-800"
              aria-label="下一周期"
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <select
              aria-label="日记片段"
              value={currentSegment?.id ?? ""}
              disabled={segmentBusy || !currentEntry?.segments?.length}
              onChange={event => {
                const id = Number(event.target.value);
                void changeSegment(() => selectSegment(id));
              }}
              className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white p-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            >
              {!currentEntry?.segments?.length && <option value="">新片段</option>}
              {currentEntry?.segments?.map((segment, index) => (
                <option key={segment.id} value={segment.id}>
                  片段 {index + 1} ·{" "}
                  {new Date(segment.createTime).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label="添加片段"
              title="添加片段"
              disabled={segmentBusy}
              onClick={() => {
                void changeSegment(appendSegment);
              }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg disabled:opacity-40"
            >
              <Plus size={18} />
            </button>
            <button
              type="button"
              aria-label="删除片段"
              title="删除片段"
              disabled={segmentBusy || !currentSegment}
              onClick={() => setConfirmDelete(true)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg disabled:opacity-40"
            >
              <Trash2 size={18} />
            </button>
          </div>
          {confirmDelete && (
            <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
              <span>删除当前片段？</span>
              <button type="button" onClick={() => setConfirmDelete(false)}>
                取消
              </button>
              <button
                type="button"
                disabled={segmentBusy}
                onClick={() => {
                  void changeSegment(deleteCurrentSegment);
                }}
                className="text-red-600"
              >
                删除
              </button>
            </div>
          )}
          {!!currentEntry?.tags?.length && (
            <p className="text-sm text-gray-500">{currentEntry.tags.join(" · ")}</p>
          )}
          <div className="rounded-xl bg-white p-3 dark:bg-neutral-950">
            {loading && !currentEntry ? (
              <div className="space-y-2 py-6">
                <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100 dark:bg-neutral-800" />
                <div className="h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-neutral-800" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-gray-100 dark:bg-neutral-800" />
              </div>
            ) : (
              <Editor
                key={editorKey}
                ref={editorRef}
                initValue={editorContent}
                onFocus={toolbarController.handleEditorFocus}
                onBlur={toolbarController.handleEditorBlur}
                onSelectionChange={toolbarController.syncSelection}
                onChange={handleEditorChange}
                readonly={segmentBusy || loading}
                theme={theme}
                extensions={mobileCardPreviewExtensions}
              />
            )}
          </div>
        </div>
      </div>

      <MobileEditorBottomToolbar controller={toolbarController} />
    </motion.div>
  );
}

export default DiaryPage;
