import { Editor } from "slate";
import { setOrInsertNode } from "@tau/editor";
import { v4 as getId } from "uuid";
import { WHITEBOARD_DOCUMENT_VERSION } from "@tau/whiteboard";
import {
  createWhiteBoardContent,
  incrementWhiteBoardContentRefCount,
} from "@/commands/white-board";
import { WhiteBoardContent } from "@/types";
import type { WhiteboardElement } from "./types";
import {
  createPendingWhiteBoardContent,
  getWhiteBoardContentReference,
} from "@/commands/white-board";

type WhiteboardEditor = Editor & {
  isInsertNewWhiteboard?: boolean;
};

export const insertWhiteboard = async (editor: Editor) => {
  const whiteboardEditor = editor as WhiteboardEditor;
  const initial = {
    data: {
      children: [],
      viewPort: { minX: 0, minY: 0, width: 0, height: 0, zoom: 1 },
      selection: { selectArea: null, selectedElements: [] },
      presentationSequences: [],
      version: WHITEBOARD_DOCUMENT_VERSION,
    },
    name: "白板",
    imgUrl: "",
  };
  const referenced = "nodeTree" in editor ? await createPendingWhiteBoardContent(initial) : null;
  const whiteBoardContent = referenced
    ? referenced.content
    : await createWhiteBoardContent(initial);

  const whiteboard: WhiteboardElement = {
    type: "whiteboard",
    id: getId(),
    height: 400,
    children: [{ type: "formatted", text: "" }],
    ...(referenced
      ? { entityRef: referenced.reference }
      : { whiteBoardContentId: whiteBoardContent.id }),
  };

  // 在删除白板时，不能立即删除数据库中的白板，因为可能会被撤回
  // 但是会在数据库中将引用数减小，但数据还在，等到下次打开时统一删除
  // 为了在撤回后不被删除，应当保证撤回时恢复引用数
  // 时机就是在 insert_node 时恢复，但是 insert_node 在新建和撤回时都会触发
  // 为了区分两个场景，添加一个 isInsertNewWhiteboard 的标志位，表示是新建白板
  whiteboardEditor.isInsertNewWhiteboard = true;
  setOrInsertNode(editor, whiteboard);

  return whiteboard;
};

export const insertExistingWhiteboard = async (
  editor: Editor,
  whiteBoardContent: WhiteBoardContent
) => {
  const whiteboardEditor = editor as WhiteboardEditor;
  const reference =
    "nodeTree" in editor ? await getWhiteBoardContentReference(whiteBoardContent.id) : undefined;
  if (!reference) await incrementWhiteBoardContentRefCount(whiteBoardContent.id);

  const whiteboard: WhiteboardElement = {
    type: "whiteboard",
    id: getId(),
    height: 400,
    children: [{ type: "formatted", text: "" }],
    ...(reference ? { entityRef: reference } : { whiteBoardContentId: whiteBoardContent.id }),
  };

  // 标记为新建白板，insert_node 时不会再次增加引用计数
  // 避免重复增加（已经手动增加过了）
  whiteboardEditor.isInsertNewWhiteboard = true;
  setOrInsertNode(editor, whiteboard);

  return whiteboard;
};
