import { memo, useMemo } from "react";
import { produce } from "immer";
import { Dices, PenLine } from "lucide-react";
import { Button } from "@tau/ui";

import type { BoardElement, SketchFillStyle, SketchLevel, SketchMode } from "../../types";
import { SKETCH_FILL_OPTIONS, SKETCH_LEVEL_OPTIONS, SKETCH_MODE_OPTIONS } from "../../constants";
import { usePageSketch, useSketch } from "../../hooks";
import { sketchShape } from "../../utils/sketch";
import { AttrPopover, Field, OptionGrid } from "../../chrome";
import SketchPaths from "../SketchPaths";

type ModeChoice = SketchMode | "inherit";

interface SketchPopoverProps<T extends BoardElement> {
  /** 存覆盖的元素：一般是选中元素本身，思维导图是根节点 */
  target: T;
  onChange: (next: T) => void;
  /** 形状才有：填充样式（有填充色时显示） */
  fill?: {
    color?: string;
    style?: SketchFillStyle;
    onChange: (style: SketchFillStyle) => void;
  };
}

/**
 * 元素级「笔触」（D-106）：画风（跟随页面 / 手绘 / 普通）· 笔触档位 · 填充 · 换一笔。
 * 未单独设置的字段跟随页面，选「跟随页面」即删除覆盖。
 */
function SketchPopover<T extends BoardElement>({ target, onChange, fill }: SketchPopoverProps<T>) {
  const page = usePageSketch();
  const sketch = useSketch(target);
  const own = target.sketch ?? {};
  const pageModeLabel = page.mode === "sketch" ? "手绘" : "普通";

  const update = (recipe: (draft: NonNullable<BoardElement["sketch"]>) => void) => {
    onChange(
      produce(target, draft => {
        const next = { ...(draft.sketch ?? {}) };
        recipe(next);
        (Object.keys(next) as (keyof typeof next)[]).forEach(key => {
          if (next[key] === undefined) delete next[key];
        });
        draft.sketch = Object.keys(next).length ? next : undefined;
      })
    );
  };

  const modeOptions = [
    { value: "inherit" as ModeChoice, label: `跟随页面 · ${pageModeLabel}` },
    ...SKETCH_MODE_OPTIONS,
  ];
  const hasFill = !!fill?.color && fill.color !== "none" && fill.color !== "transparent";

  return (
    <AttrPopover label="笔触" icon={<PenLine strokeWidth={1.75} />} width={292}>
      <Field label="画风">
        <OptionGrid<ModeChoice>
          cols={3}
          options={modeOptions.map(o => ({ value: o.value, label: o.label }))}
          value={own.mode ?? "inherit"}
          onChange={v =>
            update(draft => {
              draft.mode = v === "inherit" ? undefined : v;
            })
          }
        />
      </Field>
      {sketch.enabled ? (
        <>
          <Field label="笔触" value={own.level ? undefined : "跟随页面"}>
            <OptionGrid<SketchLevel>
              cols={3}
              tall
              options={SKETCH_LEVEL_OPTIONS.map(o => ({
                value: o.value,
                label: o.label,
                glyph: <SketchGlyph level={o.value} seed={sketch.seed} />,
              }))}
              value={sketch.level}
              onChange={v =>
                update(draft => {
                  draft.level = v === page.level ? undefined : v;
                })
              }
            />
          </Field>
          {fill && hasFill && (
            <Field label="填充">
              <OptionGrid<SketchFillStyle>
                cols={4}
                tall
                options={SKETCH_FILL_OPTIONS.map(o => ({
                  value: o.value,
                  label: o.label,
                  glyph: (
                    <SketchGlyph
                      level={sketch.level}
                      seed={sketch.seed}
                      fillStyle={o.value}
                      fill={fill.color}
                    />
                  ),
                }))}
                value={fill.style ?? "solid"}
                onChange={fill.onChange}
              />
            </Field>
          )}
          <div className="border-line-2 mt-3 flex items-center gap-2.5 border-t pt-3">
            <Button
              variant="soft"
              size="sm"
              icon={Dices}
              onClick={() =>
                update(draft => {
                  draft.seed = Math.floor(Math.random() * 2147483647);
                })
              }
            >
              换一笔
            </Button>
            <span className="text-ink-3 text-tau-tiny leading-snug">
              笔迹固定存在元素上，拖动、缩放不会重抖
            </span>
          </div>
        </>
      ) : (
        <p className="text-ink-3 text-tau-micro mt-2 leading-relaxed">
          普通模式按原样渲染：直线、实色填充、正文字体。
          {page.mode === "sketch" && "页面是手绘，这个元素单独设成了普通。"}
        </p>
      )}
    </AttrPopover>
  );
}

/** 选项缩略图：用真实的手绘引擎画一个小方块 */
const SketchGlyph = memo(
  ({
    level,
    seed,
    fillStyle,
    fill,
  }: {
    level: SketchLevel;
    seed: number;
    fillStyle?: SketchFillStyle;
    fill?: string;
  }) => {
    const paths = useMemo(
      () =>
        sketchShape({
          outline: { kind: "rect", cornerRadius: 3 },
          width: 30,
          height: 18,
          stroke: "currentColor",
          strokeWidth: 1.4,
          fill,
          fillStyle,
          level,
          seed,
        }),
      [level, seed, fillStyle, fill]
    );
    return (
      <svg width={38} height={26} viewBox="-4 -4 38 26" aria-hidden className="overflow-visible">
        <SketchPaths paths={paths} />
      </svg>
    );
  }
);

export default SketchPopover;
