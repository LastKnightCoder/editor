import React, { PropsWithChildren } from "react";
import { RenderElementProps } from "slate-react";
import { Tooltip } from "antd";
import useTheme from "@/hooks/useTheme";
import { formatTimestamp, VideoTimestampElement } from "../../";
import LocalImage from "@/components/LocalImage";

interface VideoTimestampProps {
  attributes: RenderElementProps["attributes"];
  element: VideoTimestampElement;
  onSeek: (time: number) => void;
}

const VideoTimestamp: React.FC<PropsWithChildren<VideoTimestampProps>> = ({
  attributes,
  element,
  children,
  onSeek,
}) => {
  const { isDark } = useTheme();
  const { time, previewUrl } = element;

  const previewContent = previewUrl ? (
    <div style={{ width: 200 }}>
      <LocalImage url={previewUrl} className="w-full" />
    </div>
  ) : null;

  return (
    <Tooltip
      title={previewContent}
      placement="top"
      overlayInnerStyle={{
        padding: 0,
        overflow: "hidden",
        borderRadius: 8,
      }}
      mouseEnterDelay={0.3}
    >
      <span
        {...attributes}
        onClick={() => onSeek(time)}
        className={`
          inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-medium transition-colors
          ${isDark
            ? "bg-blue-900/40 text-blue-300 hover:bg-blue-800/50"
            : "bg-blue-100 text-blue-700 hover:bg-blue-200"
          }
        `}
      >
        {formatTimestamp(time)}
        {children}
      </span>
    </Tooltip>
  );
};

export default VideoTimestamp;
