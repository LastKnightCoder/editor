import { createRoot } from "react-dom/client";
import type { Editor } from "slate";

import type { BookmarkElement } from "../types";
import BookmarkEditDialog from "./BookmarkEditDialog";

/** 编辑面板无宿主组件可挂，独立 root 渲染；关闭先播退场动画，结束后卸载 */
export function openBookmarkEditor(editor: Editor, element: BookmarkElement): void {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = (open: boolean) =>
    root.render(
      <BookmarkEditDialog
        editor={editor}
        element={element}
        open={open}
        onClose={() => render(false)}
        onAfterClose={() => {
          root.unmount();
          container.remove();
        }}
      />
    );
  render(true);
}
