import { Editor, Range } from "slate";
import { deleteColumnLeft, deleteColumnRight } from "@/components/Editor/utils";
import { IHotKeyConfig } from "@/components/Editor/types";

const insert: IHotKeyConfig[] = [
  {
    hotKey: "mod+shift+right",
    action: (editor, event) => {
      const { selection } = editor;
      if (selection && Range.isCollapsed(selection)) {
        const [match] = Editor.nodes(editor, {
          match: (n) => n.type === "multi-column-item",
        });
        if (!match) {
          return;
        }
        deleteColumnRight(editor);
        event.preventDefault();
        event.stopPropagation();
      }
    },
  },
  {
    hotKey: "mod+shift+left",
    action: (editor, event) => {
      const { selection } = editor;
      if (selection && Range.isCollapsed(selection)) {
        const [match] = Editor.nodes(editor, {
          match: (n) => n.type === "multi-column-item",
        });
        if (!match) {
          return;
        }
        deleteColumnLeft(editor);
        event.preventDefault();
        event.stopPropagation();
      }
    },
  },
];

export default insert;
