import { Editor } from "slate";
import { setOrInsertNode } from "@/components/Editor/utils";
import { v4 as getId } from "uuid";

export const insertWhiteboard = (editor: Editor) => {
  const whiteboard = {
    type: "whiteboard",
    id: getId(),
    height: 400,
    children: [{ type: "formatted", text: "" }],
    data: {
      children: [],
      viewPort: { minX: 0, minY: 0, width: 0, height: 0, zoom: 1 },
      selection: { selectArea: null, selectedElements: [] },
    },
  };

  setOrInsertNode(editor, whiteboard as any);

  return whiteboard;
};
