import { memo, useRef, useState, useCallback, useEffect } from "react";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
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

  const [hasChanges, setHasChanges] = useState(false);

  const currentDateObj = dayjs(currentDate);
  const weekStart = currentDateObj.startOf("isoWeek");
  const weekEnd = currentDateObj.endOf("isoWeek");
  const weekString = `${currentDateObj.isoWeekYear()}-W${String(currentDateObj.isoWeek()).padStart(2, "0")}`;

  const entry = getWeeklyEntry(currentDate);
  const initialContent =
    entry && hasContent(entry.content) ? entry.content : DEFAULT_CONTENT;
  const latestContentRef = useRef<Descendant[]>(initialContent);

  useEffect(() => {
    if (hasChanges) return;
    latestContentRef.current = initialContent;
  }, [initialContent, hasChanges]);

  const handleContentChange = useCallback((value: Descendant[]) => {
    latestContentRef.current = value;
    setHasChanges(true);
  }, []);

  const saveWeekly = useCallback(async () => {
    if (!hasChanges) return;

    const rawContent = latestContentRef.current ?? DEFAULT_CONTENT;
    const serializedContent = JSON.stringify(rawContent);
    const contentSnapshot = JSON.parse(serializedContent) as Descendant[];
    const isEmptyContent = serializedContent === DEFAULT_CONTENT_HASH;

    try {
      if (entry) {
        if (isEmptyContent && !entry.weather && !entry.mood) {
          await onDeleteDiaryEntry(entry.id);
        } else {
          await onUpdateDiaryEntry({
            id: entry.id,
            content: contentSnapshot,
          });
        }
      } else {
        if (!isEmptyContent) {
          await onCreateDiaryEntry({
            type: "weekly",
            date: weekString,
            weather: null,
            mood: null,
            content: contentSnapshot,
          });
        }
      }

      const latestContentString = JSON.stringify(
        latestContentRef.current ?? DEFAULT_CONTENT,
      );
      if (latestContentString === serializedContent) {
        setHasChanges(false);
      }
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
  const displayTitle = `${currentDateObj.isoWeekYear()} 年 ${weekNumber} 周`;
  const displayDateRange = `${weekStart.format("MM月DD日")} - ${weekEnd.format("MM月DD日")}`;

  return (
    <div className="flex flex-col h-full overflow-hidden w-full box-border">
      <div className="py-7 px-8 border-b border-[#f0f0f0] dark:border-[#2a2a2a]">
        <h2 className="m-0 mb-2.5 text-[26px] font-semibold text-gray-800 dark:text-gray-50">
          {displayTitle}
        </h2>
        <p className="m-0 text-sm text-gray-500 dark:text-gray-400 font-medium">
          {displayDateRange}
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden p-8 pb-20 flex justify-center text-base">
        <div className="w-full h-full overflow-auto max-w-[800px]">
          <Editor
            ref={editorRef}
            extensions={customExtensions}
            initValue={initialContent}
            onChange={handleContentChange}
            readonly={false}
            uploadResource={uploadResource}
            placeHolder="记录这一周的总结与思考..."
          />
        </div>
      </div>
    </div>
  );
});

export default WeeklyView;
