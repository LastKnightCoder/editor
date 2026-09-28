import { memo, useCallback } from "react";
import type { Descendant } from "slate";
import classNames from "classnames";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Plus, MoreHorizontal, Trash2 } from "lucide-react";
import { App, Dropdown } from "antd";
import type { MenuProps } from "antd";
import "dayjs/locale/zh-cn";

import useThemeColors from "@/hooks/useThemeColors";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import type { RecentSegmentItem } from "@/pages/HomeView/hooks/useHomeData";
import type { DiaryTagSetting } from "@/types/diary";
import { createEmptyDiaryContent } from "@/pages/DiaryView/constants/content";
import { getIconPath } from "@/pages/DiaryView/utils/getIconPath";
import { WEATHER_ICONS } from "@/pages/DiaryView/constants/icons";
import DiaryContentEditor from "@/pages/DiaryView/components/DiaryContentEditor";
import { TagEditor } from "@/pages/DiaryView/components/MomentCard";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

interface DiaryTimelineSectionProps {
  recentSegments: RecentSegmentItem[];
  tagSettings: DiaryTagSetting[];
  tagUsageCounts: Map<string, number>;
  onCreateSegmentNow: () => Promise<void>;
  onSegmentChange: (segmentId: number, content: Descendant[]) => Promise<void>;
  onSegmentDelete: (segmentId: number) => Promise<void>;
  /** 标签与片段绑定：回调传 segmentId（勿改成 entryId，会整天共享标签） */
  onTagsChange: (segmentId: number, tags: string[]) => Promise<void>;
  onTagSettingChange: (setting: { name: string; color: string; sort?: number }) => Promise<void>;
  onTagSettingDelete: (name: string) => Promise<void>;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getTagColor(tag: string, tagSettings: DiaryTagSetting[]): string {
  const setting = tagSettings.find(item => item.name === tag);
  return setting?.color || "#8c8c8c";
}

// 单个 segment 时间轴节点
interface SegmentNodeProps {
  item: RecentSegmentItem;
  isLast: boolean;
  tagSettings: DiaryTagSetting[];
  tagUsageCounts: Map<string, number>;
  onSegmentChange: (segmentId: number, content: Descendant[]) => Promise<void>;
  onSegmentDelete: (segmentId: number) => Promise<void>;
  /** 标签与片段绑定：回调传 segmentId */
  onTagsChange: (segmentId: number, tags: string[]) => Promise<void>;
  onTagSettingChange: (setting: { name: string; color: string; sort?: number }) => Promise<void>;
  onTagSettingDelete: (name: string) => Promise<void>;
}

const SegmentNode = memo(
  ({
    item,
    isLast,
    tagSettings,
    tagUsageCounts,
    onSegmentChange,
    onSegmentDelete,
    onTagsChange,
    onTagSettingChange,
    onTagSettingDelete,
  }: SegmentNodeProps) => {
    const themeColors = useThemeColors();
    const { modal, message } = App.useApp();
    const { segment, diary } = item;

    const handleContentChange = useCallback(
      (content: Descendant[]) => {
        onSegmentChange(segment.id, content);
      },
      [segment.id, onSegmentChange]
    );

    const handleDelete = useCallback(() => {
      modal.confirm({
        title: "删除这一段",
        content: "删除后无法恢复，确定要删除吗？",
        okText: "删除",
        cancelText: "取消",
        okButtonProps: { danger: true },
        onOk: () => {
          onSegmentDelete(segment.id);
          message.success("已删除");
        },
      });
    }, [modal, message, segment.id, onSegmentDelete]);

    const handleTagsChange = useCallback(
      (newTags: string[]) => {
        onTagsChange(segment.id, newTags);
      },
      [segment.id, onTagsChange]
    );

    const menuItems: MenuProps["items"] = [
      {
        key: "delete",
        label: "删除",
        icon: <Trash2 className="h-3.5 w-3.5" />,
        danger: true,
        onClick: handleDelete,
      },
    ];

    // 所属日记的天气/心情（只读显示）
    const weatherStr = diary.weather ? JSON.stringify(diary.weather) : null;
    const moodStr = diary.mood ? JSON.stringify(diary.mood) : null;
    const weatherIconSrc = getIconPath(weatherStr, "weather");
    const moodIconSrc = getIconPath(moodStr, "mood");
    const weatherColor =
      WEATHER_ICONS.find(icon => icon.id === diary.weather?.value)?.color || "#000000";

    // 段创建时间：相对时间显示（朋友圈风格）
    const createdLabel = dayjs(segment.createTime).fromNow();

    // 所属日记的日期标注
    const diaryDate = dayjs(diary.date);
    const diaryDateLabel = diaryDate.format("M月D日");

    return (
      <div className="grid min-w-0 grid-cols-[72px_20px_minmax(0,1fr)] gap-4">
        {/* 左列：段创建时间（相对时间）+ 所属日记日期 */}
        <div className="flex flex-col items-end pt-2 text-right">
          <span
            className={classNames(
              "text-xs font-medium leading-tight",
              themeColors.secondaryTextClass
            )}
          >
            {createdLabel}
          </span>
          <span
            className={classNames(
              "mt-1 text-[11px] leading-tight",
              themeColors.secondaryTextClass,
              "opacity-70"
            )}
          >
            {diaryDateLabel}
          </span>
        </div>

        {/* 中列：竖线 + 圆点 */}
        <div className="relative flex justify-center">
          {!isLast && <span className="absolute bottom-[-1rem] top-3 w-px bg-[var(--th-border)]" />}
          <span
            className="relative z-[1] mt-3 h-2 w-2 shrink-0 rounded-full"
            style={{
              backgroundColor: themeColors.timelineRingColor,
              boxShadow: `0 0 0 3px var(--th-card-bg)`,
            }}
          />
        </div>

        {/* 右列：segment 卡片 */}
        <div className="relative mb-4 min-w-0">
          <div
            className={classNames(
              "min-w-0 rounded-xl border p-4",
              themeColors.cardBorderClass,
              themeColors.inputBgClass
            )}
          >
            {/* 头部：所属日记的天气/心情/字数（左）+ more 菜单（右） */}
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <div
                  className={classNames(
                    "flex items-center gap-2 text-[11px]",
                    themeColors.secondaryTextClass
                  )}
                >
                  {weatherIconSrc && diary.weather && (
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
                    <img src={moodIconSrc} alt="mood" className="h-4 w-4 object-contain" />
                  )}
                  <span className="tabular-nums">{segment.wordCount} 字</span>
                </div>

                {/* 标签与片段绑定：展示 segment 自身标签 */}
                {segment.tags.length > 0 && (
                  <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                    {segment.tags.map(tag => (
                      <span
                        key={tag}
                        className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: hexToRgba(getTagColor(tag, tagSettings), 0.12),
                          color: getTagColor(tag, tagSettings),
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* more 菜单：固定显示在右上角 */}
              <div className="flex flex-shrink-0 items-center gap-1">
                <TagEditor
                  anchorName={`--home-diary-tag-editor-${segment.id}`}
                  tags={segment.tags}
                  tagSettings={tagSettings}
                  tagUsageCounts={tagUsageCounts}
                  onTagsChange={handleTagsChange}
                  onTagSettingChange={onTagSettingChange}
                  onTagSettingDelete={onTagSettingDelete}
                >
                  <button
                    type="button"
                    className={classNames(
                      "flex h-5 w-5 items-center justify-center rounded transition-colors",
                      themeColors.secondaryTextClass,
                      themeColors.hoverClass
                    )}
                    title="编辑标签"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </TagEditor>

                <Dropdown menu={{ items: menuItems }} trigger={["click"]}>
                  <button
                    type="button"
                    className={classNames(
                      "flex h-5 w-5 items-center justify-center rounded transition-colors",
                      themeColors.secondaryTextClass,
                      themeColors.hoverClass
                    )}
                    title="更多"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </Dropdown>
              </div>
            </div>

            {/* 正文：可编辑 */}
            <div className="min-h-16">
              <DiaryContentEditor
                contentId={segment.contentId}
                initialValue={segment.content ?? createEmptyDiaryContent()}
                placeholder="记录这一刻..."
                className="text-sm leading-relaxed"
                onContentChange={handleContentChange}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }
);
SegmentNode.displayName = "SegmentNode";

const DiaryTimelineSection: React.FC<DiaryTimelineSectionProps> = ({
  recentSegments,
  tagSettings,
  tagUsageCounts,
  onCreateSegmentNow,
  onSegmentChange,
  onSegmentDelete,
  onTagsChange,
  onTagSettingChange,
  onTagSettingDelete,
}) => {
  const themeColors = useThemeColors();
  const { createTab } = useTabStore();

  const handleOpenDiary = () => {
    createTab(TabType.DailyNote);
  };

  const handleCreateNow = useCallback(() => {
    void onCreateSegmentNow();
  }, [onCreateSegmentNow]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className={classNames("text-sm font-semibold", themeColors.textClass)}>日记</h2>
          <span className={classNames("text-xs", themeColors.secondaryTextClass)}>
            最近 {recentSegments.length} 条
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenDiary}
            className={classNames(
              "rounded-lg border px-3 py-1.5 text-xs transition-colors",
              themeColors.cardBorderClass,
              themeColors.secondaryTextClass,
              themeColors.hoverClass
            )}
          >
            打开日记
          </button>
          <button
            type="button"
            onClick={handleCreateNow}
            className={classNames(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              themeColors.cardBorderClass,
              themeColors.secondaryTextClass,
              themeColors.hoverClass
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>记录此刻</span>
          </button>
        </div>
      </div>

      {recentSegments.length === 0 ? (
        <div className={classNames("py-8 text-center text-sm", themeColors.secondaryTextClass)}>
          暂无日记
        </div>
      ) : (
        <div className="flex flex-col">
          {recentSegments.map((item, index) => (
            <SegmentNode
              key={item.segment.id}
              item={item}
              isLast={index === recentSegments.length - 1}
              tagSettings={tagSettings}
              tagUsageCounts={tagUsageCounts}
              onSegmentChange={onSegmentChange}
              onSegmentDelete={onSegmentDelete}
              onTagsChange={onTagsChange}
              onTagSettingChange={onTagSettingChange}
              onTagSettingDelete={onTagSettingDelete}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default DiaryTimelineSection;
