import { Element } from "slate";
import { RenderElementProps } from "slate-react";
import { BlockquoteElement } from "@/components/Editor/types";

import Blockquote from "./components/Blockquote";
import { markdownSyntax, quit, withNormalizeBlockquote } from "./plugins";
import { createBlockElementPlugin } from "../../utils";

import Base from "../base";
import IExtension from "../types.ts";

class BlockquoteExtension extends Base implements IExtension {
  type = "blockquote";

  override getPlugins() {
    return [
      markdownSyntax,
      quit,
      withNormalizeBlockquote,
      createBlockElementPlugin(this.type),
    ];
  }

  override toMarkdown(_element: Element, children: string) {
    // 按照 \n 分割
    return children
      .split("\n")
      .map((child) => `> ${child}`)
      .join("\n");
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <Blockquote
        attributes={attributes}
        element={element as BlockquoteElement}
      >
        {children}
      </Blockquote>
    );
  }
}

export default BlockquoteExtension;
