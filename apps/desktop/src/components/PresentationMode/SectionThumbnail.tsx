/** 节缩略图：同一份舞台渲染按比例缩小（比例与放映一致），多屏的节标「N 屏」 */
import { memo, useState } from "react";
import type { Descendant } from "slate";
import { Layers } from "lucide-react";
import { cn } from "@tau/ui";
import type { StageSize } from "./frame";
import { SlideFrame } from "./SlideFrame";

interface SectionThumbnailProps {
  section: Descendant[];
  index: number;
  /** 放映舞台的逻辑尺寸 */
  stage: Pick<StageSize, "width" | "height">;
  /** 缩略图显示宽度（屏幕像素） */
  displayWidth: number;
  current?: boolean;
  selected?: boolean;
  onSelect(index: number): void;
}

export const SectionThumbnail = memo(function SectionThumbnail({
  section,
  index,
  stage,
  displayWidth,
  current = false,
  selected = false,
  onSelect,
}: SectionThumbnailProps) {
  const [screens, setScreens] = useState(1);
  const scale = displayWidth / stage.width;

  return (
    <button
      type="button"
      data-thumbnail={index}
      onClick={() => onSelect(index)}
      className={cn(
        "rounded-tau-sm ease-tau-out relative block flex-none cursor-pointer overflow-hidden text-left transition-shadow duration-[160ms]",
        selected ? "ring-accent shadow-lift ring-2" : "ring-line-1 hover:shadow-lift ring-1"
      )}
      style={{ width: displayWidth, height: stage.height * scale }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `scale(${scale})` }}
      >
        <SlideFrame
          section={section}
          width={stage.width}
          height={stage.height}
          thumbnail
          onPlan={plan => setScreens(plan.steps.length)}
        />
      </div>
      {current && (
        <span className="text-tau-micro bg-accent text-ink-inverse absolute left-2 top-2 rounded-full px-[7px] leading-[18px]">
          当前
        </span>
      )}
      {screens > 1 && (
        <span className="text-tau-micro bg-hover text-ink-2 absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-[7px] leading-[18px] backdrop-blur-[4px]">
          <Layers className="size-[11px]" strokeWidth={1.75} />
          {screens} 屏
        </span>
      )}
      <span className="text-tau-micro text-ink-3 absolute bottom-1.5 right-2 tabular-nums">
        {index + 1}
      </span>
    </button>
  );
});
