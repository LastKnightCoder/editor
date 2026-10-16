import { memo, useMemo } from "react";
import type { ResolvedSketch } from "../../types";
import { STICK_INK } from "../../constants/stickman";
import { handTextClass } from "../../utils/sketch";
import {
  buildStickStrokes,
  renderStickPrecise,
  renderStickSketch,
  type StickPose,
  type StickStyle,
  type StickText,
} from "../../utils/stickman";
import SketchPaths from "../SketchPaths";

interface StickFigureProps extends StickStyle {
  pose: StickPose;
  sketch: ResolvedSketch;
}

function StickTexts({ texts, className }: { texts: StickText[]; className: string }) {
  return texts.map((t, i) => (
    <text
      key={i}
      x={t.x}
      y={t.y}
      textAnchor="middle"
      dominantBaseline="middle"
      fill={STICK_INK}
      fontSize={t.size}
      className={className}
      transform={t.rotate ? `rotate(${t.rotate} ${t.x} ${t.y})` : undefined}
    >
      {t.text}
    </text>
  ));
}

/** 火柴人图形本体（姿态局部坐标），元素、工具栏图块与属性条图示共用 */
const StickFigure = memo(({ pose, body, tint, flip, sketch }: StickFigureProps) => {
  const strokes = useMemo(
    () => buildStickStrokes(pose, { body, tint, flip }),
    [pose, body, tint, flip]
  );
  const { enabled, level, seed } = sketch;
  const output = useMemo(
    () => (enabled ? renderStickSketch(strokes, level, seed) : null),
    [strokes, enabled, level, seed]
  );
  const precise = useMemo(() => (enabled ? null : renderStickPrecise(strokes)), [strokes, enabled]);

  if (output) {
    return (
      <g pointerEvents="none">
        <SketchPaths paths={output.paths} />
        <StickTexts texts={output.texts} className={handTextClass(sketch)} />
      </g>
    );
  }
  return (
    <g pointerEvents="none" strokeLinecap="round" strokeLinejoin="round">
      {precise?.paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.fill} stroke={p.stroke} strokeWidth={p.strokeWidth} />
      ))}
      <StickTexts texts={precise?.texts ?? []} className="font-medium" />
    </g>
  );
});

export default StickFigure;
