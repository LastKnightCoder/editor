export interface SelectionInfo {
  text: string;
  range: Range;
  rect: DOMRect;
}

type SelectionCallback = (info: SelectionInfo | null) => void;
type HighlightClickCallback = (highlightId: string, rect: DOMRect) => void;

const MARK_ATTR = "data-tau-highlight-id";

let selectionCallback: SelectionCallback | null = null;
let highlightClickCallback: HighlightClickCallback | null = null;
let shadowRoot: ShadowRoot | null = null;

/**
 * Check if an event originated from inside our Shadow DOM UI.
 * We use composedPath() because event.target is retargeted to the shadow host
 * when observed from the document level.
 */
function isEventFromShadowUI(e: Event): boolean {
  if (!shadowRoot) return false;
  const path = e.composedPath();
  return path.some((el) => el === shadowRoot || el === shadowRoot.host);
}

function handleMouseUp(e: MouseEvent): void {
  // Ignore clicks inside our Shadow DOM UI
  if (isEventFromShadowUI(e)) return;

  // Check if clicking on an existing highlight mark
  const target = e.target as HTMLElement;
  const mark = target.closest?.(`mark[${MARK_ATTR}]`);
  if (mark) {
    const highlightId = mark.getAttribute(MARK_ATTR);
    if (highlightId && highlightClickCallback) {
      const rect = mark.getBoundingClientRect();
      highlightClickCallback(highlightId, rect);
      return;
    }
  }

  // Delay to let selection finalize
  setTimeout(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      selectionCallback?.(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();
    if (!text) {
      selectionCallback?.(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    selectionCallback?.({ text, range, rect });
  }, 10);
}

function handleMouseDown(e: MouseEvent): void {
  // Ignore clicks inside our Shadow DOM UI
  if (isEventFromShadowUI(e)) return;

  const target = e.target as HTMLElement;
  const mark = target.closest?.(`mark[${MARK_ATTR}]`);
  if (!mark) {
    // Clicking outside a highlight mark — dismiss highlight popover
    highlightClickCallback?.("", new DOMRect());
  }
}

export function initSelectionManager(
  onSelection: SelectionCallback,
  onHighlightClick: HighlightClickCallback,
  shadow: ShadowRoot,
): () => void {
  selectionCallback = onSelection;
  highlightClickCallback = onHighlightClick;
  shadowRoot = shadow;

  document.addEventListener("mouseup", handleMouseUp, true);
  document.addEventListener("mousedown", handleMouseDown, true);

  return () => {
    document.removeEventListener("mouseup", handleMouseUp, true);
    document.removeEventListener("mousedown", handleMouseDown, true);
    selectionCallback = null;
    highlightClickCallback = null;
    shadowRoot = null;
  };
}
