import Base from '../base';
import IExtension from "../types.ts";
import { RenderElementProps } from "slate-react";
import {BlockquoteElement} from "@/components/Editor/types";
import Blockquote from "@/components/Editor/components/Blockquote";
import { markdownSyntax } from './plugins';

class BlockquoteExtension extends Base implements IExtension {
  type = 'blockquote';

  override getPlugins() {
    return [markdownSyntax];
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <Blockquote attributes={attributes} element={element as BlockquoteElement}>
        {children}
      </Blockquote>
    )
  }
}

export default BlockquoteExtension;