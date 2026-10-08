import { BoardUtil, PathUtil, type Board } from "@tau/whiteboard";

interface ContentRefCommands {
  decrementContentRefCount(id: number): Promise<void>;
  incrementContentRefCount(id: number): Promise<void>;
}

/** 关联未落账时补偿引用，命令由调用方固定原数据库。 */
export async function unlinkMindNote(
  board: Board,
  elementId: string,
  commands: ContentRefCommands
): Promise<number | null> {
  const node = BoardUtil.getElementById(board, elementId);
  if (node?.type !== "mind-node" || !node.contentId) return null;
  const contentId = node.contentId as number;
  const canSubmit = board.captureSubmission(node);
  if (!canSubmit()) return null;

  await commands.decrementContentRefCount(contentId);
  let committed = false;
  try {
    if (!canSubmit()) return null;
    const current = BoardUtil.getElementById(board, elementId);
    if (!current || current.contentId !== contentId) return null;
    const path = PathUtil.getPathByElement(board, current);
    if (!path) return null;
    board.apply({
      type: "set_node",
      path,
      properties: { contentId, contentTitle: current.contentTitle },
      newProperties: { contentId: undefined, contentTitle: undefined },
    });
    committed = BoardUtil.getElementById(board, elementId)?.contentId === undefined;
    if (!committed) throw new Error("取消关联笔记失败");
    return contentId;
  } finally {
    if (!committed) await commands.incrementContentRefCount(contentId);
  }
}
