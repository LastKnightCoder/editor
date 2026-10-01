import type { Editor } from "slate";
import { setOrInsertNode, focusInsertedPreviewElement } from "@tau/editor/api";
import type { CustomBlockElement } from "./types";

// 新块骨架：React 解构 hooks + 演示舞台（语义色随主题切换）
const defaultCustomBlockContent = `const { useState } = React;

const Component = () => {
  return (
    <div className="rounded-tau-md bg-sunken p-6 text-tau-body text-ink-1">
      
    </div>
  );
};
`;

export const insertCustomBlock = (editor: Editor) => {
  const node: CustomBlockElement = {
    type: "custom-block",
    content: defaultCustomBlockContent,
    children: [{ type: "formatted", text: "" }],
  };
  const path = setOrInsertNode(editor, node);
  focusInsertedPreviewElement(editor, path, 5);
  return path;
};
