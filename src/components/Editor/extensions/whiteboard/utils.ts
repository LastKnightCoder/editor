import { Editor } from "slate";
import { setOrInsertNode } from "@/components/Editor/utils";
import { v4 as getId } from "uuid";
import {
  createWhiteBoardContent,
  incrementWhiteBoardContentRefCount,
} from "@/commands/white-board";
import { WhiteBoardContent } from "@/types";
import { WhiteboardElement } from "@/components/Editor/types/element/whiteboard";

export const insertWhiteboard = async (editor: Editor) => {
  const content = await createWhiteBoardContent({
    data: {
      children: [],
      viewPort: { minX: 0, minY: 0, width: 0, height: 0, zoom: 1 },
      selection: { selectArea: null, selectedElements: [] },
      presentationSequences: [],
    },
    name: "白板",
    imgUrl: "",
  });

  const whiteboard: WhiteboardElement = {
    type: "whiteboard",
    id: getId(),
    height: 400,
    children: [{ type: "formatted", text: "" }],
    whiteBoardContentId: content.id,
  };

  // 在删除白板时，不能立即删除数据库中的白板，因为可能会被撤回
  // 但是会在数据库中将引用数减小，但数据还在，等到下次打开时统一删除
  // 为了在撤回后不被删除，应当保证撤回时恢复引用数
  // 时机就是在 insert_node 时恢复，但是 insert_node 在新建和撤回时都会触发
  // 为了区分两个场景，添加一个 isInsertNewWhiteboard 的标志位，表示是新建白板
  // @ts-ignore
  editor.isInsertNewWhiteboard = true;
  setOrInsertNode(editor, whiteboard);

  return whiteboard;
};

export const insertExistingWhiteboard = async (
  editor: Editor,
  whiteBoardContent: WhiteBoardContent,
) => {
  // 引用已有白板：手动增加引用计数
  await incrementWhiteBoardContentRefCount(whiteBoardContent.id);

  const whiteboard: WhiteboardElement = {
    type: "whiteboard",
    id: getId(),
    height: 400,
    children: [{ type: "formatted", text: "" }],
    whiteBoardContentId: whiteBoardContent.id,
  };

  // 标记为新建白板，insert_node 时不会再次增加引用计数
  // 避免重复增加（已经手动增加过了）
  // @ts-ignore
  editor.isInsertNewWhiteboard = true;
  setOrInsertNode(editor, whiteboard);

  return whiteboard;
};
