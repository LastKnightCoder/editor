import { Editor, NodeEntry, Transforms } from "slate";
import { deleteCurTab } from "./utils.ts";
import { TabsElement } from "@/components/Editor/types";

const hitEmpty = (editor: Editor, [node, path]: NodeEntry) => {
  if (node.type !== "tabs") {
    return false;
  }

  // @ts-ignore
  if (!node.children) {
    return false;
  }

  // @ts-ignore
  if (node.children.length === 0) {
    deleteCurTab(editor, node as TabsElement, path);
    return true;
  }

  // @ts-ignore
  if (node.children.length === 1 && node.children[0].type === "formatted") {
    // @ts-ignore
    if (node.children[0].text === "") {
      deleteCurTab(editor, node as TabsElement, path);
      return true;
    } else {
      Transforms.wrapNodes(
        editor,
        {
          type: "paragraph",
          children: [],
        },
        {
          at: [...path, 0],
        },
      );
    }
    return true;
  }

  return false;
};

export const withNormalize = (editor: Editor) => {
  const { normalizeNode } = editor;

  editor.normalizeNode = ([node, path]) => {
    if (hitEmpty(editor, [node, path])) {
      return;
    }

    normalizeNode([node, path]);
  };

  return editor;
};
