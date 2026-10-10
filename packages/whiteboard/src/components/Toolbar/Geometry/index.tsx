import type { WhiteboardToolProps } from "../../../extensions/api";
import { memo, useState } from "react";
import { Shapes } from "lucide-react";
import { Popover } from "@tau/ui";

import { geometryItems, type GeometryItemConfig } from "./config";
import useCreateGeometry from "./useCreateGeometry";

import { ECreateBoardElementType } from "../../../types";
import { useBoard, useCreateElementType } from "../../../hooks";
import { transformPath } from "../../../utils";
import { ChromeButton, stopCanvasEvents } from "../../../chrome";

/** 形状：点开是四格图块（矩形 / 圆形 / 心形 / 三角形），选中后在画布上拖出 */
const Geometry = memo(({ run }: WhiteboardToolProps) => {
  const board = useBoard();
  const [open, setOpen] = useState(false);
  const createType = useCreateElementType();
  const active = createType === ECreateBoardElementType.Geometry;

  useCreateGeometry();

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
        if (!v && active && !board.createOptions) run();
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
          <Shapes strokeWidth={1.75} />
        </ChromeButton>
      }
    >
      <div {...stopCanvasEvents} className="grid grid-cols-4 gap-1 p-1.5">
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
