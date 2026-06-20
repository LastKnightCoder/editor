import React, { memo, useCallback, useRef } from "react";
import type { Descendant } from "slate";
import classNames from "classnames";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useThrottleFn, useUnmount } from "ahooks";
import { Plus } from "lucide-react";
import "dayjs/locale/zh-cn";

import useThemeColors from "@/hooks/useThemeColors";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import type { DiaryEntry } from "@/types/diary";
import DiaryContentEditor from "@/pages/DiaryView/components/DiaryContentEditor";
import { createEmptyDiaryContent } from "@/pages/DiaryView/constants/content";
import { getIconPath } from "@/pages/DiaryView/utils/getIconPath";
import { WEATHER_ICONS } from "@/pages/DiaryView/constants/icons";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

interface DiaryTimelineSectionProps {
  recentDiaries: DiaryEntry[];
  todayDiaryExists: boolean;
  onSaveDiary: (
    id: number,
    content: Descendant[],
  ) => Promise<DiaryEntry | null>;
  onCreateToday: () => Promise<DiaryEntry | null>;
}

const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

// 从 Slate content 中提取纯文本，用于字数统计
function extractPlainText(nodes: Descendant[]): string {
  let text = "";
  const walk = (node: unknown) => {
    if (typeof node !== "object" || node === null) return;
    if (
      "text" in node &&
      typeof (node as { text: unknown }).text === "string"
    ) {
      text += (node as { text: string }).text;
    }
    if (
      "children" in node &&
      Array.isArray((node as { children: unknown[] }).children)
    ) {
      for (const child of (node as { children: unknown[] }).children) {
        walk(child);
      }
    }
  };
  for (const n of nodes) walk(n);
  return text;
}

const countWords = (content: Descendant[] | undefined): number => {
  if (!content || content.length === 0) return 0;
  return extractPlainText(content).length;
};

// 计算左列日期标识：今天/昨天显示相对词，其余显示月-日
const getDateLabel = (
  dateStr: string,
): { primary: string; secondary: string } => {
  const date = dayjs(dateStr);
  const today = dayjs().startOf("day");
  const diffDays = today.diff(date.startOf("day"), "day");
  const weekday = WEEKDAY_LABELS[date.day()];

  if (diffDays === 0) {
    return {
      primary: "今天",
      secondary: `${date.format("M月D日")} · ${weekday}`,
    };
  }
  if (diffDays === 1) {
    return {
      primary: "昨天",
      secondary: `${date.format("M月D日")} · ${weekday}`,
    };
  }
  return { primary: date.format("M月D日"), secondary: weekday };
};

// ---- 单张日记卡片：独立维护 content 快照与节流保存 ----
interface DiaryTimelineCardProps {
  entry: DiaryEntry;
  isLast: boolean;
  onSaveDiary: (
    id: number,
    content: Descendant[],
  ) => Promise<DiaryEntry | null>;
}

const DiaryTimelineCard = memo(
  ({ entry, isLast, onSaveDiary }: DiaryTimelineCardProps) => {
    const themeColors = useThemeColors();
    const extensions = useDynamicExtensionsStore((state) => state.extensions);

    const latestContentRef = useRef<Descendant[]>(
      entry.content ?? createEmptyDiaryContent(),
    );

    const { primary, secondary } = getDateLabel(entry.date);

    // 同步 diary 条目快照（content + wordCount），节流 1s，与 DailyView 双写模式一致
    const { run: flushDiary, cancel: cancelFlush } = useThrottleFn(
      async (id: number, content: Descendant[]) => {
        await onSaveDiary(id, content);
      },
      { wait: 1000, leading: false, trailing: true },
    );

    useUnmount(() => {
      // 组件卸载时兜底落库
      flushDiary(entry.id, latestContentRef.current);
      cancelFlush();
    });

    const handleContentChange = useCallback(
      (content: Descendant[]) => {
        latestContentRef.current = content;
        flushDiary(entry.id, content);
      },
      [entry.id, flushDiary],
    );

    const weatherStr = entry.weather ? JSON.stringify(entry.weather) : null;
    const moodStr = entry.mood ? JSON.stringify(entry.mood) : null;
    const weatherIconSrc = getIconPath(weatherStr, "weather");
    const moodIconSrc = getIconPath(moodStr, "mood");
    const weatherColor =
      WEATHER_ICONS.find((icon) => icon.id === entry.weather?.value)?.color ||
      "#000000";

    const wordCount = countWords(entry.content);

    return (
      <div className="grid grid-cols-[64px_20px_minmax(0,1fr)] gap-4 min-w-0">
        {/* 左列：日期标识 */}
        <div className="flex flex-col items-end pt-2 text-right">
          <span
            className={classNames(
              "text-sm font-semibold leading-tight",
              themeColors.textClass,
            )}
          >
            {primary}
          </span>
          <span
            className={classNames(
              "mt-1 text-[11px] leading-tight",
              themeColors.secondaryTextClass,
            )}
          >
            {secondary}
          </span>
        </div>

        {/* 中列：竖线 + 圆点 */}
        <div className="relative flex justify-center">
          {/* 竖线：贯穿上下，最后一项不向下延伸 */}
          {!isLast && (
            <span className="absolute top-3 bottom-[-1rem] w-px bg-[var(--th-card-border)]" />
          )}
          <span
            className="relative z-[1] mt-3 h-2 w-2 shrink-0 rounded-full"
            style={{
              backgroundColor: themeColors.timelineRingColor,
              boxShadow: `0 0 0 3px var(--th-card-bg)`,
            }}
          />
        </div>

        {/* 右列：日记卡片 */}
        <div
          className={classNames(
            "mb-4 min-w-0 rounded-xl border p-4",
            themeColors.cardBorderClass,
            themeColors.inputBgClass,
          )}
        >
          {/* 头部：天气/心情/字数/相对时间 */}
          <div
            className={classNames(
              "mb-2 flex items-center gap-3 text-[11px]",
              themeColors.secondaryTextClass,
            )}
          >
            <div className="flex items-center gap-2">
              {weatherIconSrc && entry.weather && (
                <div
                  className="h-4 w-4"
                  style={{
                    maskImage: `url(${weatherIconSrc})`,
                    WebkitMaskImage: `url(${weatherIconSrc})`,
                    maskSize: "contain",
                    WebkitMaskSize: "contain",
                    maskRepeat: "no-repeat",
                    WebkitMaskRepeat: "no-repeat",
                    maskPosition: "center",
                    WebkitMaskPosition: "center",
                    backgroundColor: weatherColor,
                  }}
                />
              )}
              {moodIconSrc && (
                <img
                  src={moodIconSrc}
                  alt="mood"
                  className="h-4 w-4 object-contain"
                />
              )}
            </div>
            <span className="tabular-nums">{wordCount} 字</span>
            <span>·</span>
            <span>{dayjs(entry.updateTime).fromNow()}</span>
          </div>

          {/* 正文：可编辑 */}
          <div className="min-h-20">
            <DiaryContentEditor
              contentId={entry.contentId}
              initialValue={entry.content ?? createEmptyDiaryContent()}
              extensions={extensions}
              placeholder="记录今天发生了什么..."
              className="text-sm leading-relaxed"
              onContentChange={handleContentChange}
            />
          </div>
        </div>
      </div>
    );
  },
);

DiaryTimelineCard.displayName = "DiaryTimelineCard";

// ---- 时间轴区块 ----
const DiaryTimelineSection: React.FC<DiaryTimelineSectionProps> = ({
  recentDiaries,
  todayDiaryExists,
  onSaveDiary,
  onCreateToday,
}) => {
  const themeColors = useThemeColors();
  const { createTab } = useTabStore();

  const handleOpenDiary = () => {
    createTab(TabType.DailyNote);
  };

  const handleCreateToday = async () => {
    await onCreateToday();
  };

  return (
    <section
      className={classNames(
        "rounded-xl border p-5",
        themeColors.cardBgClass,
        themeColors.cardBorderClass,
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h2
            className={classNames(
              "text-sm font-semibold",
              themeColors.textClass,
            )}
          >
            日记
          </h2>
          <span
            className={classNames("text-xs", themeColors.secondaryTextClass)}
          >
            最近 {recentDiaries.length} 篇
          </span>
        </div>
        <button
          type="button"
          onClick={handleOpenDiary}
          className={classNames(
            "rounded-lg border px-3 py-1.5 text-xs transition-colors",
            themeColors.cardBorderClass,
            themeColors.secondaryTextClass,
            themeColors.hoverClass,
          )}
        >
          打开日记
        </button>
      </div>

      {recentDiaries.length === 0 && todayDiaryExists ? (
        <div
          className={classNames(
            "py-8 text-center text-sm",
            themeColors.secondaryTextClass,
          )}
        >
          暂无日记
        </div>
      ) : (
        <div className="flex flex-col">
          {recentDiaries.map((entry, index) => (
            <DiaryTimelineCard
              key={entry.id}
              entry={entry}
              isLast={index === recentDiaries.length - 1 && todayDiaryExists}
              onSaveDiary={onSaveDiary}
            />
          ))}

          {/* 添加今日日记入口：倒序后位于时间轴最下端（代表"今天"的位置） */}
          {!todayDiaryExists && (
            <button
              type="button"
              onClick={handleCreateToday}
              className={classNames(
                "grid w-full grid-cols-[64px_20px_minmax(0,1fr)] gap-4 rounded-xl border border-dashed p-4 text-left transition-colors",
                themeColors.cardBorderClass,
                themeColors.hoverClass,
              )}
            >
              <div className="flex flex-col items-end pt-1 text-right">
                <span
                  className={classNames(
                    "text-sm font-semibold",
                    themeColors.textClass,
                  )}
                >
                  今天
                </span>
              </div>
              <div className="flex justify-center">
                <span
                  className="mt-3 h-2 w-2 rounded-full"
                  style={{ backgroundColor: themeColors.timelineRingColor }}
                />
              </div>
              <div
                className={classNames(
                  "flex min-w-0 items-center gap-2 text-sm",
                  themeColors.secondaryTextClass,
                )}
              >
                <Plus className="h-4 w-4" />
                <span>记录今天发生了什么...</span>
              </div>
            </button>
          )}
        </div>
      )}
    </section>
  );
};

export default DiaryTimelineSection;
