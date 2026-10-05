import { memo, useSyncExternalStore } from "react";
import type Board from "../../Board";
import GradientLine from "../GradientLine";

interface ReferenceLinesProps {
  board: Board;
  zoom: number;
}

/**
 * 渲染吸附参考线：直接订阅 board.snap，避免参考线变化带动整块画板重渲染
 */
const ReferenceLines = memo((props: ReferenceLinesProps) => {
  const { board, zoom } = props;
  const guides = useSyncExternalStore(board.snap.subscribe, board.snap.getGuides);

  if (guides.length === 0) {
    return null;
  }

  return (
    <g>
      {guides.map(guide => (
        <GradientLine
          key={guide.key}
          gradientId={`snap-guide-${guide.key}`}
          x1={guide.x1}
          y1={guide.y1}
          x2={guide.x2}
          y2={guide.y2}
          startColor="var(--tau-accent)"
          stopColor="var(--tau-accent)"
          strokeWidth={2 / zoom}
          strokeDasharray={`${5 / zoom}, ${5 / zoom}`}
        />
      ))}
    </g>
  );
});

export default ReferenceLines;
