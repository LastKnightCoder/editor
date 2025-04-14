import { Editor } from "slate";
import { setOrInsertNode } from "@/components/Editor/utils";
import { v4 as getId } from "uuid";
import { createWhiteBoardContent } from "@/commands/white-board";

export const insertWhiteboard = async (editor: Editor) => {
  const content = await createWhiteBoardContent({
    data: {
      children: [],
      viewPort: { minX: 0, minY: 0, width: 0, height: 0, zoom: 1 },
      selection: { selectArea: null, selectedElements: [] },
      presentationSequences: [],
    },
    name: "白板",
  });

  const whiteboard = {
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
  // 为了区分两个场景，添加一个 insertWhiteboard 的标志位，表示是新建白板
  // @ts-ignore
  editor.isInsertWhiteboard = true;
  setOrInsertNode(editor, whiteboard as any);

  return whiteboard;
};
