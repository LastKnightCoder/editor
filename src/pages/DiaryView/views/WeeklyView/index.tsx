import { memo, useRef, useEffect, useState, useCallback } from "react";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { useRafInterval, useUnmount } from "ahooks";
import classNames from "classnames";
import Editor, { EditorRef } from "@/components/Editor";
import useDiaryStore from "@/stores/useDiaryStore";
import useUploadResource from "@/hooks/useUploadResource";
import useTheme from "@/hooks/useTheme";
import styles from "./index.module.less";
import type { Descendant } from "slate";

dayjs.extend(isoWeek);

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

const WeeklyView = memo(() => {
  const {
    currentDate,
    getWeeklyEntry,
    onCreateDiaryEntry,
    onUpdateDiaryEntry,
    onDeleteDiaryEntry,
  } = useDiaryStore();

  const editorRef = useRef<EditorRef | null>(null);
  const uploadResource = useUploadResource();
  const { isDark } = useTheme();

  const [hasChanges, setHasChanges] = useState(false);

  const currentDateObj = dayjs(currentDate);
  const weekStart = currentDateObj.startOf("isoWeek");
  const weekEnd = currentDateObj.endOf("isoWeek");
  const weekString = `${currentDateObj.year()}-W${String(currentDateObj.isoWeek()).padStart(2, "0")}`;

  const entry = getWeeklyEntry(currentDate);
  const lastLoadedEntryRef = useRef<{
    entryId: number | null;
    dateKey: string;
    contentHash: string;
  } | null>(null);

  useEffect(() => {
    const dateKey = weekString;
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
  }, [entry, weekString]);

  const handleContentChange = useCallback(() => {
    setHasChanges(true);
  }, []);

  const saveWeekly = useCallback(async () => {
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
            type: "weekly",
            date: weekString,
            contentId: 0,
            weather: null,
            mood: null,
            content,
          });
        }
      }

      setHasChanges(false);
    } catch (error) {
      console.error("Failed to save weekly:", error);
    }
  }, [
    hasChanges,
    entry,
    weekString,
    onCreateDiaryEntry,
    onUpdateDiaryEntry,
    onDeleteDiaryEntry,
  ]);

  useRafInterval(() => {
    saveWeekly();
  }, 1000);

  useUnmount(() => {
    saveWeekly();
  });

  const weekNumber = currentDateObj.isoWeek();
  const displayTitle = `${currentDateObj.year()} 年 ${weekNumber} 周`;
  const displayDateRange = `${weekStart.format("MM月DD日")} - ${weekEnd.format("MM月DD日")}`;

  return (
    <div className={classNames(styles.weeklyView, { [styles.dark]: isDark })}>
      <div className={styles.header}>
        <h2 className={styles.title}>{displayTitle}</h2>
        <p className={styles.dateRange}>{displayDateRange}</p>
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
          placeHolder="记录这一周的总结与思考..."
        />
      </div>
    </div>
  );
});

export default WeeklyView;
