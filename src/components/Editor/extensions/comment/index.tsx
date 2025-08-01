import IExtension from "../types.ts";
import Base from "../base.ts";
import Comment from "./components/Comment";

import { RenderElementProps } from "slate-react";
import { CommentElement } from "@/components/Editor/types";
import { createInlineElementPlugin } from "../../utils";

import hotkeys from "./hotkeys";
import hoveringBarConfigs from "./hovering-bar-configs";

class CommentExtension extends Base implements IExtension {
  type = "comment";

  override getHotkeyConfigs() {
    return hotkeys;
  }

  override getHoveringBarElements() {
    return hoveringBarConfigs;
  }

  override getPlugins() {
    return [createInlineElementPlugin(this.type)];
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <Comment attributes={attributes} element={element as CommentElement}>
        {children}
      </Comment>
    );
  }
}

export default CommentExtension;
