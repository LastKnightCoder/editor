import React, { useMemo } from "react";
import { useSyncExternalStore } from "react";
import { BoardElement } from "../../types";
import { useBoard } from "../../hooks";
import ElementTree from "./tree/ElementTree";

const Sidebar: React.FC = () => {
  const board = useBoard();
  const { children, selection } = useSyncExternalStore(
    board.subscribe,
    board.getSnapshot,
  );

  const selectedIds = useMemo(
    () => new Set(selection.selectedElements.map((e) => e.id)),
    [selection],
  );

  return (
    <div className="relative w-full h-full flex flex-col">
      <aside className="flex-1 min-h-0 flex flex-col text-text-primary relative overflow-hidden border-r border-gray-200 dark:border-gray-800">
        <div className="flex-1 overflow-hidden px-2">
          <div className="h-full overflow-y-auto overflow-x-hidden custom-scrollbar">
            <div className="py-2 pb-6">
              <ElementTree
                root={children as BoardElement[]}
                selectedIds={selectedIds}
                collapsed={false}
              />
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default Sidebar;
