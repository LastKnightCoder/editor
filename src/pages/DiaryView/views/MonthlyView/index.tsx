import { memo, useRef, useEffect, useState, useCallback } from "react";
import dayjs from "dayjs";
import { useRafInterval, useUnmount } from "ahooks";
import classNames from "classnames";
import Editor, { EditorRef } from "@/components/Editor";
import useDiaryStore from "@/stores/useDiaryStore";
import useUploadResource from "@/hooks/useUploadResource";
import useTheme from "@/hooks/useTheme";
import styles from "./index.module.less";
import type { Descendant } from "slate";

const DEFAULT_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    disableDrag: false,
    children: [{ type: "formatted", text: "" }],
  },
];

const DEFAULT_CONTENT_HASH = JSON.stringify(DEFAULT_CONTENT);
const hasContent = (content?: Descendant[] | null): content is Descendant[] =>
  Array.isArray(content) && content.length > 0;

const MonthlyView = memo(() => {
  const {
    currentDate,
    getMonthlyEntry,
    onCreateDiaryEntry,
    onUpdateDiaryEntry,
    onDeleteDiaryEntry,
  } = useDiaryStore();

  const editorRef = useRef<EditorRef | null>(null);
  const uploadResource = useUploadResource();
  const { isDark } = useTheme();

  const [hasChanges, setHasChanges] = useState(false);

  const currentDateObj = dayjs(currentDate);
  const year = currentDateObj.year();
  const month = currentDateObj.month() + 1;
  const monthString = `${year}-${String(month).padStart(2, "0")}`;

  const entry = getMonthlyEntry(currentDate);
  const lastLoadedEntryRef = useRef<{
    entryId: number | null;
    dateKey: string;
    contentHash: string;
  } | null>(null);

  useEffect(() => {
    const dateKey = monthString;
    const entryId = entry?.id ?? null;
    const contentHash =
      entry && hasContent(entry.content)
        ? JSON.stringify(entry.content)
        : DEFAULT_CONTENT_HASH;
    const nextSignature = { entryId, dateKey, contentHash };
    const isSameAsLast =
      lastLoadedEntryRef.current &&
      lastLoadedEntryRef.current.entryId === nextSignature.entryId &&
      lastLoadedEntryRef.current.dateKey === nextSignature.dateKey &&
      lastLoadedEntryRef.current.contentHash === nextSignature.contentHash;

    if (isSameAsLast) {
      return;
    }

    lastLoadedEntryRef.current = nextSignature;
    setHasChanges(false);

    if (editorRef.current) {
      if (entry) {
        const nextContent = hasContent(entry.content)
          ? entry.content
          : DEFAULT_CONTENT;
        editorRef.current.setEditorValue(nextContent);
      } else {
        editorRef.current.setEditorValue(DEFAULT_CONTENT);
      }
    }
  }, [entry, monthString]);

  const handleContentChange = useCallback(() => {
    setHasChanges(true);
  }, []);

  const saveMonthly = useCallback(async () => {
    if (!hasChanges) return;

    const content = editorRef.current?.getEditor().children || [];
    const isEmptyContent = JSON.stringify(content) === DEFAULT_CONTENT_HASH;

    try {
      if (entry) {
        if (isEmptyContent && !entry.weather && !entry.mood) {
          await onDeleteDiaryEntry(entry.id);
        } else {
          await onUpdateDiaryEntry({
            id: entry.id,
            content,
          });
        }
      } else {
        if (!isEmptyContent) {
          await onCreateDiaryEntry({
            type: "monthly",
            date: monthString,
            contentId: 0,
            weather: null,
            mood: null,
            content,
          });
        }
      }

      setHasChanges(false);
    } catch (error) {
      console.error("Failed to save monthly:", error);
    }
  }, [
    hasChanges,
    entry,
    monthString,
    onCreateDiaryEntry,
    onUpdateDiaryEntry,
    onDeleteDiaryEntry,
  ]);

  // Auto-save every second
  useRafInterval(() => {
    saveMonthly();
  }, 1000);

  // Save on unmount
  useUnmount(() => {
    saveMonthly();
  });

  const displayTitle = `${year} 年 ${month} 月总结`;

  return (
    <div className={classNames(styles.monthlyView, { [styles.dark]: isDark })}>
      <div className={styles.header}>
        <h2 className={styles.title}>{displayTitle}</h2>
      </div>

      <div className={styles.editorContainer}>
        <Editor
          ref={editorRef}
          initValue={
            entry && hasContent(entry.content) ? entry.content : DEFAULT_CONTENT
          }
          onChange={handleContentChange}
          readonly={false}
          uploadResource={uploadResource}
          placeHolder="记录这个月的总结与反思..."
        />
      </div>
    </div>
  );
});

export default MonthlyView;
