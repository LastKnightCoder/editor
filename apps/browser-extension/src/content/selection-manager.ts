export interface SelectionInfo {
  text: string;
  range: Range;
  rect: DOMRect;
}

type SelectionCallback = (info: SelectionInfo | null) => void;
type HighlightClickCallback = (highlightId: string, rect: DOMRect) => void;

const MARK_ATTR = "data-tau-highlight-id";
const CLEAR_SELECTION_SNAPSHOT = "__tau-selection-empty__";
const RETRY_DELAY_MS = 40;
const POINTER_MOUSEUP_DEDUP_MS = 80;
const DEBUG_PREFIX = "[Tau Selection Debug]";

let selectionCallback: SelectionCallback | null = null;
let highlightClickCallback: HighlightClickCallback | null = null;
let shadowRoot: ShadowRoot | null = null;
let pendingRafId: number | null = null;
let pendingRetryId: number | null = null;
let isPointerDown = false;
let lastPointerUpAt = 0;
let lastSelectionSnapshot = CLEAR_SELECTION_SNAPSHOT;

function debugLog(message: string, payload?: Record<string, unknown>) {
  if (payload) {
    console.debug(DEBUG_PREFIX, message, payload);
    return;
  }

  console.debug(DEBUG_PREFIX, message);
}

/**
 * Check if an event originated from inside our Shadow DOM UI.
 * We use composedPath() because event.target is retargeted to the shadow host
 * when observed from the document level.
 */
function isEventFromShadowUI(e: Event): boolean {
  const root = shadowRoot;
  if (!root) return false;
  const path = e.composedPath();
  return path.some((el) => el === root || el === root.host);
}

function clearScheduledSync() {
  if (pendingRafId !== null) {
    window.cancelAnimationFrame(pendingRafId);
    pendingRafId = null;
  }

  if (pendingRetryId !== null) {
    window.clearTimeout(pendingRetryId);
    pendingRetryId = null;
  }
}

function getSelectionSnapshot(info: SelectionInfo | null) {
  if (!info) return CLEAR_SELECTION_SNAPSHOT;

  const { rect } = info;
  return [
    info.text,
    rect.left.toFixed(2),
    rect.top.toFixed(2),
    rect.width.toFixed(2),
    rect.height.toFixed(2),
  ].join("::");
}

function isUsableRect(rect: DOMRect) {
  const values = [
    rect.left,
    rect.top,
    rect.right,
    rect.bottom,
    rect.width,
    rect.height,
  ];
  if (!values.every((value) => Number.isFinite(value))) {
    return false;
  }

  return rect.width > 0 || rect.height > 0;
}

function readSelection(): SelectionInfo | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    debugLog("选区为空或折叠", {
      hasSelection: Boolean(selection),
      isCollapsed: selection?.isCollapsed ?? null,
      rangeCount: selection?.rangeCount ?? 0,
    });
    return null;
  }

  const text = selection.toString().trim();
  if (!text) {
    debugLog("选区文本为空白", {
      rangeCount: selection.rangeCount,
    });
    return null;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (!isUsableRect(rect)) {
    debugLog("选区矩形无效", {
      text,
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
    });
    return null;
  }

  debugLog("成功读取选区", {
    text,
    rect: {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    },
  });

  return {
    text,
    range,
    rect,
  };
}

function emitSelection(info: SelectionInfo | null) {
  const nextSnapshot = getSelectionSnapshot(info);
  if (nextSnapshot === lastSelectionSnapshot) {
    debugLog("选区快照未变化，跳过回调");
    return;
  }

  lastSelectionSnapshot = nextSnapshot;
  debugLog(info ? "发送有效选区回调" : "发送空选区回调", {
    text: info?.text ?? "",
  });
  selectionCallback?.(info);
}

function handleMouseDown(e: MouseEvent): void {
  // Ignore clicks inside our Shadow DOM UI
  if (isEventFromShadowUI(e)) return;

  isPointerDown = true;
  debugLog("收到 mousedown", {
    target: (e.target as HTMLElement | null)?.tagName ?? null,
  });

  const target = e.target as HTMLElement;
  const mark = target.closest?.(`mark[${MARK_ATTR}]`);
  if (!mark) {
    // Clicking outside a highlight mark — dismiss highlight popover
    highlightClickCallback?.("", new DOMRect());
  }
}

function syncSelection() {
  emitSelection(readSelection());
}

function scheduleSelectionSync(source: string) {
  clearScheduledSync();
  debugLog("调度选区同步", {
    source,
    isPointerDown,
  });
  pendingRafId = window.requestAnimationFrame(() => {
    pendingRafId = null;
    debugLog("执行首轮选区同步", { source });
    syncSelection();
    pendingRetryId = window.setTimeout(() => {
      pendingRetryId = null;
      debugLog("执行补偿选区同步", { source });
      syncSelection();
    }, RETRY_DELAY_MS);
  });
}

function handleSelectionChange(e: Event) {
  if (isEventFromShadowUI(e)) return;
  if (isPointerDown) {
    debugLog("selectionchange 发生在按压中，等待结束事件", {
      type: e.type,
    });
    return;
  }
  scheduleSelectionSync("selectionchange");
}

function handlePointerUp(e: PointerEvent): void {
  if (isEventFromShadowUI(e)) return;

  isPointerDown = false;
  lastPointerUpAt = Date.now();
  debugLog("收到 pointerup", {
    target: (e.target as HTMLElement | null)?.tagName ?? null,
  });

  const target = e.target as HTMLElement;
  const mark = target.closest?.(`mark[${MARK_ATTR}]`);
  if (mark) {
    const highlightId = mark.getAttribute(MARK_ATTR);
    if (highlightId && highlightClickCallback) {
      const rect = mark.getBoundingClientRect();
      debugLog("pointerup 命中已有高亮", {
        highlightId,
      });
      highlightClickCallback(highlightId, rect);
      return;
    }
  }

  scheduleSelectionSync("pointerup");
}

function handleMouseUp(e: MouseEvent): void {
  if (isEventFromShadowUI(e)) return;

  const now = Date.now();
  if (now - lastPointerUpAt <= POINTER_MOUSEUP_DEDUP_MS) {
    debugLog("mouseup 被 pointerup 去重", {
      delta: now - lastPointerUpAt,
    });
    return;
  }

  isPointerDown = false;
  debugLog("收到 mouseup", {
    target: (e.target as HTMLElement | null)?.tagName ?? null,
  });

  const target = e.target as HTMLElement;
  const mark = target.closest?.(`mark[${MARK_ATTR}]`);
  if (mark) {
    const highlightId = mark.getAttribute(MARK_ATTR);
    if (highlightId && highlightClickCallback) {
      const rect = mark.getBoundingClientRect();
      debugLog("mouseup 命中已有高亮", {
        highlightId,
      });
      highlightClickCallback(highlightId, rect);
      return;
    }
  }

  scheduleSelectionSync("mouseup");
}

function handleKeyUp(e: KeyboardEvent) {
  if (isEventFromShadowUI(e)) return;
  debugLog("收到 keyup", {
    key: e.key,
  });
  scheduleSelectionSync("keyup");
}

export function initSelectionManager(
  onSelection: SelectionCallback,
  onHighlightClick: HighlightClickCallback,
  shadow: ShadowRoot,
): () => void {
  selectionCallback = onSelection;
  highlightClickCallback = onHighlightClick;
  shadowRoot = shadow;
  lastSelectionSnapshot = CLEAR_SELECTION_SNAPSHOT;
  clearScheduledSync();
  isPointerDown = false;
  lastPointerUpAt = 0;
  debugLog("初始化选区管理器");

  document.addEventListener("selectionchange", handleSelectionChange, true);
  document.addEventListener("pointerup", handlePointerUp, true);
  document.addEventListener("mouseup", handleMouseUp, true);
  document.addEventListener("mousedown", handleMouseDown, true);
  document.addEventListener("keyup", handleKeyUp, true);

  return () => {
    clearScheduledSync();
    document.removeEventListener(
      "selectionchange",
      handleSelectionChange,
      true,
    );
    document.removeEventListener("pointerup", handlePointerUp, true);
    document.removeEventListener("mouseup", handleMouseUp, true);
    document.removeEventListener("mousedown", handleMouseDown, true);
    document.removeEventListener("keyup", handleKeyUp, true);
    selectionCallback = null;
    highlightClickCallback = null;
    shadowRoot = null;
    isPointerDown = false;
    lastPointerUpAt = 0;
    lastSelectionSnapshot = CLEAR_SELECTION_SNAPSHOT;
    debugLog("销毁选区管理器");
  };
}
