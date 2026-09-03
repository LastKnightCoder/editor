import { memo } from "react";
import { Dropdown, App } from "antd";
import type { MenuProps } from "antd";
import {
  Search,
  RefreshCw,
  Upload,
  LayoutGrid,
  List,
  ArrowDownUp,
} from "lucide-react";
import classNames from "classnames";
import { useShallow } from "zustand/react/shallow";
import useResourceStore from "@/stores/useResourceStore";
import useThemeColors from "@/hooks/useThemeColors";
import { RESOURCE_SORT_OPTIONS } from "../constants";
import type { ResourceSortBy } from "../constants";

interface ResourceToolbarProps {
  title: string;
  count: number;
  onUpload: () => void;
  onRefresh: () => void;
  refreshing?: boolean;
}

const ResourceToolbar = memo(
  ({ title, count, onUpload, onRefresh, refreshing }: ResourceToolbarProps) => {
    const { modal } = App.useApp();
    const themeColors = useThemeColors();

    const {
      searchKeyword,
      setSearchKeyword,
      viewMode,
      setViewMode,
      sortBy,
      sortOrder,
      setSortBy,
      setSortOrder,
    } = useResourceStore(
      useShallow((state) => ({
        searchKeyword: state.searchKeyword,
        setSearchKeyword: state.setSearchKeyword,
        viewMode: state.viewMode,
        setViewMode: state.setViewMode,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
        setSortBy: state.setSortBy,
        setSortOrder: state.setSortOrder,
      })),
    );

    const sortMenuItems: MenuProps["items"] = [
      ...RESOURCE_SORT_OPTIONS.map((option) => ({
        key: option.value,
        label: option.label,
        onClick: () => {
          setSortBy(option.value as ResourceSortBy);
        },
      })),
      { type: "divider" },
      {
        key: "desc",
        label: "降序",
        onClick: () => setSortOrder("desc"),
      },
      {
        key: "asc",
        label: "升序",
        onClick: () => setSortOrder("asc"),
      },
    ];

    const iconButtonClass = classNames(
      "w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer",
      themeColors.hoverClass,
      themeColors.secondaryTextClass,
      themeColors.hoverTextClass,
    );

    return (
      <div
        className={classNames(
          "h-14 shrink-0 flex items-center gap-3 px-4 border-b",
          themeColors.borderClass,
          "bg-[var(--th-card-bg)]",
        )}
      >
        {/* 当前分类与数量 */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <h2
            className={classNames(
              "text-base font-semibold truncate",
              themeColors.textClass,
            )}
          >
            {title}
          </h2>
          <span
            className={classNames(
              "text-xs px-1.5 py-0.5 rounded-md",
              themeColors.tagBgClass,
              themeColors.secondaryTextClass,
            )}
          >
            {count}
          </span>
        </div>

        {/* 搜索 */}
        <div className="relative flex-1 max-w-md ml-2">
          <Search
            size={14}
            className={classNames(
              "absolute left-3 top-1/2 -translate-y-1/2",
              themeColors.secondaryTextClass,
            )}
          />
          <input
            placeholder="搜索资源..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className={classNames(
              "w-full h-8 pl-9 pr-8 rounded-lg text-sm outline-none transition-all",
              themeColors.inputBgClass,
              "border",
              themeColors.borderClass,
              themeColors.textClass,
              "focus:border-[var(--th-border-focus)] focus:[box-shadow:var(--th-focus-ring)]",
            )}
          />
          {searchKeyword && (
            <button
              onClick={() => setSearchKeyword("")}
              className={classNames(
                "absolute right-2 top-1/2 -translate-y-1/2 text-xs cursor-pointer",
                themeColors.secondaryTextClass,
                themeColors.hoverTextClass,
              )}
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex-1" />

        {/* 排序 */}
        <Dropdown
          menu={{ items: sortMenuItems, selectedKeys: [sortBy, sortOrder] }}
          trigger={["click"]}
        >
          <button
            className={classNames(
              "w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer",
              themeColors.hoverClass,
              sortBy === "updateTime" && sortOrder === "desc"
                ? classNames(
                    themeColors.secondaryTextClass,
                    themeColors.hoverTextClass,
                  )
                : themeColors.activeTextClass,
            )}
            title="排序"
            onClick={(e) => e.preventDefault()}
          >
            <ArrowDownUp size={15} />
          </button>
        </Dropdown>

        {/* 视图切换:选中项用主题色实色 */}
        <div
          className={classNames(
            "flex items-center rounded-lg border p-0.5",
            themeColors.borderClass,
            themeColors.cardBgClass,
          )}
        >
          {(
            [
              ["grid", LayoutGrid, "网格视图"],
              ["list", List, "列表视图"],
            ] as const
          ).map(([mode, Icon, tip]) => (
            <button
              key={mode}
              title={tip}
              onClick={() => setViewMode(mode)}
              className={classNames(
                "w-7 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer",
                viewMode === mode
                  ? "bg-[var(--th-accent)] text-[var(--th-btn-text)]"
                  : classNames(
                      themeColors.secondaryTextClass,
                      themeColors.hoverClass,
                      themeColors.hoverTextClass,
                    ),
              )}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>

        {/* 上传 */}
        <button
          onClick={onUpload}
          className={classNames(
            "h-8 px-3 rounded-lg flex items-center gap-1.5 text-sm transition-colors cursor-pointer",
            themeColors.primaryButtonClass,
          )}
        >
          <Upload size={14} />
          上传
        </button>

        {/* 刷新 */}
        <button
          className={classNames(iconButtonClass, refreshing && "animate-spin")}
          title="重新扫描资源"
          onClick={() =>
            modal.confirm({
              title: "重新扫描资源?",
              content: "将扫描所有文档、白板、播客、聊天中的资源引用",
              okText: "开始扫描",
              cancelText: "取消",
              onOk: onRefresh,
            })
          }
        >
          <RefreshCw size={15} />
        </button>
      </div>
    );
  },
);

export default ResourceToolbar;
