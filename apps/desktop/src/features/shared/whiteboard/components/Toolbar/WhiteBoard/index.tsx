import { useState } from "react";
import { useMemoizedFn } from "ahooks";
import { Plus, Link2, Presentation } from "lucide-react";
import { useBoard } from "@tau/whiteboard";
import { ECreateBoardElementType } from "@tau/whiteboard";
import WhiteBoardSelectorModal from "../../WhiteBoardSelectorModal";
import { ToolMenu, type ToolMenuItem } from "@tau/whiteboard";

const WhiteBoard = () => {
  const board = useBoard();

  const [selectorModalOpen, setSelectorModalOpen] = useState(false);
  const [selectorAction, setSelectorAction] = useState<"create" | "reference">("create");

  const openSelectorModal = useMemoizedFn((action: "create" | "reference") => {
    setSelectorAction(action);
    setSelectorModalOpen(true);
    board.currentCreateType = ECreateBoardElementType.WhiteBoard;
  });

  const handleCancel = useMemoizedFn(() => {
    setSelectorModalOpen(false);
    board.currentCreateType = ECreateBoardElementType.None;
  });

  const menuItems: ToolMenuItem[] = [
    {
      key: "create",
      label: "创建新白板",
      icon: Plus,
      onSelect: () => openSelectorModal("create"),
    },
    {
      key: "reference",
      label: "引用已有白板",
      icon: Link2,
      onSelect: () => openSelectorModal("reference"),
    },
  ];

  return (
    <>
      <ToolMenu label="白板" icon={<Presentation strokeWidth={1.75} />} items={menuItems} />

      <div className="contents" onClick={e => e.stopPropagation()}>
        <WhiteBoardSelectorModal
          open={selectorModalOpen}
          onClose={handleCancel}
          board={board}
          action={selectorAction}
        />
      </div>
    </>
  );
};

export default WhiteBoard;
