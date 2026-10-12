import { memo } from "react";
import { useMemoizedFn } from "ahooks";
import { BoxSelect, PanelTop, Scan, Ungroup } from "lucide-react";
import { produce } from "immer";

import {
  FrameBorderStyle,
  FrameElement,
  FrameTitlePosition,
  FRAME_DEFAULT_BORDER_STYLE,
  FRAME_DEFAULT_STYLES,
} from "../../../types";
import { useBoard } from "../../../hooks";
import { FrameUtil } from "../../../utils";
import { AttrAction, AttrPopover, Glyph, OptionGrid, Seg, SwatchRow } from "../../../chrome";
import SketchPopover from "../SketchPopover";

interface FrameSetterProps {
  element: FrameElement;
  onChange: (element: FrameElement) => void;
}

const STYLE_NAMES = ["蓝", "绿", "黄", "橙", "红", "紫", "粉", "灰", "青", "靛"];

const BORDER_STYLES: { value: FrameBorderStyle; label: string; dash?: string }[] = [
  { value: "solid", label: "实线" },
  { value: "dashed", label: "虚线", dash: "4 4" },
  { value: "dotted", label: "点线", dash: "0 3.6" },
];

const FrameSetter = memo(({ element, onChange }: FrameSetterProps) => {
  const board = useBoard();
  const currentStyleIndex = FRAME_DEFAULT_STYLES.findIndex(
    s => s.backgroundColor === element.backgroundColor && s.borderColor === element.borderColor
  );

  const handleStyleChange = useMemoizedFn((styleIndex: number) => {
    const s = FRAME_DEFAULT_STYLES[styleIndex];
    onChange(
      produce(element, draft => {
        draft.backgroundColor = s.backgroundColor;
        draft.borderColor = s.borderColor;
        draft.borderWidth = s.borderWidth;
        draft.borderRadius = s.borderRadius;
      })
    );
    FrameUtil.setLocalStorage("backgroundColor", s.backgroundColor);
    FrameUtil.setLocalStorage("borderColor", s.borderColor);
    FrameUtil.setLocalStorage("borderWidth", s.borderWidth.toString());
    FrameUtil.setLocalStorage("borderRadius", s.borderRadius.toString());
  });

  const handleTitlePositionChange = useMemoizedFn((pos: FrameTitlePosition) => {
    onChange(produce(element, draft => void (draft.titlePosition = pos)));
    FrameUtil.setLocalStorage("titlePosition", pos);
  });

  const handleBorderStyleChange = useMemoizedFn((style: FrameBorderStyle) => {
    onChange(produce(element, draft => void (draft.borderStyle = style)));
    FrameUtil.setLocalStorage("borderStyle", style);
  });

  const handleFitContent = useMemoizedFn(() => {
    const b = FrameUtil.calculateFrameFitBounds(board, element);
    onChange(
      produce(element, draft => {
        draft.x = b.x;
        draft.y = b.y;
        draft.width = b.width;
        draft.height = b.height;
      })
    );
  });

  return (
    <>
      <AttrPopover
        label="画框样式"
        swatch={{ fill: element.backgroundColor, stroke: element.borderColor }}
        width={264}
      >
        <SwatchRow
          options={FRAME_DEFAULT_STYLES.map((s, i) => ({
            key: String(i),
            label: STYLE_NAMES[i] ?? `样式 ${i + 1}`,
            fill: s.backgroundColor,
            stroke: s.borderColor,
          }))}
          value={currentStyleIndex >= 0 ? String(currentStyleIndex) : null}
          onChange={k => handleStyleChange(Number(k))}
        />
      </AttrPopover>
      <AttrPopover label="边框" icon={<BoxSelect strokeWidth={1.75} />} width={240}>
        <OptionGrid<FrameBorderStyle>
          options={BORDER_STYLES.map(s => ({
            value: s.value,
            label: s.label,
            glyph: (
              <Glyph>
                <path d="M3 7H25" strokeDasharray={s.dash} />
              </Glyph>
            ),
            showLabel: true,
          }))}
          value={element.borderStyle ?? FRAME_DEFAULT_BORDER_STYLE}
          onChange={handleBorderStyleChange}
        />
      </AttrPopover>
      <AttrPopover label="标题位置" icon={<PanelTop strokeWidth={1.75} />} width={220}>
        <Seg<FrameTitlePosition>
          label="标题位置"
          value={element.titlePosition ?? "top"}
          onChange={handleTitlePositionChange}
          options={[
            { value: "top", label: "上方" },
            { value: "inline", label: "内嵌" },
          ]}
        />
      </AttrPopover>
      <AttrAction label="适应内容" icon={<Scan strokeWidth={1.75} />} onClick={handleFitContent} />
      <AttrAction
        label="解散画框"
        icon={<Ungroup strokeWidth={1.75} />}
        onClick={() => FrameUtil.unwrapFrame(board, element)}
      />
      <SketchPopover target={element} onChange={onChange} />
    </>
  );
});

export default FrameSetter;
