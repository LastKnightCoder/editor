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
  const nodes = useMemo(() => root, [root]);
  return (
    <div className="pb-2">
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
