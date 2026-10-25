import type { Editor } from "slate";
import { ReactEditor } from "slate-react";
import { v4 as getUuid } from "uuid";
import { setOrInsertNode } from "@tau/editor/api";
import type { TabPaneElement } from "./types";

export const insertTabs = (editor: Editor) => {
  if (!editor.selection || ReactEditor.isReadOnly(editor)) return;
  const key = getUuid();
  const pane: TabPaneElement = {
    type: "tab-pane",
    tabKey: key,
    title: "Tab 1",
    children: [
      {
        type: "paragraph",
        children: [
          {
            type: "formatted",
            text: "",
          },
        ],
      },
    ],
  };

  return setOrInsertNode(
    editor,
    {
      type: "tabs",
      children: [pane],
    },
    {
      select: true,
    }
  );
};
