import { useEffect, useRef, useState, type PointerEvent, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { ChevronDown, ChevronLeft, ChevronUp, Keyboard, KeyboardOff } from "lucide-react";
import { Editor, type EditorRef } from "@tau/editor";
import {
  Editor as SlateEditor,
  Element,
  Node as SlateNode,
  Range,
  Transforms,
  type BaseSelection,
} from "slate";
import { ReactEditor } from "slate-react";
import { useNavigator } from "../../router";
import {
  KEYBOARD_RESERVE_RELEASE_RATIO,
  resolvePanelHeight,
  useKeyboardReservation,
  useKeyboardViewport,
} from "../../components/KeyboardViewportProvider";
import { getMobileContentKit } from "../../services/editorKit";
import {
  applyHeaderBlock,
  restoreSelectionAndFocus,
  toggleMark,
} from "../cards/editorToolbar/toolbarActions";
import {
  DEFAULT_KEYBOARD_SWAP_STRATEGY,
  clearKeyboardSwap,
  hideKeyboard,
  showKeyboard,
  type KeyboardSwapStrategy,
} from "../cards/editorToolbar/keyboardSwap";
import { createLabSampleContent } from "./labSampleContent";
import { useLabLog } from "./useLabLog";
import { measureSwapSettle, type SwapDirection } from "./swapSettle";

type FocusTiming = "sync" | "raf";

type PanelAction = "bold" | "italic" | "heading-one";

type PanelCloseTrigger = "keyboard-button" | "tap-editor";

type CaretHit = { node: Node; offset: number };

const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP_PX = 24;
const KEYBOARD_WAIT_MS = 1500;
const RECENT_LOG_COUNT = 6;
const ACCESSORY_BAR_HEIGHT = 46;
const SELECTION_CHECK_MS = 300;
const IME_RECHECK_MS = 700;

const PANEL_ACTIONS: { id: PanelAction; label: string }[] = [
  { id: "bold", label: "B" },
  { id: "italic", label: "I" },
  { id: "heading-one", label: "H1" },
];

const SWAP_STRATEGIES: KeyboardSwapStrategy[] = ["blur", "inputmode"];

type WindowWithNativeKeyboard = Window & { __TAU_NATIVE_KB_HEIGHT?: unknown };

function hasNativeKeyboardHeight(): boolean {
  return typeof (window as WindowWithNativeKeyboard).__TAU_NATIVE_KB_HEIGHT === "number";
}

function caretFromPoint(x: number, y: number): CaretHit | null {
  if (typeof document.caretPositionFromPoint === "function") {
    const position = document.caretPositionFromPoint(x, y);
    return position ? { node: position.offsetNode, offset: position.offset } : null;
  }
  const legacy = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => globalThis.Range | null;
  };
  const range = legacy.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

function selectionsEqual(left: BaseSelection, right: BaseSelection): boolean {
  if (!left || !right) return left === right;
  return Range.equals(left, right);
}

/** 阻止按钮按下时抢走编辑器焦点 */
function keepEditorFocus(event: { preventDefault: () => void }) {
  event.preventDefault();
}

/** 光标点前后各 6 个字符，用于核对落点 */
function textAround(editor: SlateEditor, point: { path: number[]; offset: number }) {
  try {
    const [blockEntry] = SlateEditor.nodes(editor, {
      at: point,
      match: node => Element.isElement(node) && SlateEditor.isBlock(editor, node),
      mode: "lowest",
    });
    if (!blockEntry) return null;
    const blockPath = blockEntry[1];
    const before = SlateEditor.string(editor, {
      anchor: SlateEditor.start(editor, blockPath),
      focus: point,
    });
    const after = SlateEditor.string(editor, {
      anchor: point,
      focus: SlateEditor.end(editor, blockPath),
    });
    return { before: before.slice(-6), after: after.slice(0, 6) };
  } catch {
    return null;
  }
}

export function EditorLabPage() {
  const pageNavigator = useNavigator();
  const keyboardViewport = useKeyboardViewport();
  const { viewportHeight, keyboardHeight, rawKeyboardHeight, reservedHeight, lastKeyboardHeight } =
    keyboardViewport;
  const reservation = useKeyboardReservation();
  const { log, clear, entries, buildReport } = useLabLog();
  const editorRef = useRef<EditorRef | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [initialContent] = useState(createLabSampleContent);
  const [editing, setEditing] = useState(false);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const [editorFocused, setEditorFocused] = useState(false);
  const [stripOpen, setStripOpen] = useState(true);
  const [focusTiming, setFocusTiming] = useState<FocusTiming>("sync");
  const [strategy, setStrategy] = useState<KeyboardSwapStrategy>(DEFAULT_KEYBOARD_SWAP_STRATEGY);
  const [manualReport, setManualReport] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelOpenRef = useRef(false);
  const rawKeyboardHeightRef = useRef(rawKeyboardHeight);
  rawKeyboardHeightRef.current = rawKeyboardHeight;
  const previousReservedRef = useRef(reservedHeight);
  const exitReleaseRef = useRef(false);
  const lastSelectionRef = useRef<BaseSelection | null>(null);
  const savedSelectionRef = useRef<BaseSelection | null>(null);
  const openStrategyRef = useRef<KeyboardSwapStrategy>(DEFAULT_KEYBOARD_SWAP_STRATEGY);
  const composingRef = useRef(false);
  const cancelShowKeyboardRef = useRef<(() => void) | null>(null);
  const cancelSwapMeasureRef = useRef<(() => void) | null>(null);
  const timersRef = useRef(new Set<number>());
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const keyboardWaitRef = useRef<{ startedAt: number; trigger: string; timer: number } | null>(
    null
  );

  // 有效键盘高度已包含底部预留
  const showAccessoryBar = editing && (keyboardHeight > 0 || panelOpen);

  useEffect(() => {
    const viewport = window.visualViewport;
    log("kb", {
      keyboardHeight: rawKeyboardHeight,
      source: hasNativeKeyboardHeight() ? "native" : "viewport",
      vvHeight: viewport?.height ?? null,
      innerHeight: window.innerHeight,
    });
    const pending = keyboardWaitRef.current;
    if (pending && rawKeyboardHeight > 0) {
      window.clearTimeout(pending.timer);
      keyboardWaitRef.current = null;
      log("kb-shown", {
        trigger: pending.trigger,
        ms: Math.round(performance.now() - pending.startedAt),
        keyboardHeight: rawKeyboardHeight,
      });
    }
  }, [rawKeyboardHeight, log]);

  // 预留从有值变为 0 时记录：原始键盘达到释放比例为 keyboard，否则为 timeout；退出编辑为 exit
  useEffect(() => {
    const previous = previousReservedRef.current;
    previousReservedRef.current = reservedHeight;
    if (previous <= 0 || reservedHeight > 0) return;
    const keyboardHeight = rawKeyboardHeightRef.current;
    const reachedRatio = keyboardHeight >= previous * KEYBOARD_RESERVE_RELEASE_RATIO;
    const reason = exitReleaseRef.current ? "exit" : reachedRatio ? "keyboard" : "timeout";
    exitReleaseRef.current = false;
    log("reserve-release", { reason, keyboardHeight, reservedBefore: previous });
  }, [reservedHeight, log]);

  useEffect(() => {
    const viewport = window.visualViewport;
    let frame = 0;
    const pendingEvents = new Set<string>();
    const flush = () => {
      frame = 0;
      log("vv", {
        events: [...pendingEvents],
        vvHeight: viewport?.height ?? null,
        vvOffsetTop: viewport?.offsetTop ?? null,
        innerHeight: window.innerHeight,
      });
      pendingEvents.clear();
    };
    const schedule = (name: string) => {
      pendingEvents.add(name);
      if (!frame) frame = window.requestAnimationFrame(flush);
    };
    const onViewportResize = () => schedule("vv-resize");
    const onViewportScroll = () => schedule("vv-scroll");
    const onWindowResize = () => schedule("window-resize");
    viewport?.addEventListener("resize", onViewportResize);
    viewport?.addEventListener("scroll", onViewportScroll);
    window.addEventListener("resize", onWindowResize);
    return () => {
      viewport?.removeEventListener("resize", onViewportResize);
      viewport?.removeEventListener("scroll", onViewportScroll);
      window.removeEventListener("resize", onWindowResize);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [log]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      if (keyboardWaitRef.current) window.clearTimeout(keyboardWaitRef.current.timer);
      cancelShowKeyboardRef.current?.();
      cancelSwapMeasureRef.current?.();
      timers.forEach(timer => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const later = (callback: () => void, delayMs: number) => {
    const timer = window.setTimeout(() => {
      timersRef.current.delete(timer);
      callback();
    }, delayMs);
    timersRef.current.add(timer);
  };

  const waitForKeyboard = (trigger: string) => {
    if (keyboardWaitRef.current) window.clearTimeout(keyboardWaitRef.current.timer);
    if (rawKeyboardHeight > 0) {
      keyboardWaitRef.current = null;
      log("kb-shown", {
        trigger,
        ms: 0,
        keyboardHeight: rawKeyboardHeight,
        alreadyVisible: true,
      });
      return;
    }
    const startedAt = performance.now();
    const timer = window.setTimeout(() => {
      keyboardWaitRef.current = null;
      log("kb-timeout", { trigger, waitedMs: KEYBOARD_WAIT_MS });
    }, KEYBOARD_WAIT_MS);
    keyboardWaitRef.current = { startedAt, trigger, timer };
  };

  const focusEditor = (editor: SlateEditor, timing: FocusTiming) => {
    const startedAt = performance.now();
    if (!editor.selection && !lastSelectionRef.current) {
      Transforms.select(editor, SlateEditor.end(editor, []));
    }
    restoreSelectionAndFocus(editor, lastSelectionRef.current);
    log("focus-call", {
      timing,
      costMs: Math.round((performance.now() - startedAt) * 10) / 10,
      activeIsEditor: editorRef.current?.getEditableElement() === document.activeElement,
    });
  };

  const enterEditingByButton = () => {
    const editor = editorRef.current?.getEditor();
    if (!editor) return;
    waitForKeyboard("button");
    flushSync(() => setEditing(true));
    focusEditor(editor, "sync");
  };

  const exitEditing = () => {
    const editor = editorRef.current?.getEditor();
    clearKeyboardSwap(editorRef.current?.getEditableElement());
    cancelShowKeyboardRef.current?.();
    cancelSwapMeasureRef.current?.();
    panelOpenRef.current = false;
    setPanelOpen(false);
    if (reservedHeight > 0) exitReleaseRef.current = true;
    reservation.releaseNow();
    setEditing(false);
    if (!editor) return;
    lastSelectionRef.current = editor.selection ?? savedSelectionRef.current;
    ReactEditor.blur(editor as ReactEditor);
    Transforms.deselect(editor);
  };

  const enterEditingAtPoint = (x: number, y: number) => {
    const editor = editorRef.current?.getEditor();
    if (!editor) return;
    const caret = caretFromPoint(x, y);
    waitForKeyboard("dbltap");
    flushSync(() => setEditing(true));

    const selectAndFocus = () => {
      const point = caret
        ? ReactEditor.toSlatePoint(editor as ReactEditor, [caret.node, caret.offset], {
            exactMatch: false,
            suppressThrow: true,
          })
        : null;
      if (point) Transforms.select(editor, point);
      log("dbltap", {
        x: Math.round(x),
        y: Math.round(y),
        caretFound: caret !== null,
        slatePoint: point,
        around: point ? textAround(editor, point) : null,
      });
      focusEditor(editor, focusTiming);
    };

    if (focusTiming === "raf") {
      window.requestAnimationFrame(selectAndFocus);
    } else {
      selectAndFocus();
    }
  };

  /** 参照点：保存选区的 DOM 矩形；无法取得时用正文区第一个可见块 */
  const readReference = (editor: SlateEditor): { name: string; readTop: () => number } => {
    const selection = savedSelectionRef.current ?? editor.selection;
    if (selection) {
      try {
        const readTop = () =>
          ReactEditor.toDOMRange(editor as ReactEditor, selection).getBoundingClientRect().top;
        const rect = ReactEditor.toDOMRange(
          editor as ReactEditor,
          selection
        ).getBoundingClientRect();
        if (rect.top !== 0 || rect.height !== 0) return { name: "selection", readTop };
      } catch {
        // 选区无法映射到 DOM 时改用可见块
      }
    }
    const container = scrollRef.current;
    const containerTop = container?.getBoundingClientRect().top ?? 0;
    const blocks = container
      ? Array.from(container.querySelectorAll<HTMLElement>("[data-slate-node=element]"))
      : [];
    const visibleBlock = blocks.find(block => block.getBoundingClientRect().bottom > containerTop);
    if (visibleBlock) {
      return { name: "visible-block", readTop: () => visibleBlock.getBoundingClientRect().top };
    }
    return { name: "none", readTop: () => 0 };
  };

  const startSwapMeasure = (editor: SlateEditor, direction: SwapDirection) => {
    cancelSwapMeasureRef.current?.();
    const reference = readReference(editor);
    cancelSwapMeasureRef.current = measureSwapSettle({
      direction,
      reference: reference.name,
      readReferenceTop: reference.readTop,
      readRootHeight: () => rootRef.current?.getBoundingClientRect().height ?? 0,
      readKeyboardHeight: () => rawKeyboardHeightRef.current,
      onDone: result => {
        cancelSwapMeasureRef.current = null;
        log("swap-settle", result);
      },
    });
  };

  const openPanel = () => {
    const editor = editorRef.current?.getEditor();
    if (!editor || panelOpenRef.current) return;
    const saved = editor.selection ?? lastSelectionRef.current;
    savedSelectionRef.current = saved;
    openStrategyRef.current = strategy;
    const panelHeight = resolvePanelHeight(keyboardViewport);
    const keyboardBefore = rawKeyboardHeight;
    cancelShowKeyboardRef.current?.();
    startSwapMeasure(editor, "open");
    panelOpenRef.current = true;
    flushSync(() => {
      reservation.reserve(panelHeight);
      setPanelOpen(true);
    });
    hideKeyboard(editor, strategy, editorRef.current?.getEditableElement());
    log("panel-open", {
      strategy,
      panelHeight,
      panelHeightSource: panelHeight === lastKeyboardHeight ? "measured" : "fallback",
      keyboardBefore,
      saved,
    });
    if (composingRef.current) {
      log("ime-during-open", { composing: true, length: SlateNode.string(editor).length });
      later(() => {
        log("ime-after-open", {
          composing: composingRef.current,
          length: SlateNode.string(editor).length,
        });
      }, IME_RECHECK_MS);
    }
  };

  /** 面板关闭的共同收尾：回到键盘、隐藏面板、按键盘高度或超时释放预留、采样位移并检查选区 */
  const closePanel = (trigger: PanelCloseTrigger) => {
    const editor = editorRef.current?.getEditor();
    if (!editor || !panelOpenRef.current) return;
    // 先置位，回键盘触发的编辑器 focus 不再进入 tap-editor 路径
    panelOpenRef.current = false;
    const saved = savedSelectionRef.current;
    const openStrategy = openStrategyRef.current;
    const keyboardBefore = rawKeyboardHeight;
    startSwapMeasure(editor, "close");
    cancelShowKeyboardRef.current?.();
    // 用户点正文时选区由点击位置决定，不恢复保存的选区
    cancelShowKeyboardRef.current = showKeyboard(
      editor,
      openStrategy,
      editorRef.current?.getEditableElement(),
      saved,
      {
        restoreSelection: trigger === "keyboard-button",
        isKeyboardShown: () => rawKeyboardHeightRef.current > 0,
        onFallback: () => {
          log("inputmode-fallback", { trigger, keyboardHeight: rawKeyboardHeightRef.current });
        },
      }
    );
    setPanelOpen(false);
    reservation.releaseWhenKeyboardShown();
    log("panel-close", {
      trigger,
      strategy: openStrategy,
      panelHeight: reservedHeight,
      keyboardBefore,
      saved,
    });
    later(() => {
      const current = editor.selection;
      log("selection-restore", {
        trigger,
        equal: selectionsEqual(current, saved),
        selection: current,
        saved,
        activeIsEditor: document.activeElement === editorRef.current?.getEditableElement(),
      });
    }, SELECTION_CHECK_MS);
  };

  const returnToKeyboard = () => closePanel("keyboard-button");

  const closePanelByEditorTap = () => closePanel("tap-editor");

  const runPanelAction = (action: PanelAction) => {
    const editor = editorRef.current?.getEditor();
    if (!editor) return;
    let error: string | null = null;
    try {
      const saved = savedSelectionRef.current;
      if (saved) Transforms.select(editor, saved);
      if (action === "heading-one") {
        applyHeaderBlock(editor, 1);
      } else {
        toggleMark(editor, action);
      }
      savedSelectionRef.current = editor.selection;
    } catch (caught) {
      error = String(caught);
    }
    log("panel-action", { action, selection: editor.selection, error });
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (editing) {
      // inputmode 策略下编辑器始终持有焦点，点正文不会触发 focus，需在此识别
      if (panelOpenRef.current && openStrategyRef.current === "inputmode") {
        closePanelByEditorTap();
      }
      return;
    }
    const now = performance.now();
    const lastTap = lastTapRef.current;
    const isDoubleTap =
      lastTap !== null &&
      now - lastTap.time <= DOUBLE_TAP_MS &&
      Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < DOUBLE_TAP_SLOP_PX;
    if (isDoubleTap) {
      lastTapRef.current = null;
      enterEditingAtPoint(event.clientX, event.clientY);
      return;
    }
    lastTapRef.current = { time: now, x: event.clientX, y: event.clientY };
  };

  const handleReadClick = (event: MouseEvent<HTMLDivElement>) => {
    if (editing) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const editor = editorRef.current?.getEditor();
    let elementType: string | null = null;
    const elementDom = target?.closest<HTMLElement>('[data-slate-node="element"]');
    if (editor && elementDom) {
      try {
        const node = ReactEditor.toSlateNode(editor as ReactEditor, elementDom);
        elementType = Element.isElement(node) ? node.type : null;
      } catch {
        elementType = null;
      }
    }
    log("read-click", {
      tag: target?.tagName ?? null,
      slateNode: target?.closest("[data-slate-node]")?.getAttribute("data-slate-node") ?? null,
      elementType,
    });
  };

  const copyReport = async () => {
    const report = buildReport();
    try {
      await window.navigator.clipboard.writeText(report);
      setManualReport(null);
      log("report-copied", { length: report.length });
    } catch (error) {
      setManualReport(report);
      log("report-copy-failed", { message: String(error) });
    }
  };

  const viewport = typeof window !== "undefined" ? window.visualViewport : null;
  const focusInEditor =
    typeof document !== "undefined" &&
    !!editorRef.current?.getEditableElement()?.contains(document.activeElement);
  const recentEntries = entries.slice(-RECENT_LOG_COUNT).reverse();

  return (
    <div
      ref={rootRef}
      className="bg-page text-ink-1 fixed inset-x-0 top-0 flex flex-col"
      style={{ height: viewportHeight }}
    >
      <header className="border-line-1 flex shrink-0 items-center gap-2 border-b px-2 pb-2 pt-[calc(var(--mobile-safe-top)+6px)]">
        <button
          type="button"
          aria-label="返回"
          onClick={() => void pageNavigator.goBack("ui")}
          className="active:bg-press flex h-9 w-9 items-center justify-center rounded-full"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <h1 className="flex-1 text-[15px] font-bold">编辑器实验室</h1>
        <button
          type="button"
          onClick={editing ? exitEditing : enterEditingByButton}
          className="bg-accent text-ink-inverse rounded-full px-4 py-1.5 text-sm font-semibold"
        >
          {editing ? "完成" : "编辑"}
        </button>
      </header>

      <section className="bg-surface border-line-1 text-ink-2 shrink-0 border-b px-3 py-1.5 font-mono text-[10.5px] leading-snug">
        <button
          type="button"
          onClick={() => setStripOpen(open => !open)}
          className="flex w-full items-center justify-between"
        >
          <span>
            kb={keyboardHeight} vh={viewportHeight} inner={window.innerHeight} editing=
            {String(editing)}
          </span>
          {stripOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {stripOpen ? (
          <div className="mt-1 space-y-1">
            <div>
              vv.h={viewport ? Math.round(viewport.height) : "-"} vv.top=
              {viewport ? Math.round(viewport.offsetTop) : "-"} native=
              {String(hasNativeKeyboardHeight())} focus={String(focusInEditor)}/
              {String(editorFocused)} raw={rawKeyboardHeight} reserved={reservedHeight} effective=
              {keyboardHeight} last={lastKeyboardHeight}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => void copyReport()}
                className="bg-accent-soft text-ink-1 rounded px-2 py-0.5"
              >
                复制报告
              </button>
              <button
                type="button"
                onClick={() => {
                  clear();
                  setManualReport(null);
                }}
                className="border-line-1 rounded border px-2 py-0.5"
              >
                清空日志
              </button>
              <button
                type="button"
                onClick={() => setFocusTiming(timing => (timing === "sync" ? "raf" : "sync"))}
                className="border-line-1 rounded border px-2 py-0.5"
              >
                聚焦时机：{focusTiming === "sync" ? "同步" : "rAF 延迟"}
              </button>
              <span className="border-line-1 inline-flex items-center overflow-hidden rounded border">
                <span className="px-1.5 py-0.5">策略</span>
                {SWAP_STRATEGIES.map(option => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setStrategy(option)}
                    className={
                      option === strategy ? "bg-accent-soft text-ink-1 px-2 py-0.5" : "px-2 py-0.5"
                    }
                  >
                    {option}
                  </button>
                ))}
              </span>
            </div>
            {manualReport !== null ? (
              <textarea
                readOnly
                value={manualReport}
                onFocus={event => event.currentTarget.select()}
                className="bg-page border-line-1 h-24 w-full rounded border p-1"
              />
            ) : null}
            <ol className="space-y-0.5">
              {recentEntries.map((entry, index) => (
                <li key={`${entry.t}-${index}`} className="truncate">
                  {entry.t} {entry.type} {JSON.stringify(entry.data)}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
        onPointerUp={handlePointerUp}
        onClickCapture={handleReadClick}
        onCompositionStartCapture={() => {
          composingRef.current = true;
        }}
        onCompositionEndCapture={() => {
          composingRef.current = false;
        }}
      >
        <Editor
          kit={getMobileContentKit()}
          ref={editorRef}
          initValue={initialContent}
          readonly={!editing}
          className="mobile-card-editor-content outline-none ring-0 focus:outline-none focus:ring-0"
          onFocus={() => {
            setEditorFocused(true);
            if (panelOpenRef.current) closePanelByEditorTap();
          }}
          onBlur={() => setEditorFocused(false)}
          onChange={(_value, editor) => {
            const operationTypes = editor.operations
              .map(operation => operation.type)
              .filter(type => type !== "set_selection");
            if (operationTypes.length > 0) {
              log("change", { editing: editingRef.current, operationTypes });
            }
          }}
        />
      </div>

      {showAccessoryBar ? (
        <div
          className="bg-surface border-line-1 flex shrink-0 items-center justify-between border-t px-2"
          style={{ height: ACCESSORY_BAR_HEIGHT }}
        >
          <button
            type="button"
            onPointerDown={keepEditorFocus}
            onMouseDown={keepEditorFocus}
            onClick={panelOpen ? returnToKeyboard : openPanel}
            className={
              panelOpen
                ? "bg-accent-soft rounded-lg px-3 py-1.5 text-sm font-semibold"
                : "active:bg-press rounded-lg px-3 py-1.5 text-sm font-semibold"
            }
          >
            Aa
          </button>
          {panelOpen ? (
            <button
              type="button"
              aria-label="键盘"
              onPointerDown={keepEditorFocus}
              onMouseDown={keepEditorFocus}
              onClick={returnToKeyboard}
              className="active:bg-press flex h-9 w-9 items-center justify-center rounded-lg"
            >
              <Keyboard size={20} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="收起键盘"
              onPointerDown={keepEditorFocus}
              onMouseDown={keepEditorFocus}
              onClick={exitEditing}
              className="active:bg-press flex h-9 w-9 items-center justify-center rounded-lg"
            >
              <KeyboardOff size={20} aria-hidden="true" />
            </button>
          )}
        </div>
      ) : null}

      {panelOpen ? (
        <div
          className="bg-surface fixed inset-x-0 bottom-0 flex flex-col gap-3 px-4 py-3"
          style={{ height: reservedHeight }}
          onPointerDown={keepEditorFocus}
          onMouseDown={keepEditorFocus}
        >
          <div className="flex gap-2">
            {PANEL_ACTIONS.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => runPanelAction(item.id)}
                className="border-line-1 active:bg-press h-10 min-w-12 rounded-lg border px-3 text-sm font-bold"
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="text-ink-2 font-mono text-[11px]">
            策略：{openStrategyRef.current} · 高度 {reservedHeight}px
          </p>
        </div>
      ) : null}
    </div>
  );
}

export default EditorLabPage;
