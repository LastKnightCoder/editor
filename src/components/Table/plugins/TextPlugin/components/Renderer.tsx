import React, { memo, useState, useRef } from "react";
import EditText from "@/components/EditText";
import { useMemoizedFn } from "ahooks";
import { Popover } from "antd";
import { ColumnDef } from "../../../types";
interface TextRendererProps {
  value: string;
  column: ColumnDef;
}

const HOVER_DELAY = 1000;
const TextRenderer: React.FC<TextRendererProps> = memo(({ value }) => {
  const [isHovering, setIsHovering] = useState(false);
  const timer = useRef<number | null>(null);

  const onMouseLeave = useMemoizedFn(() => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setIsHovering(false);
  });

  const onMouseEnter = useMemoizedFn(() => {
    timer.current = window.setTimeout(() => {
      setIsHovering(true);
    }, HOVER_DELAY);
  });

  return (
    <Popover
      open={isHovering}
      content={
        <EditText
          defaultValue={value}
          contentEditable={false}
          className="px-2 py-2 max-w-[200px]"
        />
      }
    >
      <div
        className="w-full h-full"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <EditText
          defaultValue={value}
          contentEditable={false}
          className="px-2 py-2 h-full w-full flex items-center overflow-hidden text-ellipsis whitespace-nowrap box-border"
        />
      </div>
    </Popover>
  );
});

export default TextRenderer;
