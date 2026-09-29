/**
 * ResizeHandle 档案 —— 本体即 ui/primitives/ResizeHandle。
 */

import { useState } from "react";
import { ResizeHandle } from "@tau/ui";
import { DocHead, MatrixRow } from "../kit";

export default function ResizeHandleSection() {
  const [right, setRight] = useState(260);
  const [left, setLeft] = useState(200);
  return (
    <>
      <DocHead
        title="ResizeHandle"
        en="primitives/ResizeHandle.tsx"
        duty="侧栏拖宽热区：透明 8px 竖条，hover / 拖动时中部显出 2px accent 短线，不画分隔线。side 表示栏在热区哪一侧；宽度夹在 [min, max]，←/→ ±16px，双击回默认。消费者：壳层 AI 停靠栏、PDF 阅读页纸内对话栏。"
        src="packages/ui/src/primitives/ResizeHandle.tsx"
      />
      <MatrixRow name="栏在右边" desc="side=right：热区贴栏左缘，向左拖变宽（停靠栏 / 对话栏）">
        <div className="bg-page rounded-tau-md flex h-40 w-[560px] overflow-hidden">
          <div className="text-tau-meta text-ink-3 flex flex-1 items-center justify-center">
            正文
          </div>
          <div className="bg-surface relative shrink-0" style={{ width: right }}>
            <ResizeHandle
              value={right}
              min={200}
              max={400}
              defaultValue={260}
              onChange={setRight}
              side="right"
              label="示例栏宽度"
              className="absolute bottom-4 left-0 top-4"
            />
            <div className="text-tau-meta text-ink-2 flex h-full items-center justify-center tabular-nums">
              {right}px
            </div>
          </div>
        </div>
      </MatrixRow>
      <MatrixRow name="栏在左边" desc="side=left：热区贴栏右缘，向右拖变宽">
        <div className="bg-page rounded-tau-md flex h-40 w-[560px] overflow-hidden">
          <div className="bg-surface relative shrink-0" style={{ width: left }}>
            <div className="text-tau-meta text-ink-2 flex h-full items-center justify-center tabular-nums">
              {left}px
            </div>
            <ResizeHandle
              value={left}
              min={160}
              max={360}
              defaultValue={200}
              onChange={setLeft}
              side="left"
              label="示例栏宽度"
              className="absolute bottom-4 right-0 top-4"
            />
          </div>
          <div className="text-tau-meta text-ink-3 flex flex-1 items-center justify-center">
            正文
          </div>
        </div>
      </MatrixRow>
    </>
  );
}
