import { useEditorI18n } from "../../../../../../../i18n";
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
}: VideoSelectionToolbarProps) => {
  const { t, locale } = useEditorI18n();
  return (
    <MediaToolbar label={t("av.video.properties")}>
      {MEDIA_ALIGNMENTS.map(({ align: value, Icon }) => (
        <ToolbarButton
          key={value}
          title={t(`av.align.${value}`)}
          icon={<Icon size={15} />}
          active={align === value}
          onClick={() => onAlign(value)}
        />
      ))}
      <ToolbarGap />
      {WIDTH_PRESETS.map(ratio => (
        <ToolbarButton
          key={ratio}
          title={t("av.video.width", {
            width: new Intl.NumberFormat(locale, {
              style: "percent",
              maximumFractionDigits: 0,
            }).format(ratio),
          })}
          label={`${ratio * 100}%`}
          mono
          active={activePreset === ratio}
          onClick={() => onWidthPreset(ratio)}
        />
      ))}
      <ToolbarGap />
      <ToolbarButton
        title={t("av.video.copyUrl")}
        icon={<Link2 size={15} />}
        onClick={onCopyLink}
      />
    </MediaToolbar>
  );
};

export default VideoSelectionToolbar;
