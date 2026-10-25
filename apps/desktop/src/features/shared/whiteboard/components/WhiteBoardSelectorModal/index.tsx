import { toast } from "@tau/ui";
import { getWhiteboardDocument } from "@tau/whiteboard/collaboration";
import { referenceWhiteboardEntity } from "@/commands/whiteboard-document";
import useSettingStore from "@/stores/useSettingStore";
import { useState, useEffect, useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import { v4 as getUuid } from "uuid";

import { Board as Board, SELECT_TOOL_ID } from "@tau/whiteboard";
import { WhiteBoardElement } from "@tau/whiteboard";
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

  const insertWhiteBoardElement = useMemoizedFn(async (whiteBoard: IWhiteBoard) => {
    const canSubmit = board.captureSubmission();
    const databaseName = useSettingStore.getState().setting.database.active;
    const entity = getWhiteboardDocument(board)
      ? await referenceWhiteboardEntity(databaseName, "whiteboard", whiteBoard.id)
      : undefined;
    if (!canSubmit() || useSettingStore.getState().setting.database.active !== databaseName) return;
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
      ...(entity ? { entity } : { whiteBoardId: whiteBoard.id }),
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
    board.setActiveTool(SELECT_TOOL_ID);
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
          const canSubmit = board.captureSubmission();
          if (!canSubmit()) return;
          const created = await mutations.create(info);
          if (canSubmit()) await insertWhiteBoardElement(created);
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
        void insertWhiteBoardElement(whiteBoards[0]).catch(error =>
          toast.error(error instanceof Error ? error.message : "引用建立失败")
        );
        handleCancel();
      }}
      allWhiteBoards={allWhiteBoards}
    />
  );
};

export default WhiteBoardSelectorModal;
