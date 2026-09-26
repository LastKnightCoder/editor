import { useState, useEffect, useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import { v4 as getUuid } from "uuid";

import Board from "../../Board";
import { ECreateBoardElementType } from "../../types";
import { WhiteBoardElement } from "../../plugins/WhiteBoardPlugin";
import { WhiteBoard as IWhiteBoard } from "@/types";
import { getAllWhiteBoards } from "@/commands/white-board";
import SelectWhiteBoardModal from "@/components/SelectWhiteBoardModal";
import { WhiteboardInfoDialog } from "@/features/whiteboards/components/WhiteboardInfoDialog";
import { useWhiteboardMutations, useWhiteboards } from "@/features/whiteboards/queries";
import { rankTags } from "@/features/whiteboards/model";
import { WHITEBOARD_CARD_HEIGHT } from "../WhiteBoardCard";

interface WhiteBoardSelectorModalProps {
  open: boolean;
  onClose: () => void;
  board: Board;
  action?: "create" | "reference";
}

/** 插入白板卡片：新建一块白板，或引用已有白板（整块白板，双击打开详情） */
const WhiteBoardSelectorModal = ({
  open,
  onClose,
  board,
  action = "create",
}: WhiteBoardSelectorModalProps) => {
  const [allWhiteBoards, setAllWhiteBoards] = useState<IWhiteBoard[]>([]);
  const [loadingWhiteBoards, setLoadingWhiteBoards] = useState(false);
  const mutations = useWhiteboardMutations();
  const { items } = useWhiteboards();
  const knownTags = useMemo(() => rankTags(items ?? []).map(t => t.name), [items]);

  useEffect(() => {
    if (open && action === "reference") {
      setLoadingWhiteBoards(true);
      getAllWhiteBoards()
        .then(setAllWhiteBoards)
        .finally(() => setLoadingWhiteBoards(false));
    }
  }, [open, action]);

  const insertWhiteBoardElement = useMemoizedFn((whiteBoard: IWhiteBoard) => {
    const { minX, minY, width, height } = board.viewPort;
    const center = {
      x: minX + width / 2,
      y: minY + height / 2,
    };
    const whiteboardWidth = 300;
    const whiteboardHeight = WHITEBOARD_CARD_HEIGHT;

    const element: WhiteBoardElement = {
      id: getUuid(),
      type: "whiteboard",
      whiteBoardId: whiteBoard.id,
      name: whiteBoard.title,
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
  });

  const handleCancel = useMemoizedFn(() => {
    board.currentCreateType = ECreateBoardElementType.None;
    onClose();
  });

  if (action === "create") {
    return (
      <WhiteboardInfoDialog
        open={open}
        initial={null}
        knownTags={knownTags}
        createLabel="创建并插入"
        onClose={handleCancel}
        onSubmit={async info => {
          insertWhiteBoardElement(await mutations.create(info));
        }}
      />
    );
  }

  return (
    <SelectWhiteBoardModal
      open={open}
      title="引用已有白板"
      multiple={false}
      loading={loadingWhiteBoards}
      onCancel={handleCancel}
      onOk={whiteBoards => {
        if (!whiteBoards[0]) return;
        insertWhiteBoardElement(whiteBoards[0]);
        handleCancel();
      }}
      allWhiteBoards={allWhiteBoards}
    />
  );
};

export default WhiteBoardSelectorModal;
