import { useMemo } from "react";

import type { MindNodeElement } from "../../../types";
import MindThemeUtil, { type MindMode } from "../../../utils/MindThemeUtil";
import MindUtil from "../../../utils/MindUtil";
import { getMindLayout, type MindLayoutId } from "../../../utils/mind-layout";
import type { MindThemeStyle } from "../../../constants/mind-themes";

const W = 96;
const H = 46;
const PAD = 4;

/** 1 个根 + 4 条主分支，前两条各带子节点；尺寸取画布单位，渲染时整体缩放进缩略图 */
const SAMPLE_SHAPE: Array<[string, number, MindNodeElement["direction"]]> = [
  ["a", 2, "right"],
  ["b", 1, "left"],
  ["c", 0, "right"],
  ["d", 0, "left"],
];

const node = (id: string, width: number, children: MindNodeElement[] = []): MindNodeElement => ({
  id,
  type: "mind-node",
  x: 0,
  y: 0,
  width,
  height: 24,
  actualHeight: 24,
  level: 1,
  children,
  childrenHeight: 0,
  leftChildrenHeight: 0,
  rightChildrenHeight: 0,
  direction: "right",
  text: [],
});

const sampleTree = (layout: MindLayoutId): MindNodeElement => ({
  ...node(
    "root",
    64,
    SAMPLE_SHAPE.map(([id, kids, direction]) => ({
      ...node(
        id,
        52,
        Array.from({ length: kids }, (_, i) => node(`${id}${i}`, 40))
      ),
      direction,
    }))
  ),
  layout,
});

export function LayoutThumbnail({
  layout,
  themeId,
  themeStyle,
  mode,
}: {
  layout: MindLayoutId;
  themeId: string;
  themeStyle: MindThemeStyle;
  mode: MindMode;
}) {
  const shapes = useMemo(() => {
    const root = MindUtil.layout(sampleTree(layout));
    const strategy = getMindLayout(root);
    const theme = { themeId, themeStyle };
    const nodes: Array<{ node: MindNodeElement; branch: number }> = [];
    const lines: Array<{ d: string; color: string; width: number }> = [];
    const visit = (current: MindNodeElement, branch: number) => {
      nodes.push({ node: current, branch });
      current.children.forEach((child, i) => {
        const childBranch = current.level === 1 ? i : branch;
        const visual = MindThemeUtil.getNodeVisual(theme, child.level, childBranch, mode);
        const connector = strategy.connector(current, child);
        const d =
          connector.kind === "path"
            ? connector.d
            : `M ${connector.from.x} ${connector.from.y} C ${(connector.from.x + connector.to.x) / 2} ${connector.from.y} ${(connector.from.x + connector.to.x) / 2} ${connector.to.y} ${connector.to.x} ${connector.to.y}`;
        lines.push({ d, color: visual.lineColor, width: visual.lineWidth });
        visit(child, childBranch);
      });
    };
    visit(root, -1);
    const bounds = MindUtil.getSubtreeBounds(root);
    const scale = Math.min(
      (W - PAD * 2) / (bounds.maxX - bounds.minX),
      (H - PAD * 2) / (bounds.maxY - bounds.minY)
    );
    const dx = (W - (bounds.maxX - bounds.minX) * scale) / 2 - bounds.minX * scale;
    const dy = (H - (bounds.maxY - bounds.minY) * scale) / 2 - bounds.minY * scale;
    return { nodes, lines, transform: `translate(${dx} ${dy}) scale(${scale})`, scale };
  }, [layout, themeId, themeStyle, mode]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" aria-hidden>
      <g transform={shapes.transform}>
        {shapes.lines.map((line, i) => (
          <path
            key={i}
            d={line.d}
            fill="none"
            stroke={line.color}
            strokeWidth={(line.width * 0.6) / shapes.scale}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {shapes.nodes.map(({ node: n, branch }) => {
          const visual = MindThemeUtil.getNodeVisual(
            { themeId, themeStyle },
            n.level,
            branch,
            mode
          );
          const filled = visual.background !== "transparent";
          return (
            <rect
              key={n.id}
              x={n.x}
              y={n.y}
              width={n.width}
              height={n.height}
              rx={6}
              fill={filled ? visual.background : visual.textColor}
              fillOpacity={filled ? 1 : 0.22}
              stroke={visual.borderWidth > 0 ? visual.borderColor : "none"}
              strokeWidth={visual.borderWidth / shapes.scale / 2}
            />
          );
        })}
      </g>
    </svg>
  );
}

export default LayoutThumbnail;
