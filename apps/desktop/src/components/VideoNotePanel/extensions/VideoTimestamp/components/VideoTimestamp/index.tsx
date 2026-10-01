import React, { PropsWithChildren } from "react";
import { RenderElementProps } from "slate-react";
import { Tooltip } from "@tau/ui";
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
      content={previewContent}
      disabled={!previewUrl}
      placement="top"
      className="overflow-hidden rounded-lg p-0"
      delay={300}
    >
      <span
        {...attributes}
        onClick={() => onSeek(time)}
        className={`inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-medium transition-colors ${
          isDark
            ? "bg-[var(--tau-accent)]/30 hover:bg-[var(--tau-accent)]/40"
            : "hover:bg-[var(--tau-accent)]/15 bg-[var(--tau-accent-soft)] text-[var(--tau-accent-text)]"
        } `}
      >
        {formatTimestamp(time)}
        {children}
      </span>
    </Tooltip>
  );
};

export default VideoTimestamp;
