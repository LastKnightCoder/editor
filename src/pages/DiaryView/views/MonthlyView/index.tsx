import { memo, useRef, useState, useCallback, useEffect } from "react";
import dayjs from "dayjs";
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
const MonthlyView = memo(() => {
  const {
    currentDate,
    getMonthlyEntry,
    onCreateDiaryEntry,
    onUpdateDiaryEntry,
    initLoading,
  } = useDiaryStore();

  const [hasChanges, setHasChanges] = useState(false);

  const currentDateObj = dayjs(currentDate);
  const year = currentDateObj.year();
  const month = currentDateObj.month() + 1;
  const monthString = `${year}-${String(month).padStart(2, "0")}`;

  const entry = getMonthlyEntry(currentDate);
  const initialContent =
    entry && hasDiaryContent(entry.content)
      ? entry.content
      : createEmptyDiaryContent();
  const latestContentRef = useRef<Descendant[]>(initialContent);
  const creationTrackerRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (initLoading) return;
    if (entry) return;
    const creationKey = `monthly-${monthString}`;
    if (creationTrackerRef.current.has(creationKey)) return;

    creationTrackerRef.current.add(creationKey);
    onCreateDiaryEntry({
      type: "monthly",
      date: monthString,
      weather: null,
      mood: null,
      content: createEmptyDiaryContent(),
    })
      .catch((error) => {
        console.error("Failed to auto create monthly diary:", error);
      })
      .finally(() => {
        creationTrackerRef.current.delete(creationKey);
      });
  }, [entry, monthString, initLoading, onCreateDiaryEntry]);

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

  const saveMonthly = useCallback(async () => {
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
      console.error("Failed to save monthly:", error);
    }
  }, [hasChanges, entry, onUpdateDiaryEntry]);

  useRafInterval(() => {
    saveMonthly();
  }, 1000);

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

      <div className="flex-1 min-h-0 overflow-hidden p-8 pb-20 flex justify-center text-base">
        <div className="w-full h-full overflow-auto max-w-[800px]">
          <DiaryContentEditor
            contentId={entry?.contentId}
            initialValue={initialContent}
            extensions={customExtensions}
            placeholder="记录这个月的总结与反思..."
            onContentChange={handleContentChange}
          />
        </div>
      </div>
    </div>
  );
});

export default MonthlyView;
