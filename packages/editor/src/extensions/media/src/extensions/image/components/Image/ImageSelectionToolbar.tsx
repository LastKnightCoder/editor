import type { ReactNode } from "react";
import { Crop, Maximize2, MoreHorizontal } from "lucide-react";

import {
  MEDIA_ALIGNMENTS,
  MediaToolbar,
  ToolbarButton,
  ToolbarGap,
} from "../../../../components/MediaToolbar";
import type { ImageElement } from "../../../../types";
import { WIDTH_PRESETS } from "../../../../utils/mediaWidth";

type Align = NonNullable<ImageElement["align"]>;

interface ImageSelectionToolbarProps {
  align: Align;
  /** 当前命中的宽度预设（不在预设上时为 null） */
  activePreset: number | null;
  /** 宿主注册的图片动作（如 AI 编辑），作为带文字的主操作 */
  actions: { id: string; label: string; icon?: ReactNode }[];
  onAlign: (align: Align) => void;
  onWidthPreset: (ratio: number) => void;
  onCrop: () => void;
  onAction: (actionId: string) => void;
  onPreview: () => void;
  /** 打开「更多」：与块手柄菜单同一份条目，锚在按钮下方 */
  onMore: (anchor: DOMRect) => void;
}

/** 选中图片块时浮在上方的属性条：对齐 / 宽度 / 裁剪 / 宿主动作 / 预览 / 更多 */
const ImageSelectionToolbar = ({
  align,
  activePreset,
  actions,
  onAlign,
  onWidthPreset,
  onCrop,
  onAction,
  onPreview,
  onMore,
}: ImageSelectionToolbarProps) => (
  <MediaToolbar label="图片属性">
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
    <ToolbarButton
      title="裁剪"
      shortcut="C"
      label="裁剪"
      icon={<Crop size={15} />}
      onClick={onCrop}
    />
    {actions.map(action => (
      <ToolbarButton
        key={action.id}
        title={action.label}
        label={action.label}
        icon={action.icon}
        onClick={() => onAction(action.id)}
      />
    ))}
    <ToolbarButton
      title="全屏预览"
      shortcut="Space"
      icon={<Maximize2 size={15} />}
      onClick={onPreview}
    />
    <ToolbarGap />
    <ToolbarButton
      title="更多"
      icon={<MoreHorizontal size={15} />}
      onClick={event => onMore(event.currentTarget.getBoundingClientRect())}
    />
  </MediaToolbar>
);

export default ImageSelectionToolbar;
