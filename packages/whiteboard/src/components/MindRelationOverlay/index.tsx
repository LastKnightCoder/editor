import { useStore } from "zustand";

import type Board from "../../Board";
import type { MindNodeElement } from "../../types";
import { BoardUtil } from "../../utils";
import { relationStoreOf } from "../../utils/mindRelation";

/** 联系线模式：从起点节点中心拉一条虚线跟随指针 */
const MindRelationOverlay = ({ board }: { board: Board }) => {
  const { sourceId, pointer } = useStore(relationStoreOf(board));
  const source = sourceId
    ? (BoardUtil.getElementById(board, sourceId) as MindNodeElement | null)
    : null;
  if (!source || !pointer) return null;
  const from = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  return (
    <g data-layer="mind-relation-pending" pointerEvents="none">
      <line
        x1={from.x}
        y1={from.y}
        x2={pointer.x}
        y2={pointer.y}
        stroke="var(--tau-ink-2)"
        strokeWidth={1.6}
        strokeDasharray="2 4"
        strokeLinecap="round"
      />
      <circle cx={pointer.x} cy={pointer.y} r={3.5} fill="var(--tau-ink-2)" />
    </g>
  );
};

export default MindRelationOverlay;
