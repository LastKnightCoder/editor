import React, { memo, useRef, useState } from "react";
import { EditText } from "@tau/ui";
import { useMemoizedFn } from "ahooks";
import { Tooltip } from "@tau/ui";
import { ColumnDef } from "../../../types";
interface TextRendererProps {
  value: string;
  column: ColumnDef;
}

const HOVER_DELAY = 1000;
const TextRenderer: React.FC<TextRendererProps> = memo(({ value }) => {
  const [isHovering, setIsHovering] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
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
    <>
      <Tooltip
        open={isHovering}
        onOpenChange={setIsHovering}
        content={
          <EditText
            key={value}
            defaultValue={value}
            contentEditable={false}
            className="max-w-[200px] px-2 py-2"
          />
        }
      >
        <div
          ref={cellRef}
          className="h-full w-full"
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        >
          <EditText
            key={value}
            defaultValue={value}
            contentEditable={false}
            className="text-ink-1 text-tau-body box-border flex h-full w-full items-center overflow-hidden text-ellipsis whitespace-nowrap px-2 py-2"
          />
        </div>
      </Tooltip>
    </>
  );
});

export default TextRenderer;
