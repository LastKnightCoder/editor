import { useEffect, useRef, useState } from "react";

import SketchStroke from "../SketchPaths/SketchStroke";
import { BoardUtil, MindUtil, PathUtil } from "../../utils";
import { hashSeed } from "../../utils/sketch";
import {
  createRangeGeometry,
  summaryBrace,
  type MindBox,
  type MindLayout,
} from "../../utils/mind-layout";
import type { Board, MindNodeElement } from "../../types";
import type { useSketch } from "../../hooks/useSketch";

type LineVisual = { lineColor: string; lineWidth: number; textColor: string };

interface RangeShapes {
  braces: Array<{ id: string; startId: string; d: string }>;
  boundaries: Array<{ id: string; startId: string; title?: string; box: MindBox }>;
}

/** 本节点子节点上的概要括号与外框（按当前显示坐标） */
export function useMindRanges(shown: MindNodeElement, layout: MindLayout): RangeShapes {
  const bothSides = layout.sides.length > 1;
  const axis = layout.siblingAxis(shown.level);
  const geometry = createRangeGeometry(bothSides);
  const braces = MindUtil.visibleChildren(shown).flatMap(child => {
    const range = child.summaryRange;
    const box = range && geometry.rangeBox(shown, range);
    if (!range || !box) return [];
    const side = bothSides ? child.direction : "right";
    return [{ id: child.id, startId: range.startId, d: summaryBrace(box, axis, side, child).d }];
  });
  const boundaries = (shown.boundaries ?? []).flatMap(boundary => {
    const box = geometry.boundaryBox(shown, boundary);
    return box ? [{ id: boundary.id, startId: boundary.startId, title: boundary.title, box }] : [];
  });
  return { braces, boundaries };
}

/** 右键菜单「外框标题」发出，对应外框进入标题编辑 */
export const EDIT_BOUNDARY_EVENT = "tau.mind.edit-boundary";

const commitBoundaryTitle = (board: Board, rootId: string, boundaryId: string, title: string) => {
  const root = BoardUtil.getElementById(board, rootId) as MindNodeElement | null;
  const path = root && PathUtil.getPathByElement(board, root);
  const next = root && MindUtil.updateBoundary(root, boundaryId, title.trim() || undefined);
  if (!root || !path || !next) return;
  const ops = BoardUtil.diffNode(root, next, path);
  BoardUtil.normalizeOperations(ops);
  board.apply(ops);
};

export function MindRanges({
  board,
  rootId,
  ranges,
  lineOf,
  dark,
  sketch,
}: {
  board: Board;
  rootId: string;
  ranges: RangeShapes;
  lineOf: (childId: string) => LineVisual;
  dark: boolean;
  sketch: ReturnType<typeof useSketch>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const cancelled = useRef(false);
  const ids = ranges.boundaries.map(boundary => boundary.id).join(",");

  useEffect(() => {
    const handle = (boundaryId: string) => {
      if (ids.split(",").includes(boundaryId)) setEditing(boundaryId);
    };
    board.on(EDIT_BOUNDARY_EVENT, handle);
    return () => board.off(EDIT_BOUNDARY_EVENT, handle);
  }, [board, ids]);

  if (!ranges.braces.length && !ranges.boundaries.length) return null;

  return (
    <g>
      {ranges.boundaries.map(({ id, startId, title, box }) => {
        const line = lineOf(startId);
        const startEditing = (e: React.MouseEvent) => {
          if (board.readonly) return;
          e.stopPropagation();
          setEditing(id);
        };
        return (
          <g key={id}>
            <rect
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              rx={12}
              fill={line.lineColor}
              fillOpacity={dark ? 0.1 : 0.07}
              stroke={line.lineColor}
              strokeOpacity={0.55}
              strokeWidth={1.25}
              strokeDasharray="5 4"
              style={{ pointerEvents: "visibleStroke" }}
              onDoubleClick={startEditing}
            />
            {editing === id ? (
              <foreignObject
                x={box.x + 8}
                y={box.y + 2}
                width={Math.max(120, box.width - 16)}
                height={22}
              >
                <input
                  autoFocus
                  defaultValue={title ?? ""}
                  placeholder="外框标题"
                  className="w-full rounded-[4px] border border-[var(--tau-line-1)] bg-[var(--tau-surface-1)] px-1.5 text-[11.5px] font-semibold text-[var(--tau-ink-1)] outline-none"
                  onPointerDown={e => e.stopPropagation()}
                  onKeyDown={e => {
                    e.stopPropagation();
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") {
                      cancelled.current = true;
                      e.currentTarget.blur();
                    }
                  }}
                  onBlur={e => {
                    if (!cancelled.current)
                      commitBoundaryTitle(board, rootId, id, e.currentTarget.value);
                    cancelled.current = false;
                    setEditing(null);
                  }}
                />
              </foreignObject>
            ) : title ? (
              <text
                x={box.x + 12}
                y={box.y + 15}
                fontSize={11.5}
                fontWeight={600}
                fill={line.textColor}
                className="select-none"
                onDoubleClick={startEditing}
              >
                {title}
              </text>
            ) : null}
          </g>
        );
      })}
      {ranges.braces.map(({ id, startId, d }) => {
        const line = lineOf(startId);
        return sketch.enabled ? (
          <SketchStroke
            key={id}
            d={d}
            color={line.lineColor}
            strokeWidth={2}
            level={sketch.level}
            seed={(sketch.seed ^ hashSeed(id)) >>> 0}
          />
        ) : (
          <path
            key={id}
            d={d}
            stroke={line.lineColor}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </g>
  );
}
