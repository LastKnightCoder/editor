import { memo, useId } from "react";
import { useThemeStore } from "@tau/themes/react";
import type { SketchPath } from "../../utils/sketch";

/** 线类填充（斜线 / 交叉 / 涂鸦）退一步，不压文字；深色底上更显眼，再降一档 */
const LINES_OPACITY = { light: 0.85, dark: 0.55 };

interface SketchPathsProps {
  paths: SketchPath[];
  /** 虚线流动：遮罩 dashoffset 走完一个周期的秒数；不传则静止 */
  dashFlowDuration?: number;
}

/** 渲染 utils/sketch 的输出：墨迹与淡涂是填充多边形，线类填充裁剪在轮廓内，虚线经遮罩切段 */
const SketchPaths = memo(({ paths, dashFlowDuration }: SketchPathsProps) => {
  const isDark = useThemeStore(s => s.mode) === "dark";
  const idPrefix = `sk${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <>
      {paths.map((path, index) => {
        const clipId = path.clip ? `${idPrefix}-c${index}` : undefined;
        const maskId = path.dashMask ? `${idPrefix}-m${index}` : undefined;
        const opacity =
          path.role === "lines"
            ? (path.opacity ?? 1) * (isDark ? LINES_OPACITY.dark : LINES_OPACITY.light)
            : path.opacity;
        const mask = path.dashMask;
        return (
          <g key={index}>
            {clipId && (
              <clipPath id={clipId}>
                <path d={path.clip} />
              </clipPath>
            )}
            {mask && maskId && (
              <mask
                id={maskId}
                maskUnits="userSpaceOnUse"
                x={-100000}
                y={-100000}
                width={200000}
                height={200000}
              >
                {mask.map((m, maskIndex) => (
                  <path
                    key={maskIndex}
                    d={m.d}
                    fill="none"
                    stroke="#fff"
                    strokeWidth={m.width}
                    strokeLinecap="round"
                    strokeDasharray={`${m.dash} ${m.gap}`}
                    strokeDashoffset={m.offset}
                  >
                    {dashFlowDuration && (
                      <animate
                        attributeName="stroke-dashoffset"
                        from={m.offset ?? 0}
                        to={(m.offset ?? 0) - (m.dash + m.gap)}
                        dur={`${dashFlowDuration}s`}
                        repeatCount="indefinite"
                      />
                    )}
                  </path>
                ))}
              </mask>
            )}
            <path
              d={path.d}
              fill={path.color}
              opacity={opacity}
              clipPath={clipId ? `url(#${clipId})` : undefined}
              mask={maskId ? `url(#${maskId})` : undefined}
            />
          </g>
        );
      })}
    </>
  );
});

export default SketchPaths;
