import { memo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import classNames from "classnames";
import type { IResource } from "@/types";
import LocalImage from "@/components/LocalImage";
import useThemeColors from "@/hooks/useThemeColors";
import { getResourceTypeConfig } from "../constants";
import type { ResourceGroup } from "@/types";

interface ResourceListViewProps {
  resources: IResource[];
  groups: ResourceGroup[];
  selectedIds: Set<number>;
  activeId: number | null;
  onClick: (resource: IResource, e: React.MouseEvent) => void;
  onDoubleClick: (resource: IResource) => void;
  onContextMenu: (resource: IResource, e: React.MouseEvent) => void;
}

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  const pad = (n: number) => String(n).padStart(2, "0");
  if (sameYear) return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const ROW_HEIGHT = 52;

const ResourceListView = memo(
  ({
    resources,
    groups,
    selectedIds,
    activeId,
    onClick,
    onDoubleClick,
    onContextMenu,
  }: ResourceListViewProps) => {
    const themeColors = useThemeColors();
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const virtualizer = useVirtualizer({
      count: resources.length,
      getScrollElement: () => scrollContainerRef.current,
      estimateSize: () => ROW_HEIGHT,
      overscan: 8,
    });

    const groupNameById = new Map(groups.map((g) => [g.id, g.name]));

    return (
      <div className="h-full flex flex-col">
        {/* 表头 */}
        <div
          className={classNames(
            "shrink-0 flex items-center gap-3 px-4 h-9 text-xs border-b",
            themeColors.secondaryTextClass,
            themeColors.borderClass,
          )}
        >
          <span className="w-5 shrink-0" />
          <span className="w-10 shrink-0" />
          <span className="flex-1 min-w-0">名称</span>
          <span className="w-16 shrink-0">类型</span>
          <span className="w-28 shrink-0 truncate">分组</span>
          <span className="w-16 shrink-0 text-right">引用</span>
          <span className="w-20 shrink-0 text-right">更新时间</span>
        </div>

        {/* 虚拟化行 */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const resource = resources[virtualRow.index];
              const typeConfig = getResourceTypeConfig(resource.type);
              const TypeIcon = typeConfig.icon;
              const selected = selectedIds.has(resource.id);
              const active = activeId === resource.id;

              return (
                <div
                  key={resource.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className={classNames(
                    "flex items-center gap-3 px-4 cursor-pointer border-b transition-colors",
                    themeColors.divideClass,
                    selected
                      ? "bg-[var(--th-accent-soft)]"
                      : classNames(
                          themeColors.hoverClass,
                          active && "bg-[var(--th-bg-hover)]",
                        ),
                  )}
                  onClick={(e) => onClick(resource, e)}
                  onDoubleClick={() => onDoubleClick(resource)}
                  onContextMenu={(e) => onContextMenu(resource, e)}
                >
                  {/* 复选框 */}
                  <span
                    className={classNames(
                      "w-4 h-4 shrink-0 rounded border flex items-center justify-center",
                      selected
                        ? "bg-[var(--th-accent)] border-transparent"
                        : themeColors.borderClass,
                    )}
                  >
                    {selected && (
                      <svg
                        className="w-3 h-3 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3.5}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </span>

                  {/* 缩略图 */}
                  <span className="w-10 h-10 shrink-0 rounded-lg overflow-hidden flex items-center justify-center">
                    {resource.type === "image" ? (
                      <LocalImage
                        url={resource.path}
                        alt={resource.name}
                        className="w-full h-full object-cover"
                      />
                    ) : resource.type === "video" ? (
                      <span
                        className={classNames(
                          "w-full h-full bg-linear-to-br flex items-center justify-center",
                          typeConfig.tileClass,
                        )}
                      >
                        <TypeIcon size={16} className="text-white/90" />
                      </span>
                    ) : (
                      <span
                        className={classNames(
                          "w-full h-full flex items-center justify-center",
                          themeColors.tagBgClass,
                        )}
                      >
                        <TypeIcon
                          size={16}
                          className={themeColors.secondaryTextClass}
                        />
                      </span>
                    )}
                  </span>

                  {/* 名称 */}
                  <span
                    className={classNames(
                      "flex-1 min-w-0 truncate text-sm font-medium",
                      themeColors.textClass,
                    )}
                    title={resource.name}
                  >
                    {resource.name}
                  </span>

                  {/* 类型 */}
                  <span
                    className={classNames(
                      "w-16 shrink-0 inline-flex items-center gap-1 text-xs",
                      themeColors.secondaryTextClass,
                    )}
                  >
                    <TypeIcon size={12} />
                    {typeConfig.label}
                  </span>

                  {/* 分组 */}
                  <span
                    className={classNames(
                      "w-28 shrink-0 truncate text-xs",
                      themeColors.secondaryTextClass,
                    )}
                  >
                    {resource.groupId
                      ? (groupNameById.get(resource.groupId) ?? "-")
                      : "未分组"}
                  </span>

                  {/* 引用 */}
                  <span
                    className={classNames(
                      "w-16 shrink-0 text-right text-xs",
                      themeColors.secondaryTextClass,
                    )}
                  >
                    {resource.refCount > 0 ? resource.refCount : "-"}
                  </span>

                  {/* 时间 */}
                  <span
                    className={classNames(
                      "w-20 shrink-0 text-right text-xs tabular-nums",
                      themeColors.secondaryTextClass,
                    )}
                  >
                    {formatTime(resource.updateTime)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  },
);

export default ResourceListView;
