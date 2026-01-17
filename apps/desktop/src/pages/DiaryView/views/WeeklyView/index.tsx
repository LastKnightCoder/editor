import { memo, useRef, useState, useCallback, useEffect } from "react";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { useRafInterval, useUnmount } from "ahooks";
import useDiaryStore from "@/stores/useDiaryStore";
import type { Descendant } from "slate";
import {
  contentLinkExtension,
  chatReferenceExtension,
  questionCardExtension,
  fileAttachmentExtension,
} from "@/editor-extensions";
import DiaryContentEditor from "../../components/DiaryContentEditor";
import {
  createEmptyDiaryContent,
  hasDiaryContent,
} from "../../constants/content";
const customExtensions = [
  contentLinkExtension,
  chatReferenceExtension,
  questionCardExtension,
  fileAttachmentExtension,
];

dayjs.extend(isoWeek);

const WeeklyView = memo(() => {
  const {
    currentDate,
    getWeeklyEntry,
    onCreateDiaryEntry,
    onUpdateDiaryEntry,
    initLoading,
  } = useDiaryStore();

  const [hasChanges, setHasChanges] = useState(false);

  const currentDateObj = dayjs(currentDate);
  const weekStart = currentDateObj.startOf("isoWeek");
  const weekEnd = currentDateObj.endOf("isoWeek");
  // 年份按周日（周的最后一天）所在的年份判断
  const weekYear = weekEnd.year();
  const weekString = `${weekYear}-W${String(currentDateObj.isoWeek()).padStart(2, "0")}`;

  const entry = getWeeklyEntry(currentDate);
  const initialContent =
    entry && hasDiaryContent(entry.content)
      ? entry.content
      : createEmptyDiaryContent();
  const latestContentRef = useRef<Descendant[]>(initialContent);
  const creationTrackerRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (initLoading) return;
    if (entry) return;
    const creationKey = `weekly-${weekString}`;
    if (creationTrackerRef.current.has(creationKey)) return;

    creationTrackerRef.current.add(creationKey);
    onCreateDiaryEntry({
      type: "weekly",
      date: weekString,
      weather: null,
      mood: null,
      content: createEmptyDiaryContent(),
    })
      .catch((error) => {
        console.error("Failed to auto create weekly diary:", error);
      })
      .finally(() => {
        creationTrackerRef.current.delete(creationKey);
      });
  }, [entry, weekString, initLoading, onCreateDiaryEntry]);

  useEffect(() => {
    if (hasChanges) return;
    latestContentRef.current =
      entry && hasDiaryContent(entry.content)
        ? entry.content
        : createEmptyDiaryContent();
  }, [entry, hasChanges]);

  const handleContentChange = useCallback((value: Descendant[]) => {
    latestContentRef.current = value;
    setHasChanges(true);
  }, []);

  const saveWeekly = useCallback(async () => {
    if (!hasChanges || !entry) return;

    const rawContent = latestContentRef.current ?? createEmptyDiaryContent();
    const serializedContent = JSON.stringify(rawContent);
    const contentSnapshot = JSON.parse(serializedContent) as Descendant[];

    try {
      await onUpdateDiaryEntry({
        id: entry.id,
        content: contentSnapshot,
      });

      const latestContentString = JSON.stringify(
        latestContentRef.current ?? createEmptyDiaryContent(),
      );
      if (latestContentString === serializedContent) {
        setHasChanges(false);
      }
    } catch (error) {
      console.error("Failed to save weekly:", error);
    }
  }, [hasChanges, entry, onUpdateDiaryEntry]);

  useRafInterval(() => {
    saveWeekly();
  }, 1000);

  useUnmount(() => {
    saveWeekly();
  });

  const weekNumber = currentDateObj.isoWeek();
  const displayTitle = `${weekYear} 年 ${weekNumber} 周`;
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
        <div className="w-full h-full overflow-auto max-w-[800px] px-5">
          <DiaryContentEditor
            contentId={entry?.contentId}
            initialValue={initialContent}
            extensions={customExtensions}
            placeholder="记录这一周的总结与思考..."
            onContentChange={handleContentChange}
          />
        </div>
      </div>
    </div>
  );
});

export default WeeklyView;
