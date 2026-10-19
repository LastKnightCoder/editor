import { Editor, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { setOrInsertNode } from "@tau/editor/api";

export const insertBulletList = (editor: Editor) => {
  if (!editor.selection || ReactEditor.isReadOnly(editor)) return;
  const path = setOrInsertNode(editor, {
    type: "bulleted-list",
    children: [
      {
        type: "list-item",
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
      },
    ],
  });
  if (!path) return;

  const firstParagraphPath = [...path, 0, 0];
  Transforms.select(editor, {
    anchor: Editor.start(editor, firstParagraphPath),
    focus: Editor.start(editor, firstParagraphPath),
  });

  return path;
};

export const insertNumberedList = (editor: Editor) => {
  if (!editor.selection || ReactEditor.isReadOnly(editor)) return;
  const path = setOrInsertNode(editor, {
    type: "numbered-list",
    children: [
      {
        type: "list-item",
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
      },
    ],
  });
  if (!path) return;

  const firstParagraphPath = [...path, 0, 0];
  Transforms.select(editor, {
    anchor: Editor.start(editor, firstParagraphPath),
    focus: Editor.start(editor, firstParagraphPath),
  });

  return path;
};

export const insertCheckList = (editor: Editor) => {
  if (!editor.selection || ReactEditor.isReadOnly(editor)) return;
  const path = setOrInsertNode(editor, {
    type: "check-list",
    children: [
      {
        type: "check-list-item",
        checked: false,
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
      },
    ],
  });
  if (!path) return;
  Transforms.select(editor, {
    anchor: Editor.start(editor, path),
    focus: Editor.start(editor, path),
  });

  return path;
};
