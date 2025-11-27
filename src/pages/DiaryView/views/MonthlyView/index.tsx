import { memo, useRef, useEffect, useState, useCallback } from "react";
import dayjs from "dayjs";
import { useRafInterval, useUnmount } from "ahooks";
import Editor, { EditorRef } from "@/components/Editor";
import useDiaryStore from "@/stores/useDiaryStore";
import useUploadResource from "@/hooks/useUploadResource";
import type { Descendant } from "slate";
import {
  contentLinkExtension,
  chatReferenceExtension,
  questionCardExtension,
  fileAttachmentExtension,
} from "@/editor-extensions";

const customExtensions = [
  contentLinkExtension,
  chatReferenceExtension,
  questionCardExtension,
  fileAttachmentExtension,
];
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
    <div className="flex flex-col h-full overflow-hidden w-full box-border">
      <div className="py-7 px-8 border-b border-[#f0f0f0] dark:border-[#2a2a2a]">
        <h2 className="m-0 text-[26px] font-semibold text-gray-800 dark:text-gray-50">
          {displayTitle}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-8 pb-20 flex justify-center text-base">
        <div className="w-full max-w-[800px]">
          <Editor
            ref={editorRef}
            extensions={customExtensions}
            initValue={
              entry && hasContent(entry.content)
                ? entry.content
                : DEFAULT_CONTENT
            }
            onChange={handleContentChange}
            readonly={false}
            uploadResource={uploadResource}
            placeHolder="记录这个月的总结与反思..."
          />
        </div>
      </div>
    </div>
  );
});

export default MonthlyView;
