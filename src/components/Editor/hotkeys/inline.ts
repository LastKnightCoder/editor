import React from "react";
import { Editor, Range, Transforms, Element } from "slate";
import { IHotKeyConfig } from "../types";

const inlineMove = (left: boolean) => {
  return (editor: Editor, event: React.KeyboardEvent<HTMLDivElement>) => {
    const { selection } = editor;
    const [match] = Editor.nodes(editor, {
      match: (n) => Element.isElement(n) && Editor.isInline(editor, n),
    });
    // 目前只管出，不管进，即在出去 inline 元素的时候，是 offset，但是进去的时候，还是 char
    if (selection && Range.isCollapsed(selection) && match) {
      event.preventDefault();
      Transforms.move(editor, { unit: "offset", reverse: left });
    }
  };
};

export const inline: IHotKeyConfig[] = [
  {
    hotKey: "left",
    action: inlineMove(true),
  },
  {
    hotKey: "right",
    action: inlineMove(false),
  },
];
