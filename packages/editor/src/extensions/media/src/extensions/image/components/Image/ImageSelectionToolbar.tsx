import type { ReactNode } from "react";
import { Captions, Crop, MoreHorizontal } from "lucide-react";

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
  /** 宿主注册的图片动作（如 AI 编辑），以图标按钮呈现，名称见悬停提示 */
  actions: { id: string; label: string; icon?: ReactNode }[];
  hasDescription: boolean;
  onAlign: (align: Align) => void;
  onWidthPreset: (ratio: number) => void;
  onCrop: () => void;
  onAction: (actionId: string) => void;
  onCaption: () => void;
  /** 打开「更多」：与块手柄菜单同一份条目（含全屏预览），锚在按钮下方 */
  onMore: (anchor: DOMRect) => void;
}

/** 选中图片块时浮在上方的属性条：对齐 / 宽度 / 裁剪 / 宿主动作 / 说明 / 更多，操作一律纯图标 */
const ImageSelectionToolbar = ({
  align,
  activePreset,
  actions,
  hasDescription,
  onAlign,
  onWidthPreset,
  onCrop,
  onAction,
  onCaption,
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
    <ToolbarButton title="裁剪" shortcut="C" icon={<Crop size={15} />} onClick={onCrop} />
    {actions.map(action => (
      <ToolbarButton
        key={action.id}
        title={action.label}
        icon={action.icon}
        label={action.icon ? undefined : action.label}
        onClick={() => onAction(action.id)}
      />
    ))}
    <ToolbarButton
      title={hasDescription ? "编辑说明" : "添加说明"}
      shortcut="Enter"
      icon={<Captions size={15} />}
      onClick={onCaption}
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
