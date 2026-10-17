import { memo, useMemo } from "react";
import { produce } from "immer";
import { Dices, PenLine } from "lucide-react";
import { Button } from "@tau/ui";
import type { BoardElement } from "../types/element";
import type {
  ElementSketch,
  PageSketch,
  SketchFillStyle,
  SketchLevel,
  SketchMode,
} from "../types/sketch";
import {
  SKETCH_FILL_OPTIONS,
  SKETCH_LEVEL_OPTIONS,
  SKETCH_MODE_OPTIONS,
} from "../constants/sketch";
import { usePageSketch, useSketch } from "../extensions/authorHooks";
import { patchSketch } from "../utils/sketch/patch";
import { sketchShape } from "../utils/sketch/shape";
import { AttrPopover, Field, OptionGrid } from "../chrome";
import SketchPaths from "./SketchPaths";
type ModeChoice = SketchMode | "inherit";

export const randomSeed = () => Math.floor(Math.random() * 2147483647);

export const isPaintedFill = (color?: string) =>
  !!color && color !== "none" && color !== "transparent";

interface SketchFieldsProps {
  page: PageSketch;
  /** 当前画风选项；多选不一致时为 null（不高亮） */
  mode: ModeChoice | null;
  level: SketchLevel | null;
  levelFollowsPage: boolean;
  /** 是否有元素生效为手绘：决定是否展示笔触 / 填充 / 换一笔 */
  enabled: boolean;
  seed: number;
  fill?: { color: string; style: SketchFillStyle | null };
  onMode: (v: ModeChoice) => void;
  onLevel: (v: SketchLevel) => void;
  onFillStyle: (v: SketchFillStyle) => void;
  onReseed: () => void;
  hint?: string;
}

/** 单选与多选共用的「笔触」弹层内容 */
export function SketchFields(props: SketchFieldsProps) {
  const { page, mode, level, levelFollowsPage, enabled, seed, fill, hint } = props;
  const pageModeLabel = page.mode === "sketch" ? "手绘" : "普通";
  const modeOptions = [
    { value: "inherit" as ModeChoice, label: `跟随页面 · ${pageModeLabel}` },
    ...SKETCH_MODE_OPTIONS,
  ];
  const glyphLevel = level ?? page.level;

  return (
    <>
      <Field label="画风">
        <OptionGrid<ModeChoice>
          cols={3}
          options={modeOptions.map(o => ({ value: o.value, label: o.label }))}
          value={mode}
          onChange={props.onMode}
        />
      </Field>
      {enabled ? (
        <>
          <Field label="笔触" value={levelFollowsPage ? "跟随页面" : undefined}>
            <OptionGrid<SketchLevel>
              cols={3}
              tall
              options={SKETCH_LEVEL_OPTIONS.map(o => ({
                value: o.value,
                label: o.label,
                glyph: <SketchGlyph level={o.value} seed={seed} />,
              }))}
              value={level}
              onChange={props.onLevel}
            />
          </Field>
          {fill && (
            <Field label="填充">
              <OptionGrid<SketchFillStyle>
                cols={4}
                tall
                options={SKETCH_FILL_OPTIONS.map(o => ({
                  value: o.value,
                  label: o.label,
                  glyph: (
                    <SketchGlyph
                      level={glyphLevel}
                      seed={seed}
                      fillStyle={o.value}
                      fill={fill.color}
                    />
                  ),
                }))}
                value={fill.style}
                onChange={props.onFillStyle}
              />
            </Field>
          )}
          <div className="border-line-2 mt-3 flex items-center gap-2.5 border-t pt-3">
            <Button variant="soft" size="sm" icon={Dices} onClick={props.onReseed}>
              换一笔
            </Button>
            <span className="text-ink-3 text-tau-tiny leading-snug">
              {hint ?? "笔迹固定存在元素上，拖动、缩放不会重抖"}
            </span>
          </div>
        </>
      ) : (
        <p className="text-ink-3 text-tau-micro mt-2 leading-relaxed">
          普通模式按原样渲染：直线、实色填充、正文字体。
        </p>
      )}
    </>
  );
}

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
 * 元素级「笔触」（D-107）：画风（跟随页面 / 手绘 / 普通）· 笔触档位 · 填充 · 换一笔。
 * 未单独设置的字段跟随页面，选「跟随页面」即删除覆盖。
 */
function SketchPopover<T extends BoardElement>({ target, onChange, fill }: SketchPopoverProps<T>) {
  const page = usePageSketch();
  const sketch = useSketch(target);
  const own = target.sketch ?? {};

  const update = (patch: Partial<Record<keyof ElementSketch, unknown>>) =>
    onChange(
      produce(target, draft => {
        draft.sketch = patchSketch(draft.sketch, patch);
      })
    );

  return (
    <AttrPopover label="笔触" icon={<PenLine strokeWidth={1.75} />} width={292}>
      <SketchFields
        page={page}
        mode={own.mode ?? "inherit"}
        level={sketch.level}
        levelFollowsPage={!own.level}
        enabled={sketch.enabled}
        seed={sketch.seed}
        fill={
          fill && isPaintedFill(fill.color)
            ? { color: fill.color as string, style: fill.style ?? "solid" }
            : undefined
        }
        onMode={v => update({ mode: v === "inherit" ? undefined : v })}
        onLevel={v => update({ level: v === page.level ? undefined : v })}
        onFillStyle={v => fill?.onChange(v)}
        onReseed={() => update({ seed: randomSeed() })}
        hint={
          !sketch.enabled && page.mode === "sketch"
            ? "页面是手绘，这个元素单独设成了普通。"
            : undefined
        }
      />
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
