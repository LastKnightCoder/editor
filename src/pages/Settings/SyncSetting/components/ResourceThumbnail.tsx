import classNames from "classnames";
import {
  Image,
  Video,
  Music,
  FileText,
  BookOpen,
  Paperclip,
  Play,
} from "lucide-react";

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
  epub: "bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/40 dark:to-blue-800/40 text-blue-500 dark:text-blue-400",
  attachment:
    "bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800/60 dark:to-gray-700/60 text-gray-500 dark:text-gray-400",
};

const baseClass =
  "w-11 h-11 rounded-lg overflow-hidden bg-gray-100 dark:bg-slate-800 flex items-center justify-center shrink-0 relative group";

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
        onClick={(e) => {
          e.stopPropagation();
          onImageClick?.();
        }}
      >
        <LocalImage
          url={resource.path}
          alt={resource.name}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Image className="w-4 h-4 text-white" />
        </div>
      </div>
    );
  }

  // 视频缩略图
  if (resource.type === "video") {
    return (
      <div
        className={classNames(
          baseClass,
          "cursor-pointer bg-linear-to-br from-violet-100 to-violet-200 dark:from-violet-900/40 dark:to-violet-800/40",
          className,
        )}
        onClick={(e) => {
          e.stopPropagation();
          onVideoClick?.();
        }}
      >
        <Video className="w-5 h-5 text-violet-500 dark:text-violet-400" />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Play className="w-4 h-4 text-white" fill="white" />
        </div>
      </div>
    );
  }

  // 音频缩略图
  if (resource.type === "audio") {
    return (
      <div
        className={classNames(
          baseClass,
          "cursor-pointer bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-900/40 dark:to-emerald-800/40",
          className,
        )}
        onClick={(e) => {
          e.stopPropagation();
          onAudioClick?.();
        }}
      >
        <Music className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Play className="w-4 h-4 text-white" fill="white" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={classNames(baseClass, iconColors[resource.type], className)}
    >
      {getResourceIcon(resource.type)}
    </div>
  );
};

export default ResourceThumbnail;
