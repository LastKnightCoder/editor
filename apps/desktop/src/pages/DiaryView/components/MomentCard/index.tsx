import { memo, useCallback, useState, useRef, useEffect, type CSSProperties } from "react";
import type { Descendant } from "slate";
import classNames from "classnames";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import isoWeek from "dayjs/plugin/isoWeek";
import { MoreHorizontal, Trash2, Plus, X, Palette } from "lucide-react";
import { App, Dropdown } from "antd";
import type { MenuProps } from "antd";
import "dayjs/locale/zh-cn";

import useThemeColors from "@/hooks/useThemeColors";
import type { DiarySegmentItem, DiaryTagSetting } from "@/types/diary";
import { createEmptyDiaryContent } from "@/pages/DiaryView/constants/content";
import { getIconPath } from "@/pages/DiaryView/utils/getIconPath";
import { WEATHER_ICONS } from "@/pages/DiaryView/constants/icons";
import DiaryContentEditor from "@/pages/DiaryView/components/DiaryContentEditor";

dayjs.extend(relativeTime);
dayjs.extend(isoWeek);
dayjs.locale("zh-cn");

const PRESET_COLORS = [
  "#1890ff",
  "#52c41a",
  "#fa8c16",
  "#eb2f96",
  "#722ed1",
  "#13c2c2",
  "#f5222d",
  "#faad14",
  "#2f54eb",
  "#a0d911",
  "#fadb14",
  "#ff7a45",
];

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getTagColor(tag: string, tagSettings: DiaryTagSetting[]): string {
  const setting = tagSettings.find(s => s.name === tag);
  return setting?.color || "#8c8c8c";
}

type AnchorPositionStyle = CSSProperties & {
  anchorName?: string;
  positionAnchor?: string;
};

type PopoverDivElement = HTMLDivElement & {
  showPopover?: () => void;
  hidePopover?: () => void;
};

export interface TagEditorProps {
  anchorName: string;
  tags: string[];
  tagSettings: DiaryTagSetting[];
  tagUsageCounts: Map<string, number>;
  onTagsChange: (tags: string[]) => void;
  onTagSettingChange: (setting: { name: string; color: string; sort?: number }) => void;
  onTagSettingDelete: (name: string) => Promise<void>;
  children: React.ReactNode;
}

export const TagEditor = ({
  anchorName,
  tags,
  tagSettings,
  tagUsageCounts,
  onTagsChange,
  onTagSettingChange,
  onTagSettingDelete,
  children,
}: TagEditorProps) => {
  const themeColors = useThemeColors();
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [editingColorFor, setEditingColorFor] = useState<string | null>(null);
  const [deletingTag, setDeletingTag] = useState<string | null>(null);
  const popoverRef = useRef<PopoverDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;

    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  const handlePopoverToggle = useCallback(() => {
    const nextOpen = popoverRef.current?.matches(":popover-open") ?? false;
    setOpen(nextOpen);
    if (!nextOpen) {
      setEditingColorFor(null);
    }
  }, []);

  const togglePopover = useCallback(() => {
    const popover = popoverRef.current;
    if (!popover) return;

    if (popover.matches(":popover-open")) {
      popover.hidePopover?.();
    } else {
      popover.showPopover?.();
    }
  }, []);

  const closePopover = useCallback(() => {
    popoverRef.current?.hidePopover?.();
    setOpen(false);
    setEditingColorFor(null);
  }, []);

  const handleAddTag = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || tags.includes(trimmed)) {
      setInputValue("");
      return;
    }
    onTagsChange([...tags, trimmed]);
    if (!tagSettings.some(s => s.name === trimmed)) {
      const colorIndex = tagSettings.length % PRESET_COLORS.length;
      onTagSettingChange({
        name: trimmed,
        color: PRESET_COLORS[colorIndex],
      });
    }
    setInputValue("");
    inputRef.current?.focus();
  };

  const handleRemoveTag = (tag: string) => {
    onTagsChange(tags.filter(t => t !== tag));
  };

  const handleDeleteTagSetting = async (tag: string) => {
    setDeletingTag(tag);
    try {
      await onTagSettingDelete(tag);
      if (editingColorFor === tag) {
        setEditingColorFor(null);
      }
    } finally {
      setDeletingTag(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  return (
    <div className="relative">
      <div
        onClick={event => {
          event.stopPropagation();
          togglePopover();
        }}
        style={{ anchorName } as AnchorPositionStyle}
      >
        {children}
      </div>

      <div
        ref={popoverRef}
        popover="auto"
        className="absolute m-0 w-[340px] rounded-xl border p-3 shadow-[0_18px_45px_rgba(15,23,42,0.16)] backdrop:bg-transparent"
        style={
          {
            positionAnchor: anchorName,
            top: "anchor(bottom)",
            left: "anchor(right)",
            right: "auto",
            bottom: "auto",
            marginTop: 8,
            transform: "translateX(-100%)",
            borderColor: "var(--th-border)",
            background: "var(--th-bg-elevated)",
          } as AnchorPositionStyle
        }
        onClick={e => e.stopPropagation()}
        onToggle={handlePopoverToggle}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold" style={{ color: "var(--th-text)" }}>
              编辑标签
            </div>
            <div className="mt-0.5 text-[11px]" style={{ color: "var(--th-text-secondary)" }}>
              增删标签，也可以顺手换个颜色
            </div>
          </div>
          <button
            type="button"
            onClick={closePopover}
            className={classNames(
              "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
              themeColors.hoverClass
            )}
            style={{ color: "var(--th-text-secondary)" }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {tags.length > 0 ? (
          <div className="mb-3 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto pr-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-black/20 [&::-webkit-scrollbar]:w-1.5">
            {tags.map(tag => (
              <div
                key={tag}
                className="group/tag flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium"
                style={{
                  backgroundColor: hexToRgba(getTagColor(tag, tagSettings), 0.12),
                  color: getTagColor(tag, tagSettings),
                  border: `1px solid ${hexToRgba(getTagColor(tag, tagSettings), 0.3)}`,
                }}
              >
                <button
                  type="button"
                  className="transition-opacity"
                  onClick={() => setEditingColorFor(editingColorFor === tag ? null : tag)}
                  title="修改颜色"
                >
                  <Palette className="h-3 w-3 opacity-60 group-hover/tag:opacity-100" />
                </button>
                <span className="max-w-32 truncate">{tag}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="opacity-60 transition-opacity hover:opacity-100"
                  title="移除标签"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div
            className="mb-3 rounded-lg border border-dashed px-3 py-2 text-xs"
            style={{
              borderColor: "var(--th-border)",
              color: "var(--th-text-secondary)",
            }}
          >
            这条记录还没有标签
          </div>
        )}

        {editingColorFor && (
          <div className="mb-3 rounded-lg p-2" style={{ background: "var(--th-bg-hover)" }}>
            <div className="mb-2 text-[11px]" style={{ color: "var(--th-text-secondary)" }}>
              {editingColorFor} 的颜色
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  className="h-5 w-5 rounded-full transition-transform hover:scale-110 active:scale-95"
                  style={{
                    backgroundColor: color,
                    border:
                      getTagColor(editingColorFor, tagSettings) === color
                        ? "2px solid var(--th-text)"
                        : "2px solid transparent",
                  }}
                  onClick={() => {
                    onTagSettingChange({ name: editingColorFor, color });
                    setEditingColorFor(null);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="新标签名..."
            className="h-8 min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 text-xs text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
          />
          <button
            type="button"
            onClick={handleAddTag}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white transition-all hover:brightness-105 active:scale-[0.98]"
            style={{ background: themeColors.accentColor }}
            title="添加标签"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {tagSettings.length > 0 && (
          <>
            <div className="my-3 h-px" style={{ background: "var(--th-border)" }} />
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: "var(--th-text)" }}>
                标签库
              </span>
              <span className="text-[11px]" style={{ color: "var(--th-text-secondary)" }}>
                未使用的可以直接清理
              </span>
            </div>
            <div className="max-h-40 overflow-y-auto pr-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-black/20 [&::-webkit-scrollbar]:w-1.5">
              {tagSettings.map(setting => {
                const usageCount = tagUsageCounts.get(setting.name) ?? 0;
                const canDelete = usageCount === 0;
                return (
                  <div
                    key={setting.name}
                    className={classNames(
                      "flex h-8 items-center gap-2 rounded-lg px-2 text-xs",
                      canDelete && themeColors.hoverClass
                    )}
                    style={{ color: "var(--th-text)" }}
                  >
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      style={{ background: setting.color }}
                    />
                    <span className="min-w-0 flex-1 truncate">{setting.name}</span>
                    <span
                      className="flex-shrink-0 text-[11px]"
                      style={{ color: "var(--th-text-secondary)" }}
                    >
                      {usageCount > 0 ? `${usageCount} 条` : "未使用"}
                    </span>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDeleteTagSetting(setting.name)}
                        disabled={deletingTag === setting.name}
                        className="flex h-6 items-center gap-1 rounded-md px-2 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                        style={{
                          color: "var(--th-danger-text, #dc2626)",
                          background: "var(--th-danger-bg, transparent)",
                        }}
                        title="清理未使用标签"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>{deletingTag === setting.name ? "清理中" : "清理"}</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

interface MomentCardProps {
  item: DiarySegmentItem;
  isLast: boolean;
  isActive?: boolean;
  tagSettings: DiaryTagSetting[];
  tagUsageCounts: Map<string, number>;
  onSegmentChange: (segmentId: number, content: Descendant[]) => Promise<void>;
  onSegmentDelete: (segmentId: number) => Promise<void>;
  /** 标签与片段绑定：回调传 segmentId（勿改成 entryId，会整天共享标签） */
  onTagsChange: (segmentId: number, tags: string[]) => Promise<void>;
  onTagSettingChange: (setting: { name: string; color: string; sort?: number }) => Promise<void>;
  onTagSettingDelete: (name: string) => Promise<void>;
}

const MomentCard = memo(
  ({
    item,
    isLast,
    isActive = false,
    tagSettings,
    tagUsageCounts,
    onSegmentChange,
    onSegmentDelete,
    onTagsChange,
    onTagSettingChange,
    onTagSettingDelete,
  }: MomentCardProps) => {
    const themeColors = useThemeColors();
    const { modal, message } = App.useApp();

    const handleContentChange = useCallback(
      (content: Descendant[]) => {
        onSegmentChange(item.id, content);
      },
      [item.id, onSegmentChange]
    );

    const handleDelete = useCallback(() => {
      modal.confirm({
        title: "删除这条记录",
        content: "删除后无法恢复，确定要删除吗？",
        okText: "删除",
        cancelText: "取消",
        okButtonProps: { danger: true },
        onOk: () => {
          onSegmentDelete(item.id);
          message.success("已删除");
        },
      });
    }, [modal, message, item.id, onSegmentDelete]);

    const menuItems: MenuProps["items"] = [
      {
        key: "delete",
        label: "删除",
        icon: <Trash2 className="h-3.5 w-3.5" />,
        danger: true,
        onClick: handleDelete,
      },
    ];

    const normalizedEntryDate = (() => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(item.entryDate)) return item.entryDate;
      const monthMatch = item.entryDate.match(/^(\d{4})-(\d{2})$/);
      if (monthMatch) return `${monthMatch[1]}-${monthMatch[2]}-01`;
      const weekMatch = item.entryDate.match(/^(\d{4})-W(\d{2})$/);
      if (weekMatch) {
        return dayjs(`${weekMatch[1]}-01-04`)
          .isoWeek(Number(weekMatch[2]))
          .startOf("isoWeek")
          .format("YYYY-MM-DD");
      }
      return "";
    })();
    const entryDate = normalizedEntryDate ? dayjs(normalizedEntryDate) : dayjs(item.createTime);
    const createdLabel = dayjs(item.createTime).fromNow();
    const dateLabel = entryDate.isValid()
      ? entryDate.format("M月D日")
      : dayjs(item.createTime).format("M月D日");

    const weatherStr = item.weather ? JSON.stringify(item.weather) : null;
    const moodStr = item.mood ? JSON.stringify(item.mood) : null;
    const weatherIconSrc = getIconPath(weatherStr, "weather");
    const moodIconSrc = getIconPath(moodStr, "mood");
    const weatherColor =
      WEATHER_ICONS.find(icon => icon.id === item.weather?.value)?.color || "#000000";

    const handleTagsChange = useCallback(
      (newTags: string[]) => {
        onTagsChange(item.id, newTags);
      },
      [item.id, onTagsChange]
    );

    return (
      <div className="grid min-w-0 grid-cols-[72px_20px_minmax(0,1fr)] gap-4">
        {/* 左列：相对时间 + 日期 */}
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
              "mt-1 text-[11px] leading-tight opacity-70",
              themeColors.secondaryTextClass
            )}
          >
            {dateLabel}
          </span>
        </div>

        {/* 中列：竖线 + 圆点 */}
        <div className="relative flex justify-center">
          {!isLast && <span className="absolute bottom-[-1rem] top-3 w-px bg-[var(--th-border)]" />}
          <span
            className="relative z-[1] mt-3 h-2 w-2 shrink-0 rounded-full"
            style={{
              backgroundColor: themeColors.timelineRingColor,
              boxShadow: "0 0 0 3px var(--th-card-bg)",
            }}
          />
        </div>

        {/* 右列：卡片 */}
        <div className="relative mb-4 min-w-0">
          <div
            className={classNames(
              "min-w-0 rounded-xl border p-4 transition-[border-color,box-shadow,background-color]",
              isActive ? "shadow-[0_0_0_3px_rgba(99,102,241,0.18)]" : null,
              !isActive && themeColors.cardBorderClass,
              themeColors.cardBgClass
            )}
            style={
              isActive
                ? {
                    borderColor: "var(--th-primary)",
                  }
                : undefined
            }
          >
            {/* 头部：天气/心情/字数 + 标签 + more 菜单 */}
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <div
                  className={classNames(
                    "flex items-center gap-2 text-[11px]",
                    themeColors.secondaryTextClass
                  )}
                >
                  {weatherIconSrc && item.weather && (
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
                  <span className="tabular-nums">{item.wordCount} 字</span>
                </div>

                {/* 标签 chips */}
                {item.tags.length > 0 && (
                  <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                    {item.tags.map(tag => (
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

              <div className="flex flex-shrink-0 items-center gap-1">
                <TagEditor
                  anchorName={`--diary-tag-editor-${item.id}`}
                  tags={item.tags}
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

            {/* 正文 */}
            <div className="min-h-16">
              <DiaryContentEditor
                contentId={item.contentId}
                initialValue={item.content ?? createEmptyDiaryContent()}
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

MomentCard.displayName = "MomentCard";
export default MomentCard;
