import { RenderElementProps } from "slate-react";
import type { BlockquoteElement } from "../../types";

import Blockquote from "./components/Blockquote";
import { markdownSyntax, quit, withNormalizeBlockquote } from "./plugins";
import { createBlockElementPlugin } from "../../utils";

import Base from "../base";
import IExtension from "../types";

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
