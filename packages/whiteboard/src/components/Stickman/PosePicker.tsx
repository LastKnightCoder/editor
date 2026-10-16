import { memo, useState } from "react";
import { cn } from "@tau/ui";
import type { ResolvedSketch } from "../../types";
import { usePageSketch } from "../../hooks";
import { Seg } from "../../chrome";
import { hashSeed } from "../../utils/sketch";
import {
  STICK_CATEGORIES,
  STICK_POSES,
  getStickPose,
  stickViewBox,
  type StickBody,
  type StickCategory,
  type StickPose,
  type StickTint,
} from "../../utils/stickman";
import StickFigure from "./StickFigure";

/** 姿态小图：跟随页面画风，笔迹由姿态 key 派生（同一姿态每次打开都一样） */
export function StickGlyph({
  pose,
  body,
  tint,
  size,
}: {
  pose: StickPose;
  body: StickBody;
  tint: StickTint;
  size: number;
}) {
  const page = usePageSketch();
  const sketch: ResolvedSketch = {
    enabled: page.mode === "sketch",
    level: page.level,
    seed: hashSeed(pose.key),
  };
  return (
    <svg width={size} height={size} viewBox={stickViewBox(pose)} className="overflow-visible">
      <StickFigure pose={pose} body={body} tint={tint} sketch={sketch} />
    </svg>
  );
}

interface PosePickerProps {
  /** 当前姿态（属性条换姿态时高亮）；工具栏不传 */
  value?: string;
  body: StickBody;
  tint: StickTint;
  onPick: (key: string) => void;
}

/** 人物面板：分类切换 + 4 列姿态图块，工具栏放置与属性条换姿态共用 */
const PosePicker = memo(({ value, body, tint, onPick }: PosePickerProps) => {
  const [category, setCategory] = useState<StickCategory>(
    () => getStickPose(value ?? "")?.cat ?? STICK_CATEGORIES[0].key
  );
  return (
    <div className="flex flex-col gap-2">
      <Seg<StickCategory>
        label="人物分类"
        value={category}
        onChange={setCategory}
        options={STICK_CATEGORIES.map(c => ({ value: c.key, label: c.label }))}
      />
      <div className="grid grid-cols-4 gap-1">
        {STICK_POSES.filter(pose => pose.cat === category).map(pose => (
          <button
            key={pose.key}
            type="button"
            aria-label={pose.name}
            aria-pressed={pose.key === value}
            onClick={() => onPick(pose.key)}
            className={cn(
              "text-ink-2 hover:bg-hover hover:text-ink-1 flex h-[84px] cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] text-[11.5px]",
              "ease-tau-out transition-[background-color,color] duration-150",
              "aria-pressed:bg-accent-soft aria-pressed:text-accent-text"
            )}
          >
            <StickGlyph pose={pose} body={body} tint={tint} size={52} />
            {pose.name}
          </button>
        ))}
      </div>
    </div>
  );
});

export default PosePicker;
