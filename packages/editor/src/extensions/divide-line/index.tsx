import { Editor, Transforms } from "slate";
import { defineElement, defineExtension } from "../../api";

import type { DivideLineElement, FormattedText, ParagraphElement } from "../../types";
import DivideLine from "./components/DivideLine";
import blockPanelItems from "./block-panel-items";

/** 段落里只有 `---` 时回车：整段变成分割线，下方补一个空段落 */
const convertDashesToDivideLine = (
  editor: Editor,
  [paragraph, path]: [ParagraphElement, number[]]
) => {
  const [text] = paragraph.children;
  if (paragraph.children.length !== 1 || text.type !== "formatted") return false;
  if ((text as FormattedText).text !== "---") return false;
  Transforms.delete(editor, {
    at: { anchor: { path: [...path, 0], offset: 0 }, focus: { path: [...path, 0], offset: 3 } },
  });
  Transforms.setNodes(editor, { type: "divide-line" }, { at: path });
  Transforms.insertNodes(editor, {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  });
  return true;
};

/**
 * 分割线。
 * 快捷语法挂在 paragraph 的行为上而不是分割线自己——触发时选区在段落里，还没有分割线。
 */
const divideLineExtension = defineExtension({
  id: "tau.divide-line",
  elements: [
    defineElement<DivideLineElement>({
      type: "divide-line",
      kind: "block",
      isVoid: true,
      render: DivideLine,
      // 分割线很矮，手柄抬高加宽（原组件手柄的位置）
      drag: {
        self: true,
        children: true,
        handleClassName: "-left-[1.25em] -top-[0.75em] h-[1.75em] w-[1.25em] transition-opacity",
      },
    }),
  ],
  blockPanel: blockPanelItems,
  behaviorsFor: {
    paragraph: { insertBreak: convertDashesToDivideLine },
  },
});

export default divideLineExtension;
