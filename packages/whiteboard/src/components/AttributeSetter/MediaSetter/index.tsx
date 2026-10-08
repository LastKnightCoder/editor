import { memo } from "react";
import type { BoardElement } from "../../../types";
import SketchPopover from "../SketchPopover";

interface MediaSetterProps {
  element: BoardElement;
  onChange: (element: BoardElement) => void;
}

/** 视频 / 网页 / 音频 / 白板引用：没有其他样式项，属性条只有「笔触」 */
const MediaSetter = memo(({ element, onChange }: MediaSetterProps) => (
  <SketchPopover target={element} onChange={onChange} />
));

export default MediaSetter;
