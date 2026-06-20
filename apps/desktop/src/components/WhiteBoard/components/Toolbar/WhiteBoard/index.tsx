import { useState } from "react";
import { useMemoizedFn } from "ahooks";
import SVG from "react-inlinesvg";
import whiteBoardIcon from "@/assets/icons/white-board.svg";
import { Tooltip, Popover } from "antd";
import { Plus, Link2 } from "lucide-react";
import { useBoard } from "../../../hooks";
import { ECreateBoardElementType } from "../../../types";
import WhiteBoardSelectorModal from "../../WhiteBoardSelectorModal";
import ToolbarMenu, { ToolbarMenuItem } from "../ToolbarMenu";

interface WhiteBoardProps {
  className?: string;
  style?: React.CSSProperties;
}

const WhiteBoard = (props: WhiteBoardProps) => {
  const { className, style } = props;
  const board = useBoard();

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [selectorModalOpen, setSelectorModalOpen] = useState(false);
  const [selectorAction, setSelectorAction] = useState<"create" | "reference">(
    "create",
  );

  const openSelectorModal = useMemoizedFn((action: "create" | "reference") => {
    setPopoverOpen(false);
    setSelectorAction(action);
    setSelectorModalOpen(true);
    board.currentCreateType = ECreateBoardElementType.WhiteBoard;
  });

  const handleCancel = useMemoizedFn(() => {
    setSelectorModalOpen(false);
    board.currentCreateType = ECreateBoardElementType.None;
  });

  const menuItems: ToolbarMenuItem[] = [
    {
      key: "create",
      label: "创建新白板",
      icon: <Plus size={16} />,
      onSelect: () => openSelectorModal("create"),
    },
    {
      key: "reference",
      label: "引用已有白板",
      icon: <Link2 size={16} />,
      onSelect: () => openSelectorModal("reference"),
    },
  ];

  return (
    <div>
      <Popover
        open={popoverOpen}
        onOpenChange={setPopoverOpen}
        trigger={["click"]}
        placement="bottom"
        arrow={false}
        content={<ToolbarMenu items={menuItems} />}
        styles={{
          container: {
            background: "transparent",
            boxShadow: "none",
            padding: 0,
          },
        }}
      >
        <Tooltip title="白板">
          <div className={className} style={style}>
            <SVG src={whiteBoardIcon} />
          </div>
        </Tooltip>
      </Popover>

      <div onClick={(e) => e.stopPropagation()}>
        <WhiteBoardSelectorModal
          open={selectorModalOpen}
          onClose={handleCancel}
          board={board}
          action={selectorAction}
        />
      </div>
    </div>
  );
};

export default WhiteBoard;
