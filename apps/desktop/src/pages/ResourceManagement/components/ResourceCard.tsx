import { memo, useRef, useState } from "react";
import { Play } from "lucide-react";
import classNames from "classnames";
import type { IResource } from "@/types";
import LocalImage from "@/components/LocalImage";
import LocalVideo from "@/components/LocalVideo";
import useThemeColors from "@/hooks/useThemeColors";
import { getResourceTypeConfig } from "../constants";

interface ResourceCardProps {
  resource: IResource;
  selected: boolean;
  active: boolean;
  onClick: (resource: IResource, e: React.MouseEvent) => void;
  onDoubleClick: (resource: IResource) => void;
  onContextMenu: (resource: IResource, e: React.MouseEvent) => void;
  onMoreClick: (resource: IResource, e: React.MouseEvent) => void;
}

const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds)) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

const ResourceCard = memo(
  ({
    resource,
    selected,
    active,
    onClick,
    onDoubleClick,
    onContextMenu,
    onMoreClick,
  }: ResourceCardProps) => {
    const themeColors = useThemeColors();
    const typeConfig = getResourceTypeConfig(resource.type);
    const TypeIcon = typeConfig.icon;

    const isImage = resource.type === "image";
    const isVideo = resource.type === "video";
    const [duration, setDuration] = useState<number | null>(null);
    const metadataVideoRef = useRef<HTMLVideoElement>(null);

    return (
      <div
        className={classNames(
          "group relative rounded-xl border overflow-hidden cursor-pointer transition-all",
          themeColors.cardBgClass,
          selected
            ? "border-[var(--th-border-focus)] shadow-[var(--th-shadow-md)]"
            : classNames(
                "hover:shadow-[var(--th-shadow-md)]",
                themeColors.borderClass,
                active && "border-[var(--th-border-focus)]",
              ),
        )}
        onClick={(e) => onClick(resource, e)}
        onDoubleClick={() => onDoubleClick(resource)}
        onContextMenu={(e) => onContextMenu(resource, e)}
      >
        {/* 多选复选标记 */}
        <div
          className={classNames(
            "absolute top-2 left-2 z-10 w-5 h-5 rounded-md border flex items-center justify-center transition-all",
            selected
              ? "bg-[var(--th-accent)] border-transparent"
              : classNames(
                  "bg-[var(--th-glass)] backdrop-blur-sm border-[var(--th-border)]",
                  "opacity-0 group-hover:opacity-100",
                ),
          )}
        >
          {selected && (
            <svg
              className="w-3.5 h-3.5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
        </div>

        {/* 更多操作 */}
        <button
          className={classNames(
            "absolute top-2 right-2 z-10 w-6 h-6 rounded-md flex items-center justify-center transition-all cursor-pointer",
            "opacity-0 group-hover:opacity-100",
            "bg-[var(--th-glass)] backdrop-blur-sm",
            themeColors.borderClass,
            "border",
            themeColors.textClass,
            themeColors.hoverClass,
          )}
          onClick={(e) => {
            e.stopPropagation();
            onMoreClick(resource, e);
          }}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>

        {/* 预览区:统一 4:3 */}
        <div className="relative aspect-[4/3] overflow-hidden">
          {isImage ? (
            <LocalImage
              url={resource.path}
              alt={resource.name}
              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
          ) : isVideo ? (
            <>
              <LocalVideo
                src={resource.path}
                className="w-full h-full object-cover"
              />
              {/* 时长角标 */}
              {duration !== null && (
                <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded text-[11px] font-medium text-white bg-black/60 backdrop-blur-sm">
                  {formatDuration(duration)}
                </span>
              )}
              {/* hover 播放蒙层 */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/25 transition-colors">
                <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Play size={16} className="text-gray-900 ml-0.5" />
                </div>
              </div>
              {/* 隐藏元素仅用于读取时长 */}
              <video
                ref={metadataVideoRef}
                src={resource.path}
                preload="metadata"
                muted
                className="hidden"
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              />
            </>
          ) : (
            // 类型化彩色 icon tile
            <div
              className={classNames(
                "w-full h-full bg-linear-to-br flex items-center justify-center",
                typeConfig.tileClass,
              )}
            >
              <TypeIcon size={40} strokeWidth={1.5} className="text-white/90" />
            </div>
          )}

          {/* 选中蒙层 */}
          {selected && (
            <div className="absolute inset-0 bg-[var(--th-accent-soft)] pointer-events-none" />
          )}
        </div>

        {/* 信息区 */}
        <div className="px-3 py-2.5">
          <div
            className={classNames(
              "text-sm font-medium truncate mb-1.5",
              themeColors.textClass,
            )}
            title={resource.name}
          >
            {resource.name}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span
              className={classNames(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px]",
                themeColors.tagBgClass,
                themeColors.secondaryTextClass,
              )}
            >
              <TypeIcon size={11} />
              {typeConfig.label}
            </span>
            <span
              className={classNames(
                "text-[11px]",
                themeColors.secondaryTextClass,
              )}
            >
              {resource.refCount > 0 ? `引用 ${resource.refCount}` : "未引用"}
            </span>
          </div>
        </div>
      </div>
    );
  },
);

export default ResourceCard;
