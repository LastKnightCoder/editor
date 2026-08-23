import type { Editor } from "codemirror";

const SOURCE_CURSOR_SCROLL_PADDING = 24;

export const scrollSourceCursorIntoView = (
  editor: Pick<Editor, "cursorCoords" | "getCursor">,
  container: HTMLElement,
) => {
  const cursorCoords = editor.cursorCoords(editor.getCursor(), "page");
  const pageYOffset = typeof window === "undefined" ? 0 : window.pageYOffset;
  const containerRect = container.getBoundingClientRect();
  const topBorder = container.clientTop;
  const bottomBorder =
    container.offsetHeight - container.clientHeight - topBorder;
  const visibleTop =
    containerRect.top + pageYOffset + topBorder + SOURCE_CURSOR_SCROLL_PADDING;
  const visibleBottom =
    containerRect.bottom +
    pageYOffset -
    bottomBorder -
    SOURCE_CURSOR_SCROLL_PADDING;

  if (cursorCoords.bottom > visibleBottom) {
    container.scrollTop += cursorCoords.bottom - visibleBottom;
  } else if (cursorCoords.top < visibleTop) {
    container.scrollTop -= visibleTop - cursorCoords.top;
  }
};
