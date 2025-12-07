import { useState } from "react";
import { useMemoizedFn } from "ahooks";
import SVG from "react-inlinesvg";
import whiteBoardIcon from "@/assets/icons/white-board.svg";
import { Dropdown, Tooltip } from "antd";
import type { MenuProps } from "antd";
import { v4 as getUuid } from "uuid";
import CreateWhiteBoardModal from "./CreateWhiteBoardModal";
import SelectWhiteBoardModal from "@/components/SelectWhiteBoardModal";
import SelectSubWhiteBoardModal from "./SelectSubWhiteBoardModal";
import { WhiteBoard as IWhiteBoard, WhiteBoardContent } from "@/types";
import { useBoard } from "../../../hooks";
import { ECreateBoardElementType } from "../../../types";
import { WhiteBoardElement } from "../../../plugins/WhiteBoardPlugin";
import { createWhiteBoardContent, getAllWhiteBoards } from "@/commands";

interface WhiteBoardProps {
  className?: string;
  style?: React.CSSProperties;
}

const WhiteBoard = (props: WhiteBoardProps) => {
  const { className, style } = props;
  const board = useBoard();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectWhiteBoardModalOpen, setSelectWhiteBoardModalOpen] =
    useState(false);
  const [selectSubWhiteBoardModalOpen, setSelectSubWhiteBoardModalOpen] =
    useState(false);

  const [allWhiteBoards, setAllWhiteBoards] = useState<IWhiteBoard[]>([]);
  const [selectedWhiteBoards, setSelectedWhiteBoards] = useState<IWhiteBoard[]>(
    [],
  );
  const [currentWhiteBoardContents, setCurrentWhiteBoardContents] = useState<
    WhiteBoardContent[]
  >([]);

  const handleCreateClick = useMemoizedFn(() => {
    setCreateModalOpen(true);
    board.currentCreateType = ECreateBoardElementType.WhiteBoard;
  });

  const handleReferenceClick = useMemoizedFn(async () => {
    setSelectWhiteBoardModalOpen(true);
    board.currentCreateType = ECreateBoardElementType.WhiteBoard;

    const whiteBoards = await getAllWhiteBoards();
    setAllWhiteBoards(whiteBoards);
  });

  const createWhiteBoardElement = useMemoizedFn(
    (whiteBoardContent: WhiteBoardContent, whiteBoard: IWhiteBoard) => {
      const { minX, minY, width, height } = board.viewPort;
      const center = {
        x: minX + width / 2,
        y: minY + height / 2,
      };
      const whiteboardWidth = 400;
      const whiteboardHeight = 300;

      const element: WhiteBoardElement = {
        id: getUuid(),
        type: "whiteboard",
        whiteBoardContentId: whiteBoardContent.id,
        name: whiteBoardContent.name,
        description: whiteBoard.description,
        snapshot: whiteBoard.snapshot,
        x: center.x - whiteboardWidth / 2,
        y: center.y - whiteboardHeight / 2,
        width: whiteboardWidth,
        height: whiteboardHeight,
        resized: false,
        maxWidth: whiteboardWidth,
        maxHeight: whiteboardHeight,
      };

      board.apply([
        {
          type: "insert_node",
          path: [board.children.length],
          node: element,
        },
        {
          type: "set_selection",
          properties: board.selection,
          newProperties: {
            selectArea: null,
            selectedElements: [element],
          },
        },
      ]);
    },
  );

  const handleCreateOk = useMemoizedFn(
    async (name: string, description: string, snapshot?: string) => {
      // 创建新的白板内容
      const content = await createWhiteBoardContent({
        data: {
          children: [],
          viewPort: { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
          selection: { selectArea: null, selectedElements: [] },
          presentationSequences: [],
        },
        name,
        imgUrl: snapshot || "",
      });

      // 创建一个临时的 WhiteBoard 对象用于传递 description 和 snapshot
      const tempWhiteBoard: IWhiteBoard = {
        id: -1, // 临时 ID
        title: name,
        description,
        snapshot: snapshot || "",
        tags: [],
        whiteBoardContentIds: [content.id],
        whiteBoardContentList: [content],
        createTime: Date.now(),
        updateTime: Date.now(),
      };

      createWhiteBoardElement(content, tempWhiteBoard);

      setCreateModalOpen(false);
      board.currentCreateType = ECreateBoardElementType.None;
    },
  );

  const handleWhiteBoardSelect = useMemoizedFn(
    async (whiteBoards: IWhiteBoard[]) => {
      if (whiteBoards.length === 0) return;

      const whiteBoard = whiteBoards[0];

      // 检查是否有多个 SubWhiteBoard
      if (
        whiteBoard.whiteBoardContentList &&
        whiteBoard.whiteBoardContentList.length > 1
      ) {
        // 有多个，显示选择弹窗
        setCurrentWhiteBoardContents(whiteBoard.whiteBoardContentList);
        setSelectWhiteBoardModalOpen(false);
        setSelectSubWhiteBoardModalOpen(true);
        // 保存选中的 whiteBoard 供后续使用
        setSelectedWhiteBoards([whiteBoard]);
      } else if (
        whiteBoard.whiteBoardContentList &&
        whiteBoard.whiteBoardContentList.length === 1
      ) {
        // 只有一个，直接创建
        createWhiteBoardElement(
          whiteBoard.whiteBoardContentList[0],
          whiteBoard,
        );
        setSelectWhiteBoardModalOpen(false);
        setSelectedWhiteBoards([]);
        board.currentCreateType = ECreateBoardElementType.None;
      }
    },
  );

  const handleSubWhiteBoardSelect = useMemoizedFn(
    (content: WhiteBoardContent) => {
      const whiteBoard = selectedWhiteBoards[0];
      createWhiteBoardElement(content, whiteBoard);

      setSelectSubWhiteBoardModalOpen(false);
      setSelectedWhiteBoards([]);
      setCurrentWhiteBoardContents([]);
      board.currentCreateType = ECreateBoardElementType.None;
    },
  );

  const handleCancel = useMemoizedFn(() => {
    setCreateModalOpen(false);
    setSelectWhiteBoardModalOpen(false);
    setSelectSubWhiteBoardModalOpen(false);
    setSelectedWhiteBoards([]);
    setCurrentWhiteBoardContents([]);
    board.currentCreateType = ECreateBoardElementType.None;
  });

  const menuItems: MenuProps["items"] = [
    {
      key: "create",
      label: "创建新白板",
      onClick: handleCreateClick,
    },
    {
      key: "reference",
      label: "引用已有白板",
      onClick: handleReferenceClick,
    },
  ];

  return (
    <div>
      <Dropdown menu={{ items: menuItems }} trigger={["click"]}>
        <Tooltip title="白板">
          <div className={className} style={style}>
            <SVG src={whiteBoardIcon} />
          </div>
        </Tooltip>
      </Dropdown>

      <div onClick={(e) => e.stopPropagation()}>
        <CreateWhiteBoardModal
          open={createModalOpen}
          onCancel={handleCancel}
          onOk={handleCreateOk}
        />

        <SelectWhiteBoardModal
          open={selectWhiteBoardModalOpen}
          title="选择白板"
          multiple={false}
          onCancel={handleCancel}
          onChange={setSelectedWhiteBoards}
          onOk={handleWhiteBoardSelect}
          selectedWhiteBoards={selectedWhiteBoards}
          allWhiteBoards={allWhiteBoards}
        />

        <SelectSubWhiteBoardModal
          open={selectSubWhiteBoardModalOpen}
          whiteBoardContents={currentWhiteBoardContents}
          onSelect={handleSubWhiteBoardSelect}
          onCancel={handleCancel}
        />
      </div>
    </div>
  );
};

export default WhiteBoard;
