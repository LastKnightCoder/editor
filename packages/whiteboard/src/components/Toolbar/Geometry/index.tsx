import type { WhiteboardToolProps } from "../../../extensions/api";
import { memo, useEffect, useState } from "react";
import { Popover } from "@tau/ui";

import { geometryItems, type GeometryItemConfig } from "./config";

import { useBoard, useActiveTool } from "../../../hooks";
import { transformPath } from "../../../utils";
import { ChromeButton, stopCanvasEvents } from "../../../chrome";
import { GEOMETRY_TOOL_ID } from "../../../constants/tools";

/** 当前形状的小图（按钮图标跟随最近选择的形状；路径为单位方形，缩放到 20×20 视窗） */
function ShapeGlyph({ geometryType }: { geometryType: string }) {
  const item = geometryItems.find(entry => entry.geometryType === geometryType) ?? geometryItems[0];
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" className="overflow-visible">
      {item.paths.map((path, index) => (
        <path
          key={index}
          d={transformPath(path, 20, 20)}
          fill="none"
          strokeWidth={1.75}
          strokeLinejoin="round"
          stroke="currentColor"
        />
      ))}
    </svg>
  );
}

/** 形状：点开是形状图块（每行 5 格），选中后在画布上拖出 */
const Geometry = memo(({ run }: WhiteboardToolProps) => {
  const board = useBoard();
  const [open, setOpen] = useState(false);
  const active = useActiveTool() === GEOMETRY_TOOL_ID;
  const [shapeType, setShapeType] = useState(geometryItems[0].geometryType);

  // 图标跟随当前形状：任何入口（含本组件的 pick）激活工具都经 active-tool:change 同步
  useEffect(() => {
    const onToolChange = (id: string, options: Readonly<Record<string, unknown>> | null) => {
      if (id === GEOMETRY_TOOL_ID && typeof options?.geometryType === "string")
        setShapeType(options.geometryType);
    };
    board.on("active-tool:change", onToolChange);
    return () => board.off("active-tool:change", onToolChange);
  }, [board]);

  const pick = (item: GeometryItemConfig) => {
    run({
      ...item,
      geometryType: item.geometryType,
      defaultExtraInfo: item.defaultExtraInfo || {},
    });
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={v => {
        setOpen(v);
        // 再点一次已激活的形状工具 = 取消
        if (!v && active && !board.activeToolOptions) run();
      }}
      placement="bottom"
      arrow={false}
      className="min-w-0"
      trigger={
        <ChromeButton
          label="形状"
          sub
          active={active}
          onClick={e => {
            if (active) {
              e.preventDefault();
              run();
            }
          }}
        >
          <ShapeGlyph geometryType={shapeType} />
        </ChromeButton>
      }
    >
      <div {...stopCanvasEvents} className="grid grid-cols-5 gap-1 p-1.5">
        {geometryItems.map(item => (
          <button
            key={item.geometryType}
            type="button"
            onClick={() => pick(item)}
            className="text-ink-2 hover:bg-hover hover:text-ink-1 flex h-[62px] w-16 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[10px] text-[11.5px]"
          >
            <svg width={20} height={20} viewBox="0 0 20 20" className="overflow-visible">
              {item.paths.map((path, index) => (
                <path
                  key={index}
                  d={transformPath(path, 20, 20)}
                  fill="none"
                  strokeWidth={1.75}
                  strokeLinejoin="round"
                  stroke="currentColor"
                />
              ))}
            </svg>
            {item.name}
          </button>
        ))}
      </div>
    </Popover>
  );
});

export default Geometry;
