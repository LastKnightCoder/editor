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

  setOrInsertNode(editor, whiteboard as any);

  return whiteboard;
};
