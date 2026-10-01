import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/api";
import type {} from "./augmentations";

import Comment from "./components/Comment/index.tsx";
import { type CommentElement } from "./types.ts";

import hoveringBarConfigs from "./hovering-bar-configs/index.ts";
import { commentCommands, commentHotkeys } from "./commands.ts";

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
export type { CommentElement, Comment } from "./types";
export { wrapComment, unwrapComment } from "./operations";
