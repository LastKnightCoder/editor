import { Link2 } from "lucide-react";

import {
  MEDIA_ALIGNMENTS,
  MediaToolbar,
  ToolbarButton,
  ToolbarGap,
} from "../../../../components/MediaToolbar";
import type { VideoElement } from "../../../../types";
import { WIDTH_PRESETS } from "../../../../utils/mediaWidth";

type Align = NonNullable<VideoElement["align"]>;

interface VideoSelectionToolbarProps {
  align: Align;
  /** 当前命中的宽度预设（不在预设上时为 null） */
  activePreset: number | null;
  onAlign: (align: Align) => void;
  onWidthPreset: (ratio: number) => void;
  onCopyLink: () => void;
}

/** 选中视频块时浮在上方的属性条：对齐 / 宽度预设 / 复制地址 */
const VideoSelectionToolbar = ({
  align,
  activePreset,
  onAlign,
  onWidthPreset,
  onCopyLink,
}: VideoSelectionToolbarProps) => (
  <MediaToolbar label="视频属性">
    {MEDIA_ALIGNMENTS.map(({ align: value, label, Icon }) => (
      <ToolbarButton
        key={value}
        title={label}
        icon={<Icon size={15} />}
        active={align === value}
        onClick={() => onAlign(value)}
      />
    ))}
    <ToolbarGap />
    {WIDTH_PRESETS.map(ratio => (
      <ToolbarButton
        key={ratio}
        title={`宽度 ${ratio * 100}%`}
        label={`${ratio * 100}%`}
        mono
        active={activePreset === ratio}
        onClick={() => onWidthPreset(ratio)}
      />
    ))}
    <ToolbarGap />
    <ToolbarButton title="复制视频地址" icon={<Link2 size={15} />} onClick={onCopyLink} />
  </MediaToolbar>
);

export default VideoSelectionToolbar;
