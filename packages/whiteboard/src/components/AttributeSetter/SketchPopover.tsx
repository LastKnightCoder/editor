import { useMemo } from "react";
import type { BoardElement, ElementSketch, SketchFillStyle, SketchMode } from "../../types";
import { useBoard, usePageSketch } from "../../hooks";
import { buildSketchOps, getSketchTargets, patchSketch, resolveSketch } from "../../utils/sketch";
import { AttrPopover } from "../../chrome";
import { PenLine } from "lucide-react";
import { SketchFields, randomSeed, isPaintedFill } from "../SketchPopover";
export { default } from "../SketchPopover";
type ModeChoice = SketchMode | "inherit";
/** 多选时所有元素取同一个值才高亮，否则返回 null */
function common<T>(values: T[]): T | null {
  return values.length > 0 && values.every(v => v === values[0]) ? values[0] : null;
}

/**
 * 多选批量「笔触」：只改 sketch / fillStyle 两个字段，直接生成 set_node，
 * 不走多选的平移写回。思维导图节点归到根节点（覆盖存在根上），重复的根只改一次。
 */
export function MultiSketchPopover({ elements }: { elements: BoardElement[] }) {
  const board = useBoard();
  const page = usePageSketch();

  const targets = useMemo(() => getSketchTargets(board, elements), [board, elements]);

  if (targets.length === 0) return null;

  const resolved = targets.map(t =>
    resolveSketch(page, t, undefined, board.extensions?.supportsSketch(t.type))
  );
  const geometries = targets.filter(t => t.type === "geometry" && isPaintedFill(t.fill));

  const apply: (recipe: Parameters<typeof buildSketchOps>[2]) => void = recipe => {
    const ops = buildSketchOps(board, targets, recipe);
    if (ops.length) board.apply(ops);
  };
  const updateSketch = (
    patch: (el: BoardElement) => Partial<Record<keyof ElementSketch, unknown>>
  ) => apply(el => ({ sketch: patchSketch(el.sketch, patch(el)) }));

  const ownModes = targets.map(t => t.sketch?.mode ?? "inherit");
  return (
    <AttrPopover
      label={`笔触 · ${targets.length} 个`}
      icon={<PenLine strokeWidth={1.75} />}
      width={292}
    >
      <SketchFields
        page={page}
        mode={common<ModeChoice>(ownModes)}
        level={common(resolved.map(r => r.level))}
        levelFollowsPage={targets.every(t => !t.sketch?.level)}
        enabled={resolved.some(r => r.enabled)}
        seed={resolved[0].seed}
        fill={
          geometries.length
            ? {
                color: geometries[0].fill as string,
                style: common(geometries.map(g => (g.fillStyle as SketchFillStyle) ?? "solid")),
              }
            : undefined
        }
        onMode={v => updateSketch(() => ({ mode: v === "inherit" ? undefined : v }))}
        onLevel={v => updateSketch(() => ({ level: v === page.level ? undefined : v }))}
        onFillStyle={v =>
          apply(el => (el.type === "geometry" && isPaintedFill(el.fill) ? { fillStyle: v } : null))
        }
        onReseed={() => updateSketch(() => ({ seed: randomSeed() }))}
        hint="每个元素各换一笔"
      />
    </AttrPopover>
  );
}
