import { useMemo } from "react";

import MindThemeUtil, { type MindMode } from "../../../utils/MindThemeUtil";
import type { MindThemeStyle } from "../../../constants/mind-themes";

/** 缩略图里的假导图：1 个根 + 3 条分支，第一条带一个三级节点 */
const BRANCHES = [0, 1, 2];
const W = 96;
const H = 46;
const ROOT = { x: 4, y: 17, w: 20, h: 12 };
const L2 = { x: 40, w: 22, h: 10 };
const L2_Y = [4, 18, 32];
const L3 = { x: 74, y: 4, w: 18, h: 8 };

/** 缩略图节点：透明底（浅底 / 线框风格）时用一条文字线示意 */
function Node({
  x,
  y,
  w,
  h,
  visual,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  visual: ReturnType<typeof MindThemeUtil.getNodeVisual>;
}) {
  const inset = visual.borderWidth / 2;
  return (
    <>
      {visual.background !== "transparent" && (
        <rect x={x} y={y} width={w} height={h} rx={3} fill={visual.background} />
      )}
      {visual.borderWidth > 0 && (
        <rect
          x={x + inset}
          y={y + inset}
          width={w - visual.borderWidth}
          height={h - visual.borderWidth}
          rx={3}
          fill="none"
          stroke={visual.borderColor}
          strokeWidth={visual.borderWidth}
        />
      )}
      <rect
        x={x + w * 0.18}
        y={y + h / 2 - 1}
        width={w * 0.64}
        height={2}
        rx={1}
        fill={visual.textColor}
        opacity={0.75}
      />
    </>
  );
}

export function ThemeThumbnail({
  themeId,
  themeStyle,
  mode,
}: {
  themeId: string;
  themeStyle: MindThemeStyle;
  mode: MindMode;
}) {
  const shapes = useMemo(() => {
    const theme = { themeId, themeStyle };
    const root = MindThemeUtil.getNodeVisual(theme, 1, -1, mode);
    const branches = BRANCHES.map(i => MindThemeUtil.getNodeVisual(theme, 2, i, mode));
    const leaf = MindThemeUtil.getNodeVisual(theme, 3, 0, mode);
    return { root, branches, leaf };
  }, [themeId, themeStyle, mode]);

  const rootCx = ROOT.x + ROOT.w;
  const rootCy = ROOT.y + ROOT.h / 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" aria-hidden>
      {BRANCHES.map(i => {
        const y = L2_Y[i] + L2.h / 2;
        const mx = (rootCx + L2.x) / 2;
        return (
          <path
            key={i}
            d={`M ${rootCx} ${rootCy} C ${mx} ${rootCy} ${mx} ${y} ${L2.x} ${y}`}
            fill="none"
            stroke={shapes.branches[i].lineColor}
            strokeWidth={shapes.branches[i].lineWidth * 0.6}
          />
        );
      })}
      <path
        d={`M ${L2.x + L2.w} ${L2_Y[0] + L2.h / 2} C ${L2.x + L2.w + 6} ${L2_Y[0] + L2.h / 2} ${L3.x - 6} ${L3.y + L3.h / 2} ${L3.x} ${L3.y + L3.h / 2}`}
        fill="none"
        stroke={shapes.leaf.lineColor}
        strokeWidth={shapes.leaf.lineWidth * 0.6}
      />
      <Node {...ROOT} visual={shapes.root} />
      {BRANCHES.map(i => (
        <Node key={i} x={L2.x} y={L2_Y[i]} w={L2.w} h={L2.h} visual={shapes.branches[i]} />
      ))}
      <Node {...L3} visual={shapes.leaf} />
    </svg>
  );
}

export default ThemeThumbnail;
