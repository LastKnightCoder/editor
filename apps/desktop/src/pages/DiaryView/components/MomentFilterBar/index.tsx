import { memo, useState, useRef, useCallback, useEffect } from "react";
import classNames from "classnames";
import dayjs from "dayjs";
import {
  Search,
  X,
  Calendar,
  ChevronDown,
  Check,
  Tags,
  Plus,
} from "lucide-react";
import useThemeColors from "@/hooks/useThemeColors";
import useSettingStore from "@/stores/useSettingStore";
import type { DiaryTagSetting } from "@/types/diary";
import DatePicker from "@/components/DatePicker";

function colorWithAlpha(color: string, alpha: number): string {
  if (color.startsWith("#")) {
    const normalized =
      color.length === 4
        ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
        : color;
    const r = parseInt(normalized.slice(1, 3), 16);
    const g = parseInt(normalized.slice(3, 5), 16);
    const b = parseInt(normalized.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (color.startsWith("rgb(")) {
    return color.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
  }
  if (color.startsWith("hsl(")) {
    return color.replace("hsl(", "hsla(").replace(")", `, ${alpha})`);
  }
  return color;
}

const DATE_PRESETS = [
  {
    label: "今天",
    getRange: () => {
      const start = dayjs().startOf("day").valueOf();
      const end = dayjs().endOf("day").valueOf();
      return [start, end] as [number, number];
    },
  },
  {
    label: "近 7 天",
    getRange: () => {
      const end = dayjs().endOf("day").valueOf();
      const start = dayjs().subtract(6, "day").startOf("day").valueOf();
      return [start, end] as [number, number];
    },
  },
  {
    label: "近 30 天",
    getRange: () => {
      const end = dayjs().endOf("day").valueOf();
      const start = dayjs().subtract(29, "day").startOf("day").valueOf();
      return [start, end] as [number, number];
    },
  },
  {
    label: "本月",
    getRange: () => {
      const start = dayjs().startOf("month").valueOf();
      const end = dayjs().endOf("month").valueOf();
      return [start, end] as [number, number];
    },
  },
  {
    label: "今年",
    getRange: () => {
      const start = dayjs().startOf("year").valueOf();
      const end = dayjs().endOf("year").valueOf();
      return [start, end] as [number, number];
    },
  },
];

function formatDateRange(range: [number, number] | null): string {
  if (!range) return "全部时间";
  const [start, end] = range;
  const startStr = dayjs(start).format("M.D");
  const endStr = dayjs(end).format("M.D");
  if (startStr === endStr) return startStr;
  return `${startStr} - ${endStr}`;
}

function findPresetLabel(range: [number, number] | null): string | null {
  if (!range) return null;
  for (const preset of DATE_PRESETS) {
    const [ps, pe] = preset.getRange();
    if (ps === range[0] && pe === range[1]) return preset.label;
  }
  return null;
}

interface MomentFilterBarProps {
  tagSettings: DiaryTagSetting[];
  activeTagFilter: string[];
  activeDateRange: [number, number] | null;
  searchQuery: string;
  onTagFilterChange: (tags: string[]) => void;
  onDateRangeChange: (range: [number, number] | null) => void;
  onSearchQueryChange: (query: string) => void;
  onCreateMoment: () => void;
}

const MomentFilterBar = memo(
  ({
    tagSettings,
    activeTagFilter,
    activeDateRange,
    searchQuery,
    onTagFilterChange,
    onDateRangeChange,
    onSearchQueryChange,
    onCreateMoment,
  }: MomentFilterBarProps) => {
    const themeColors = useThemeColors();
    const isDarkMode = useSettingStore((state) => state.setting.darkMode);
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");
    const [openDropdown, setOpenDropdown] = useState<"date" | "tag" | null>(
      null,
    );
    const searchInputRef = useRef<HTMLInputElement>(null);
    const toolbarRef = useRef<HTMLDivElement>(null);

    const presetLabel = findPresetLabel(activeDateRange);
    const dateLabel = presetLabel || formatDateRange(activeDateRange);
    const hasDateFilter = activeDateRange !== null;

    const hasTagFilter = activeTagFilter.length > 0;
    const hasSearch = searchQuery.trim().length > 0;
    const hasAnyFilter = hasDateFilter || hasTagFilter || hasSearch;
    const accentColor = themeColors.accentColor || "#1890ff";

    useEffect(() => {
      const handlePointerDown = (event: PointerEvent) => {
        if (
          toolbarRef.current &&
          !toolbarRef.current.contains(event.target as Node)
        ) {
          setOpenDropdown(null);
        }
      };

      document.addEventListener("pointerdown", handlePointerDown);
      return () => {
        document.removeEventListener("pointerdown", handlePointerDown);
      };
    }, []);

    useEffect(() => {
      if (!activeDateRange) {
        setCustomStart("");
        setCustomEnd("");
        return;
      }
      setCustomStart(dayjs(activeDateRange[0]).format("YYYY-MM-DD"));
      setCustomEnd(dayjs(activeDateRange[1]).format("YYYY-MM-DD"));
    }, [activeDateRange]);

    const handlePresetClick = useCallback(
      (getRange: () => [number, number]) => {
        onDateRangeChange(getRange());
        setOpenDropdown(null);
      },
      [onDateRangeChange],
    );

    const handleClearDateRange = useCallback(() => {
      onDateRangeChange(null);
      setCustomStart("");
      setCustomEnd("");
      setOpenDropdown(null);
    }, [onDateRangeChange]);

    const handleCustomDateApply = useCallback(() => {
      if (!customStart && !customEnd) {
        handleClearDateRange();
        return;
      }
      const start = customStart
        ? dayjs(customStart).startOf("day").valueOf()
        : dayjs().subtract(10, "year").valueOf();
      const end = customEnd
        ? dayjs(customEnd).endOf("day").valueOf()
        : dayjs().endOf("day").valueOf();
      onDateRangeChange([start, end]);
      setOpenDropdown(null);
    }, [customStart, customEnd, onDateRangeChange, handleClearDateRange]);

    const handleTagToggle = useCallback(
      (tag: string) => {
        if (activeTagFilter.includes(tag)) {
          onTagFilterChange(activeTagFilter.filter((t) => t !== tag));
        } else {
          onTagFilterChange([...activeTagFilter, tag]);
        }
      },
      [activeTagFilter, onTagFilterChange],
    );

    const handleClearAll = useCallback(() => {
      onTagFilterChange([]);
      onDateRangeChange(null);
      onSearchQueryChange("");
      setCustomStart("");
      setCustomEnd("");
    }, [onTagFilterChange, onDateRangeChange, onSearchQueryChange]);

    const handleSearchClear = useCallback(() => {
      onSearchQueryChange("");
      searchInputRef.current?.focus();
    }, [onSearchQueryChange]);

    const dateDropdownContent = (
      <div
        className="absolute left-0 top-[calc(100%+10px)] z-30 w-[360px] rounded-xl border p-3 shadow-[0_18px_45px_rgba(15,23,42,0.16)]"
        style={{
          borderColor: "var(--th-card-border)",
          background: "var(--th-modal)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div
              className="text-sm font-semibold"
              style={{ color: "var(--th-text)" }}
            >
              时间筛选
            </div>
            <div
              className="mt-0.5 text-[11px]"
              style={{ color: "var(--th-text-secondary)" }}
            >
              选择一段真正有用的回忆范围
            </div>
          </div>
          {hasDateFilter && (
            <button
              type="button"
              onClick={handleClearDateRange}
              className={classNames(
                "rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                themeColors.hoverClass,
              )}
              style={{ color: "var(--th-text-secondary)" }}
            >
              清除
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {DATE_PRESETS.map((preset) => {
            const isActive = presetLabel === preset.label;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => handlePresetClick(preset.getRange)}
                className="flex h-9 items-center justify-center rounded-lg border text-xs font-medium transition-all active:scale-[0.98]"
                style={{
                  borderColor: isActive
                    ? themeColors.accentColor
                    : "var(--th-card-border)",
                  background: isActive
                    ? colorWithAlpha(themeColors.accentColor || "#1890ff", 0.12)
                    : isDarkMode
                      ? "rgba(255, 255, 255, 0.06)"
                      : "var(--th-input-bg)",
                  color: isActive ? themeColors.accentColor : "var(--th-text)",
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <div
          className="my-3 h-px"
          style={{ background: "var(--th-card-border)" }}
        />

        <div
          className="mb-2 text-[11px] font-medium"
          style={{ color: "var(--th-text-secondary)" }}
        >
          自定义范围
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <DatePicker
            value={customStart}
            placeholder="选择开始日期"
            accentColor={accentColor}
            onChange={setCustomStart}
          />
          <span
            className="text-xs"
            style={{ color: "var(--th-text-secondary)" }}
          >
            至
          </span>
          <DatePicker
            value={customEnd}
            placeholder="选择结束日期"
            accentColor={accentColor}
            onChange={setCustomEnd}
          />
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={handleCustomDateApply}
            className="rounded-lg px-4 py-2 text-xs font-semibold transition-all active:scale-[0.98]"
            style={{
              background: themeColors.accentColor || "#1890ff",
              color: "#ffffff",
            }}
          >
            应用
          </button>
        </div>
      </div>
    );

    const tagDropdownContent = (
      <div
        className="absolute left-0 top-[calc(100%+10px)] z-30 w-[280px] rounded-xl border p-2 shadow-[0_18px_45px_rgba(15,23,42,0.16)]"
        style={{
          borderColor: "var(--th-card-border)",
          background: "var(--th-modal)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-2 pb-2 pt-1">
          <span
            className="text-xs font-semibold"
            style={{ color: "var(--th-text)" }}
          >
            按标签筛选
          </span>
          {hasTagFilter && (
            <button
              type="button"
              onClick={() => onTagFilterChange([])}
              className={classNames(
                "rounded-md px-2 py-1 text-[11px] transition-colors",
                themeColors.hoverClass,
              )}
              style={{ color: "var(--th-text-secondary)" }}
            >
              清空
            </button>
          )}
        </div>
        <div className="max-h-[280px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-black/20">
          {tagSettings.map((setting) => {
            const isActive = activeTagFilter.includes(setting.name);
            return (
              <button
                key={setting.name}
                type="button"
                onClick={() => handleTagToggle(setting.name)}
                className={classNames(
                  "flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs transition-colors",
                  themeColors.hoverClass,
                )}
                style={{ color: "var(--th-text)" }}
              >
                <span
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{ background: setting.color }}
                />
                <span className="min-w-0 flex-1 truncate">{setting.name}</span>
                <span
                  className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border"
                  style={{
                    borderColor: isActive
                      ? themeColors.accentColor
                      : "var(--th-card-border)",
                    background: isActive
                      ? themeColors.accentColor
                      : "transparent",
                  }}
                >
                  {isActive && <Check className="h-3 w-3 text-white" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );

    return (
      <div
        ref={toolbarRef}
        className={classNames(
          "sticky top-0 z-20 border-b",
          themeColors.cardBorderClass,
        )}
        style={{
          background: "transparent",
        }}
      >
        {/* 版心容器：与下方内容区同宽（max-w-[800px]），避免顶部满栏两端分布 */}
        <div className="mx-auto flex max-w-[800px] items-center gap-3 px-6 py-3">
          {/* 搜索框 */}
          <div
            className="relative flex h-8 w-56 items-center rounded-full border px-3 transition-colors"
            style={{
              borderColor: hasSearch
                ? themeColors.accentColor
                : isDarkMode
                  ? "rgba(255, 255, 255, 0.12)"
                  : "var(--th-card-border)",
              background: isDarkMode
                ? "rgba(255, 255, 255, 0.06)"
                : "var(--th-input-bg)",
            }}
          >
            <Search
              className="mr-2 h-3.5 w-3.5 flex-shrink-0"
              style={{ color: "var(--th-text-secondary)" }}
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="搜索日记..."
              className="min-w-0 flex-1 bg-transparent text-xs outline-none"
              style={{ color: "var(--th-text)" }}
            />
            {hasSearch && (
              <button
                type="button"
                onClick={handleSearchClear}
                className="ml-1 flex-shrink-0 rounded-full p-0.5 transition-colors"
                style={{ color: "var(--th-text-secondary)" }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() =>
                setOpenDropdown(openDropdown === "date" ? null : "date")
              }
              className={classNames(
                "flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-all active:scale-[0.98]",
                hasDateFilter ? "" : themeColors.hoverClass,
              )}
              style={{
                borderColor: hasDateFilter
                  ? themeColors.accentColor
                  : "var(--th-card-border)",
                background: hasDateFilter
                  ? colorWithAlpha(themeColors.accentColor || "#1890ff", 0.1)
                  : "transparent",
                color: hasDateFilter
                  ? themeColors.accentColor
                  : "var(--th-text-secondary)",
              }}
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>{dateLabel}</span>
              <ChevronDown
                className={classNames(
                  "h-3.5 w-3.5 transition-transform",
                  openDropdown === "date" && "rotate-180",
                )}
              />
            </button>
            {openDropdown === "date" && dateDropdownContent}
          </div>

          {tagSettings.length > 0 && (
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() =>
                  setOpenDropdown(openDropdown === "tag" ? null : "tag")
                }
                className={classNames(
                  "flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-all active:scale-[0.98]",
                  hasTagFilter ? "" : themeColors.hoverClass,
                )}
                style={{
                  borderColor: hasTagFilter
                    ? themeColors.accentColor
                    : "var(--th-card-border)",
                  background: hasTagFilter
                    ? colorWithAlpha(themeColors.accentColor || "#1890ff", 0.1)
                    : "transparent",
                  color: hasTagFilter
                    ? themeColors.accentColor
                    : "var(--th-text-secondary)",
                }}
              >
                <Tags className="h-3.5 w-3.5" />
                <span>
                  {hasTagFilter ? `标签 ${activeTagFilter.length}` : "标签"}
                </span>
                <ChevronDown
                  className={classNames(
                    "h-3.5 w-3.5 transition-transform",
                    openDropdown === "tag" && "rotate-180",
                  )}
                />
              </button>
              {openDropdown === "tag" && tagDropdownContent}
            </div>
          )}

          {/* 清除全部筛选 */}
          {hasAnyFilter && (
            <button
              type="button"
              onClick={handleClearAll}
              className={classNames(
                "flex h-8 flex-shrink-0 items-center gap-1 rounded-full px-3 text-xs transition-colors",
                themeColors.hoverClass,
              )}
              style={{ color: "var(--th-text-secondary)" }}
            >
              <X className="h-3 w-3" />
              <span>清除筛选</span>
            </button>
          )}

          <div className="min-w-0 flex-1" />

          <button
            type="button"
            onClick={onCreateMoment}
            className={classNames(
              "flex h-8 flex-shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-all active:scale-[0.98]",
              themeColors.hoverClass,
            )}
            style={{
              borderColor: colorWithAlpha(accentColor, 0.5),
              background: "transparent",
              color: accentColor,
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>记录此刻</span>
          </button>
        </div>
      </div>
    );
  },
);

MomentFilterBar.displayName = "MomentFilterBar";
export default MomentFilterBar;
