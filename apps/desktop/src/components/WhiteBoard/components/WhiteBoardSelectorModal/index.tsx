import { useState, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { v4 as getUuid } from "uuid";
import { ChevronRight } from "lucide-react";
import { Dialog, DialogBody } from "@tau/ui";

import Board from "../../Board";
import { ECreateBoardElementType } from "../../types";
import { WhiteBoardElement } from "../../plugins/WhiteBoardPlugin";
import { WhiteBoard as IWhiteBoard, WhiteBoardContent } from "@/types";
import { createWhiteBoardContent, getAllWhiteBoards } from "@/commands/white-board";
import SelectWhiteBoardModal from "@/components/SelectWhiteBoardModal";
import WhiteBoardModal from "@/components/WhiteBoardModal";
import { WHITEBOARD_CARD_HEIGHT } from "../WhiteBoardCard";
import { PageSchematic } from "../../schematic/PageSchematic";

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
  const [selectedWhiteBoards, setSelectedWhiteBoards] = useState<IWhiteBoard[]>([]);
  const [selectWhiteBoardModalOpen, setSelectWhiteBoardModalOpen] = useState(false);
  const [selectSubWhiteBoardModalOpen, setSelectSubWhiteBoardModalOpen] = useState(false);
  const [currentWhiteBoardContents, setCurrentWhiteBoardContents] = useState<WhiteBoardContent[]>(
    []
  );

  useEffect(() => {
    if (open && action === "reference") {
      setSelectWhiteBoardModalOpen(true);
      getAllWhiteBoards().then(whiteBoards => {
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
    }
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
    }
  );

  const handleWhiteBoardSelect = useMemoizedFn(async (whiteBoards: IWhiteBoard[]) => {
    if (whiteBoards.length === 0) return;

    const whiteBoard = whiteBoards[0];

    // 检查是否有多个 SubWhiteBoard
    if (whiteBoard.whiteBoardContentList && whiteBoard.whiteBoardContentList.length > 1) {
      // 有多个，显示选择弹窗
      setCurrentWhiteBoardContents(whiteBoard.whiteBoardContentList);
      setSelectWhiteBoardModalOpen(false);
      setSelectSubWhiteBoardModalOpen(true);
      // 保存选中的 whiteBoard 供后续使用
      setSelectedWhiteBoards([whiteBoard]);
    } else if (whiteBoard.whiteBoardContentList && whiteBoard.whiteBoardContentList.length === 1) {
      // 只有一个，直接创建
      createWhiteBoardElement(whiteBoard.whiteBoardContentList[0], whiteBoard);
      handleCancel();
    }
  });

  const handleSubWhiteBoardSelect = useMemoizedFn((content: WhiteBoardContent) => {
    const whiteBoard = selectedWhiteBoards[0];
    createWhiteBoardElement(content, whiteBoard);
    handleCancel();
  });

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

      {/* 多页白板：选择要嵌入的一页（行式列表，点击即插入） */}
      <Dialog
        open={selectSubWhiteBoardModalOpen}
        onOpenChange={next => !next && handleCancel()}
        title="选择要嵌入的页"
        context={selectedWhiteBoards[0]?.title}
        width={500}
      >
        <DialogBody>
          {currentWhiteBoardContents.length > 0 ? (
            <div className="-mx-2 flex flex-col gap-px">
              {currentWhiteBoardContents.map(item => {
                const count = item.data?.children?.length ?? 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSubWhiteBoardSelect(item)}
                    className="hover:bg-hover ease-tau-out group flex min-h-[52px] w-full items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-left transition-colors duration-150"
                  >
                    <span className="bg-page ring-line-2 relative h-10 w-16 shrink-0 overflow-hidden rounded-[7px] ring-1 ring-inset">
                      <PageSchematic
                        elements={item.data?.children}
                        aspect={1.6}
                        className="absolute inset-0 size-full"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-ink-1 block truncate text-[13px] leading-[1.4]">
                        {item.name}
                      </span>
                      <span className="text-ink-3 block truncate text-[12px]">
                        {count > 0 ? `${count} 个元素` : "空白页"}
                      </span>
                    </span>
                    <ChevronRight
                      className="text-ink-3 size-4 shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                      strokeWidth={1.75}
                    />
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-ink-3 py-6 text-center text-[12.5px]">该白板没有子白板</p>
          )}
        </DialogBody>
      </Dialog>
    </>
  );
};

export default WhiteBoardSelectorModal;
