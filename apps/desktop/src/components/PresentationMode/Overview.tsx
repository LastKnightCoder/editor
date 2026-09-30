/** 全览：节缩略图网格；键盘选择由放映层统一处理，这里上报实际列数 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Descendant } from "slate";
import type { StageSize } from "./frame";
import { SectionThumbnail } from "./SectionThumbnail";

const MIN_CARD_WIDTH = 300;
const GAP = 22;

interface OverviewProps {
  sections: Descendant[][];
  stage: StageSize;
  current: number;
  selected: number;
  onColumns(columns: number): void;
  onEnter(index: number): void;
}

export function Overview({
  sections,
  stage,
  current,
  selected,
  onColumns,
  onEnter,
}: OverviewProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ columns: 1, cardWidth: MIN_CARD_WIDTH });

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => {
      const width = grid.clientWidth;
      const columns = Math.max(1, Math.floor((width + GAP) / (MIN_CARD_WIDTH + GAP)));
      setLayout({ columns, cardWidth: (width - GAP * (columns - 1)) / columns });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  useEffect(() => onColumns(layout.columns), [layout.columns, onColumns]);

  useEffect(() => {
    gridRef.current
      ?.querySelector(`[data-thumbnail="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <div className="bg-page/95 absolute inset-0 overflow-y-auto px-[90px] pb-20 pt-16 backdrop-blur-md">
      <div className="text-tau-title mb-[22px] flex items-baseline gap-3 font-semibold">
        全览
        <span className="text-tau-sm text-ink-3 font-normal">
          {sections.length} 节 · 方向键选择 · Enter 进入 · Esc 返回
        </span>
      </div>
      <div
        ref={gridRef}
        className="grid"
        style={{ gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`, gap: GAP }}
      >
        {sections.map((section, index) => (
          <SectionThumbnail
            key={index}
            section={section}
            index={index}
            stage={stage}
            displayWidth={layout.cardWidth}
            current={index === current}
            selected={index === selected}
            onSelect={onEnter}
          />
        ))}
      </div>
    </div>
  );
}
