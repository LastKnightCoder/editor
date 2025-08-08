import React, { useMemo } from "react";
import { BoardElement } from "../../../types";
import Node from "./Node.tsx";

interface ElementTreeProps {
  root: BoardElement[];
  selectedIds: Set<string>;
  collapsed?: boolean;
}

const ElementTree: React.FC<ElementTreeProps> = ({
  root,
  selectedIds,
  collapsed,
}) => {
  // 反向展示：后插入（覆盖前面的）显示在上面
  const nodes = useMemo(() => (root ? root.slice().reverse() : []), [root]);
  return (
    <div
      className="pb-2"
      onWheel={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      {nodes.map((n) => (
        <Node
          key={n.id}
          element={n}
          depth={0}
          selectedIds={selectedIds}
          collapsed={collapsed}
        />
      ))}
    </div>
  );
};

export default ElementTree;
