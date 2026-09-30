import { defineElement, defineExtension, type ElementRenderProps } from "../../api";

import Comment from "./components/Comment";
import type { CommentElement } from "../../types";

import hoveringBarConfigs from "./hovering-bar-configs";
import { commentCommands, commentHotkeys } from "./commands";

const commentExtension = defineExtension({
  id: "tau.comment",
  elements: [
    defineElement<CommentElement>({
      type: "comment",
      kind: "inline",
      render: ({ attributes, element, children }: ElementRenderProps<CommentElement>) => (
        <Comment attributes={attributes} element={element}>
          {children}
        </Comment>
      ),
    }),
  ],
  toolbar: hoveringBarConfigs,
  commands: commentCommands,
  hotkeys: commentHotkeys,
});

export default commentExtension;
