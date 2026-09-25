/**
 * 白板页示意图（schematic.ts 生成图元，这里画成 SVG）。随列表数据实时变化，不截图、不缓存。
 */

import { memo, useId, useMemo } from "react";
import useTheme from "@/hooks/useTheme";
import type { BoardElement } from "@/components/WhiteBoard/types";
import { buildSchematic, type SchematicFill, type SchematicShape } from "../schematic";

/** 卡片缩略图的大致显示宽度：箭头三角等「按像素」的尺寸据此换算回画布坐标 */
const NOMINAL_WIDTH = 320;

export const PageSchematic = memo(function PageSchematic({
  elements,
  aspect,
  className,
}: {
  elements: BoardElement[] | undefined;
  aspect: number;
  className?: string;
}) {
  const { isDark } = useTheme();
  const idPrefix = useId();
  const schematic = useMemo(
    () => buildSchematic(elements, { aspect, dark: isDark }),
    [elements, aspect, isDark]
  );
  if (!schematic) return null;
  const { viewBox: vb, shapes } = schematic;
  const unit = vb.w / NOMINAL_WIDTH;

  return (
    <svg
      className={className}
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      {shapes.map((shape, i) => (
        <Shape key={i} shape={shape} unit={unit} gradientId={`${idPrefix}g${i}`} />
      ))}
    </svg>
  );
});

/** CSS 角度（0deg 朝上、顺时针）→ objectBoundingBox 下的渐变向量 */
function Gradient({ id, fill }: { id: string; fill: Exclude<SchematicFill, string> }) {
  const rad = (fill.angle * Math.PI) / 180;
  const dx = Math.sin(rad) / 2;
  const dy = -Math.cos(rad) / 2;
  return (
    <linearGradient id={id} x1={0.5 - dx} y1={0.5 - dy} x2={0.5 + dx} y2={0.5 + dy}>
      {fill.stops.map((stop, i) => (
        <stop key={i} offset={stop.offset} stopColor={stop.color} />
      ))}
    </linearGradient>
  );
}

function Shape({
  shape,
  unit,
  gradientId,
}: {
  shape: SchematicShape;
  unit: number;
  gradientId: string;
}) {
  switch (shape.kind) {
    case "rect": {
      const gradient = typeof shape.fill === "string" ? null : shape.fill;
      return (
        <>
          {gradient && <Gradient id={gradientId} fill={gradient} />}
          <rect
            x={shape.x}
            y={shape.y}
            width={shape.w}
            height={shape.h}
            rx={shape.r}
            fill={gradient ? `url(#${gradientId})` : (shape.fill as string)}
            fillOpacity={shape.fillOpacity}
            stroke={shape.stroke}
            strokeWidth={shape.strokeWidth}
            vectorEffect="non-scaling-stroke"
          />
        </>
      );
    }
    case "path": {
      const { box } = shape;
      return (
        <path
          d={shape.d}
          transform={box ? `translate(${box.x} ${box.y}) scale(${box.w} ${box.h})` : undefined}
          fill={shape.fill ?? "none"}
          fillOpacity={shape.fillOpacity}
          stroke={shape.stroke}
          strokeOpacity={shape.strokeOpacity}
          strokeWidth={shape.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      );
    }
    case "arrowhead": {
      // 开口小折线（约 3px），和连线同粗细，缩略图里只作方向提示
      const s = 2.2 * unit;
      return (
        <path
          d={`M ${-s * 1.4} ${-s} L 0 0 L ${-s * 1.4} ${s}`}
          transform={`translate(${shape.x} ${shape.y}) rotate(${(shape.angle * 180) / Math.PI})`}
          fill="none"
          stroke={shape.color}
          strokeOpacity={0.75}
          strokeWidth={1}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      );
    }
  }
}
