import { memo, useSyncExternalStore } from "react";
import type Board from "../../Board";
import type { SnapGuide } from "../../utils/snap/SnapGeometry";
import GradientLine from "../GradientLine";

// 等距测距线两端短横的长度（屏幕像素）
const GAP_TICK_PX = 8;

/** 等距测距线：沿间距方向的实线，两端各一条垂直短横 */
const GapGuide = ({
  guide,
  tick,
  strokeWidth,
}: {
  guide: SnapGuide;
  tick: number;
  strokeWidth: number;
}) => {
  const half = tick / 2;
  const isHorizontal = guide.axis === "x";
  const ends = [
    [guide.x1, guide.y1],
    [guide.x2, guide.y2],
  ];
  return (
    <g stroke="var(--tau-accent)" strokeWidth={strokeWidth}>
      <line x1={guide.x1} y1={guide.y1} x2={guide.x2} y2={guide.y2} />
      {ends.map(([x, y], index) =>
        isHorizontal ? (
          <line key={index} x1={x} y1={y - half} x2={x} y2={y + half} />
        ) : (
          <line key={index} x1={x - half} y1={y} x2={x + half} y2={y} />
        )
      )}
    </g>
  );
};

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

  const tick = GAP_TICK_PX / zoom;

  return (
    <g>
      {guides.map(guide =>
        guide.kind === "gap" ? (
          <GapGuide key={guide.key} guide={guide} tick={tick} strokeWidth={1 / zoom} />
        ) : (
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
        )
      )}
    </g>
  );
});

export default ReferenceLines;
