// 通用结构树抽屉：项目 / 知识库详情共用。
// 全部节点平铺传入（Map），按 rootIds 递归渲染；可折叠，当前节点高亮。

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import BottomSheet from "./BottomSheet";

export type StructureTreeNode = {
  id: number;
  title: string;
  childrenIds: number[];
  icon: ReactNode;
  badge?: ReactNode;
};

type StructureTreeSheetProps = {
  open: boolean;
  title: string;
  hint?: string;
  nodes: Map<number, StructureTreeNode>;
  rootIds: number[];
  currentId: number | null;
  onSelect: (id: number) => void;
  onClose: () => void;
};

function TreeRow(props: {
  node: StructureTreeNode;
  depth: number;
  nodes: Map<number, StructureTreeNode>;
  currentId: number | null;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onSelect: (id: number) => void;
}) {
  const { node, depth, nodes, currentId, expanded, onToggle, onSelect } = props;
  const hasChildren = node.childrenIds.length > 0;
  const isOpen = expanded.has(node.id);
  const isCurrent = currentId === node.id;
  return (
    <div>
      <div
        className={`active:bg-hover flex items-center gap-2 rounded-[13px] px-2 py-2 ${
          isCurrent ? "bg-accent-soft" : ""
        }`}
        style={{ marginLeft: depth * 14, position: "relative" }}
        onClick={() => {
          if (hasChildren) {
            onToggle(node.id);
          }
          onSelect(node.id);
        }}
      >
        {hasChildren ? (
          <span
            className={`text-ink-3 grid h-[18px] w-[18px] shrink-0 place-items-center transition-transform ${
              isOpen ? "rotate-90" : ""
            }`}
            onClick={event => {
              event.stopPropagation();
              onToggle(node.id);
            }}
          >
            <ChevronRight size={13} strokeWidth={2.6} />
          </span>
        ) : (
          <span className="h-[18px] w-[18px] shrink-0" />
        )}
        <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[9px]">
          {node.icon}
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-[13.5px] ${
            isCurrent ? "text-accent font-bold" : "text-ink-2 font-semibold"
          }`}
        >
          {node.title}
        </span>
        {node.badge}
      </div>
      {hasChildren && isOpen ? (
        <div className="relative">
          {node.childrenIds.map(childId => {
            const child = nodes.get(childId);
            if (!child) {
              return null;
            }
            return (
              <TreeRow
                key={child.id}
                node={child}
                depth={depth + 1}
                nodes={nodes}
                currentId={currentId}
                expanded={expanded}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function StructureTreeSheet(props: StructureTreeSheetProps) {
  const { open, nodes, rootIds, currentId } = props;
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // 打开时默认展开全部
  useEffect(() => {
    if (!open) {
      return;
    }
    setExpanded(new Set(nodes.keys()));
  }, [open, nodes]);

  const visibleRoots = useMemo(() => rootIds.filter(id => nodes.has(id)), [rootIds, nodes]);

  return (
    <BottomSheet open={open} title={props.title} onClose={props.onClose}>
      {props.hint ? <p className="text-ink-3 -mt-1 mb-3 text-xs">{props.hint}</p> : null}
      <div className="max-h-[52dvh] overflow-y-auto">
        {visibleRoots.map(id => {
          const node = nodes.get(id);
          if (!node) {
            return null;
          }
          return (
            <TreeRow
              key={node.id}
              node={node}
              depth={0}
              nodes={nodes}
              currentId={currentId}
              expanded={expanded}
              onToggle={toggleId =>
                setExpanded(prev => {
                  const next = new Set(prev);
                  if (next.has(toggleId)) {
                    next.delete(toggleId);
                  } else {
                    next.add(toggleId);
                  }
                  return next;
                })
              }
              onSelect={props.onSelect}
            />
          );
        })}
        {visibleRoots.length === 0 ? (
          <p className="text-ink-3 py-6 text-center text-xs">还没有任何节点</p>
        ) : null}
      </div>
    </BottomSheet>
  );
}

export default StructureTreeSheet;
