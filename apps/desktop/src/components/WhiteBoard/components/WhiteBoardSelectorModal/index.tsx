import { useState, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { v4 as getUuid } from "uuid";
import { Modal, List, Empty } from "antd";

import Board from "../../Board";
import { ECreateBoardElementType } from "../../types";
import { WhiteBoardElement } from "../../plugins/WhiteBoardPlugin";
import { WhiteBoard as IWhiteBoard, WhiteBoardContent } from "@/types";
import {
  createWhiteBoardContent,
  getAllWhiteBoards,
} from "@/commands/white-board";
import SelectWhiteBoardModal from "@/components/SelectWhiteBoardModal";
import WhiteBoardModal from "@/components/WhiteBoardModal";
import { WHITEBOARD_CARD_HEIGHT } from "../WhiteBoardCard";

interface WhiteBoardSelectorModalProps {
  open: boolean;
  onClose: () => void;
  board: Board;
  action?: "create" | "reference";
}

const WhiteBoardSelectorModal = ({
  open,
  onClose,
  board,
  action = "create",
}: WhiteBoardSelectorModalProps) => {
  // Reference modal state
  const [allWhiteBoards, setAllWhiteBoards] = useState<IWhiteBoard[]>([]);
  const [selectedWhiteBoards, setSelectedWhiteBoards] = useState<IWhiteBoard[]>(
    [],
  );
  const [selectWhiteBoardModalOpen, setSelectWhiteBoardModalOpen] =
    useState(false);
  const [selectSubWhiteBoardModalOpen, setSelectSubWhiteBoardModalOpen] =
    useState(false);
  const [currentWhiteBoardContents, setCurrentWhiteBoardContents] = useState<
    WhiteBoardContent[]
  >([]);

  useEffect(() => {
    if (open && action === "reference") {
      setSelectWhiteBoardModalOpen(true);
      getAllWhiteBoards().then((whiteBoards) => {
        setAllWhiteBoards(whiteBoards);
      });
    }
  }, [open, action]);

  const createWhiteBoardElement = useMemoizedFn(
    (whiteBoardContent: WhiteBoardContent, whiteBoard: IWhiteBoard) => {
      const { minX, minY, width, height } = board.viewPort;
      const center = {
        x: minX + width / 2,
        y: minY + height / 2,
      };
      const whiteboardWidth = 300;
      const whiteboardHeight = WHITEBOARD_CARD_HEIGHT; // 使用固定高度

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
        resizable: true, // 支持水平拖拽调整宽度
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
      try {
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
          id: -1,
          title: name,
          description,
          snapshot: snapshot || "",
          tags: [],
          whiteBoardContentIds: [content.id],
          whiteBoardContentList: [content],
          activeWhiteBoardContentId: content.id,
          createTime: Date.now(),
          updateTime: Date.now(),
        };

        createWhiteBoardElement(content, tempWhiteBoard);
        handleCancel();
      } catch (error) {
        console.error("Create whiteboard failed:", error);
      }
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
        handleCancel();
      }
    },
  );

  const handleSubWhiteBoardSelect = useMemoizedFn(
    (content: WhiteBoardContent) => {
      const whiteBoard = selectedWhiteBoards[0];
      createWhiteBoardElement(content, whiteBoard);
      handleCancel();
    },
  );

  const handleCancel = useMemoizedFn(() => {
    setSelectWhiteBoardModalOpen(false);
    setSelectSubWhiteBoardModalOpen(false);
    setSelectedWhiteBoards([]);
    setCurrentWhiteBoardContents([]);
    board.currentCreateType = ECreateBoardElementType.None;
    onClose();
  });

  // Render create modal
  if (action === "create") {
    return (
      <WhiteBoardModal
        open={open}
        onCancel={handleCancel}
        onOk={handleCreateOk}
        modalTitle="创建新白板"
        okText="创建"
      />
    );
  }

  // Render reference modals
  return (
    <>
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

      <Modal
        title="选择子白板"
        open={selectSubWhiteBoardModalOpen}
        onCancel={handleCancel}
        footer={null}
        width={600}
      >
        {currentWhiteBoardContents.length > 0 ? (
          <List
            dataSource={currentWhiteBoardContents}
            renderItem={(item) => (
              <List.Item
                className="cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors px-4"
                onClick={() => handleSubWhiteBoardSelect(item)}
              >
                <div className="flex flex-col gap-1">
                  <div className="font-medium">{item.name}</div>
                  <div className="text-sm text-gray-500">
                    创建时间: {new Date(item.createTime).toLocaleString()}
                  </div>
                </div>
              </List.Item>
            )}
          />
        ) : (
          <Empty description="该白板没有子白板" />
        )}
      </Modal>
    </>
  );
};

export default WhiteBoardSelectorModal;
