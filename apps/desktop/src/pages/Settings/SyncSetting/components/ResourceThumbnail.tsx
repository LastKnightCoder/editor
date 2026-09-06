import classNames from "classnames";
import { Image, Video, Music, FileText, BookOpen, Paperclip, Play } from "lucide-react";

import LocalImage from "@/components/LocalImage";
import { ResourceType } from "@/types";

export interface ResourcePreviewItem {
  name: string;
  path: string;
  type: ResourceType;
}

interface ResourceThumbnailProps {
  resource: ResourcePreviewItem;
  onImageClick?: () => void;
  onVideoClick?: () => void;
  onAudioClick?: () => void;
  className?: string;
}

const getResourceIcon = (type: ResourceType) => {
  const iconClass = "w-5 h-5";
  switch (type) {
    case "image":
      return <Image className={iconClass} />;
    case "video":
      return <Video className={iconClass} />;
    case "audio":
      return <Music className={iconClass} />;
    case "pdf":
      return <FileText className={iconClass} />;
    case "epub":
      return <BookOpen className={iconClass} />;
    default:
      return <Paperclip className={iconClass} />;
  }
};

const iconColors: Record<ResourceType, string> = {
  image: "",
  video: "",
  audio: "",
  pdf: "bg-gradient-to-br from-red-100 to-red-200 dark:from-red-900/40 dark:to-red-800/40 text-red-500 dark:text-red-400",
  epub: "bg-[var(--th-accent-soft)] text-[var(--th-accent)]",
  attachment:
    "bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800/60 dark:to-gray-700/60 text-gray-500 dark:text-gray-400",
};

const baseClass =
  "w-11 h-11 rounded-lg overflow-hidden bg-gray-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 relative group";

const ResourceThumbnail = ({
  resource,
  onImageClick,
  onVideoClick,
  onAudioClick,
  className,
}: ResourceThumbnailProps) => {
  // 图片缩略图
  if (resource.type === "image") {
    return (
      <div
        className={classNames(baseClass, "cursor-pointer", className)}
        onClick={e => {
          e.stopPropagation();
          onImageClick?.();
        }}
      >
        <LocalImage
          url={resource.path}
          alt={resource.name}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          <Image className="h-4 w-4 text-white" />
        </div>
      </div>
    );
  }

  // 视频缩略图
  if (resource.type === "video") {
    return (
      <div
        className={classNames(baseClass, "cursor-pointer bg-[var(--th-accent-soft)]", className)}
        onClick={e => {
          e.stopPropagation();
          onVideoClick?.();
        }}
      >
        <Video className="h-5 w-5 text-[var(--th-accent)]" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          <Play className="h-4 w-4 text-white" fill="white" />
        </div>
      </div>
    );
  }

  // 音频缩略图
  if (resource.type === "audio") {
    return (
      <div
        className={classNames(baseClass, "cursor-pointer bg-[var(--th-accent-soft)]", className)}
        onClick={e => {
          e.stopPropagation();
          onAudioClick?.();
        }}
      >
        <Music className="h-5 w-5 text-[var(--th-accent)]" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          <Play className="h-4 w-4 text-white" fill="white" />
        </div>
      </div>
    );
  }

  return (
    <div className={classNames(baseClass, iconColors[resource.type], className)}>
      {getResourceIcon(resource.type)}
    </div>
  );
};

export default ResourceThumbnail;
