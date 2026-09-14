// 闪卡填空（flashcard-blank）行内节点的移动端编辑扩展。
// 节点结构与桌面 apps/desktop/src/editor-extensions/flashcard-blank 完全一致（数据互通）；
// 触屏适配见 FlashcardBlankInline（配置入口不依赖 hover，配置面板为 BottomSheet）。

import { Base, createInlineElementPlugin } from "@tau/editor/src";
import type { IExtension } from "@tau/editor/src";
import type { RenderElementProps } from "slate-react";
import type { FlashcardBlankElement } from "./flashcardBlankTransforms";
import { FlashcardBlankInline } from "./FlashcardBlankInline";

export class FlashcardBlankExtension extends Base implements IExtension {
  type = "flashcard-blank";

  override getPlugins() {
    return [createInlineElementPlugin("flashcard-blank")];
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <FlashcardBlankInline
        attributes={attributes}
        element={element as unknown as FlashcardBlankElement}
      >
        {children}
      </FlashcardBlankInline>
    );
  }
}
