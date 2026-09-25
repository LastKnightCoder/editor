import React, { useMemo } from "react";
import { BoardElement } from "../../../types";
import Node from "./Node.tsx";

interface ElementTreeProps {
  root: BoardElement[];
  selectedIds: Set<string>;
}

const ElementTree: React.FC<ElementTreeProps> = ({ root, selectedIds }) => {
  const nodes = useMemo(() => (root ? root.slice().reverse() : []), [root]);
  return (
    <div>
      {nodes.map(n => (
        <Node key={n.id} element={n} depth={0} selectedIds={selectedIds} />
      ))}
    </div>
  );
};

export default ElementTree;
