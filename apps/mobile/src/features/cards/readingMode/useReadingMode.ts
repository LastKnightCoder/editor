import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import type { EditorRef } from "@tau/editor";
import { documentTaskCheck, documentTaskIsChecked } from "@tau/shared/task-assistant";
import {
  Editor as SlateEditor,
  Element as SlateElement,
  Node as SlateNode,
  Text,
  Transforms,
  type BaseSelection,
  type Point,
  type Range,
} from "slate";
import { ReactEditor } from "slate-react";
import { restoreSelectionAndFocus } from "../editorToolbar/toolbarActions";
import type { MobileEditorToolbarController } from "../editorToolbar/useMobileEditorToolbarController";
import { caretFromPoint } from "./caretFromPoint";

export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_SLOP_PX = 24;

/** 待办勾选框：CheckListItem 中 li 的第一个子元素（CustomCheckbox 无稳定 class / data 属性） */
export const CHECK_LIST_CHECKBOX_SELECTOR = "[data-check-list-item] > li > :first-child";

/** 双击落在这些元素上时不进入编辑 */
const INTERACTIVE_SELECTOR = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "label",
  "img",
  "video",
  "audio",
  "[role='button']",
  "[data-slate-void]",
  CHECK_LIST_CHECKBOX_SELECTOR,
].join(",");

type UseReadingModeOptions = {
  editorRef: RefObject<EditorRef | null>;
  /** 协作建立中 / 协作只读等：强制阅读且不可进入编辑 */
  forcedReadonly: boolean;
  /** 首次拿到内容后的初始状态；null 表示内容未就绪，变为非 null 时只采用一次，true 时自动聚焦 */
  initialEditing: boolean | null;
  toolbarController: MobileEditorToolbarController;
};

export type ReadingSurfaceProps = {
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onClickCapture: (event: MouseEvent<HTMLElement>) => void;
};

export type ReadingModeState = {
  editing: boolean;
  canEdit: boolean;
  /** 必须在点击事件中同步调用：iOS 只在手势内同步聚焦才弹键盘 */
  enterEditing: () => void;
  /** 进入编辑、选中 range 并聚焦；同样须在点击事件中同步调用，之后可在同一事件内执行配件栏操作 */
  enterEditingWithSelection: (range: Range) => void;
  exitEditing: () => void;
  /** 展开到包裹编辑器的元素上 */
  readingSurfaceProps: ReadingSurfaceProps;
};

type Tap = { time: number; x: number; y: number };

function getSlateEditor(editorRef: RefObject<EditorRef | null>): SlateEditor | null {
  return (editorRef.current?.getEditor() as SlateEditor | undefined) ?? null;
}

function isPointValid(editor: SlateEditor, point: Point): boolean {
  if (!SlateNode.has(editor, point.path)) return false;
  const node = SlateNode.get(editor, point.path);
  return Text.isText(node) && point.offset <= node.text.length;
}

function isSelectionValid(editor: SlateEditor, selection: BaseSelection): boolean {
  return (
    !!selection && isPointValid(editor, selection.anchor) && isPointValid(editor, selection.focus)
  );
}

/** 编辑器内的交互元素；只读时编辑器根节点本身是 contenteditable=false，需排除 */
function isInteractiveTarget(target: Element): boolean {
  if (target.closest(INTERACTIVE_SELECTOR)) return true;
  const nonEditable = target.closest("[contenteditable='false']");
  return !!nonEditable && !nonEditable.hasAttribute("data-slate-editor");
}

function eventTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

export function useReadingMode(options: UseReadingModeOptions): ReadingModeState {
  const { editorRef, forcedReadonly, initialEditing, toolbarController } = options;
  const [editingState, setEditingState] = useState(false);
  const canEdit = !forcedReadonly;
  const editing = canEdit && editingState;
  const savedSelectionRef = useRef<BaseSelection | null>(null);
  const lastTapRef = useRef<Tap | null>(null);
  const initialAppliedRef = useRef(false);
  const pendingAutoFocusRef = useRef(false);

  /** 退出编辑的状态收尾（不调用 controller）：保存选区、清除选区、回阅读态；可重复调用 */
  const finishEditing = useCallback(() => {
    const editor = getSlateEditor(editorRef);
    if (editor?.selection) {
      savedSelectionRef.current = editor.selection;
    }
    if (editor) Transforms.deselect(editor);
    lastTapRef.current = null;
    setEditingState(false);
  }, [editorRef]);

  // 配件栏「收起键盘」经 controller.exitEditing 回调到这里
  const { setExitEditingListener } = toolbarController;
  useEffect(() => {
    setExitEditingListener(finishEditing);
    return () => setExitEditingListener(null);
  }, [finishEditing, setExitEditingListener]);

  useEffect(() => {
    if (forcedReadonly && editingState) finishEditing();
  }, [editingState, finishEditing, forcedReadonly]);

  useEffect(() => {
    if (initialEditing === null || initialAppliedRef.current) return;
    initialAppliedRef.current = true;
    if (initialEditing) {
      pendingAutoFocusRef.current = true;
      setEditingState(true);
    }
  }, [initialEditing]);

  // 非手势聚焦：iOS 可能不弹键盘
  useEffect(() => {
    if (!editing || !pendingAutoFocusRef.current) return;
    pendingAutoFocusRef.current = false;
    editorRef.current?.focus();
  }, [editing, editorRef]);

  /** 已切到编辑态后聚焦：有上次选区回到原位，否则光标到文末 */
  const focusAtSavedOrEnd = useCallback(() => {
    const editor = getSlateEditor(editorRef);
    if (!editor) return;
    const saved = savedSelectionRef.current;
    if (saved && isSelectionValid(editor, saved)) {
      restoreSelectionAndFocus(editor, saved);
    } else {
      editorRef.current?.focus();
    }
  }, [editorRef]);

  const enterEditing = useCallback(() => {
    if (forcedReadonly || !getSlateEditor(editorRef)) return;
    pendingAutoFocusRef.current = false;
    flushSync(() => setEditingState(true));
    focusAtSavedOrEnd();
  }, [editorRef, focusAtSavedOrEnd, forcedReadonly]);

  const enterEditingWithSelection = useCallback(
    (range: Range) => {
      const editor = getSlateEditor(editorRef);
      if (forcedReadonly || !editor) return;
      pendingAutoFocusRef.current = false;
      flushSync(() => setEditingState(true));
      Transforms.select(editor, range);
      restoreSelectionAndFocus(editor, range);
    },
    [editorRef, forcedReadonly]
  );

  const exitEditing = useCallback(() => {
    const editor = getSlateEditor(editorRef);
    if (editor?.selection) {
      savedSelectionRef.current = editor.selection;
    }
    toolbarController.exitEditing();
    finishEditing();
  }, [editorRef, finishEditing, toolbarController]);

  /** 双击进入编辑：先取 DOM 光标位置，切换编辑态后在同一手势内选中并聚焦 */
  const enterEditingAtPoint = useCallback(
    (x: number, y: number) => {
      const editor = getSlateEditor(editorRef);
      if (!editor) return;
      const caret = caretFromPoint(x, y);
      pendingAutoFocusRef.current = false;
      flushSync(() => setEditingState(true));
      const point = caret
        ? ReactEditor.toSlatePoint(editor as ReactEditor, [caret.node, caret.offset], {
            exactMatch: false,
            suppressThrow: true,
          })
        : null;
      if (!point) {
        focusAtSavedOrEnd();
        return;
      }
      Transforms.select(editor, point);
      restoreSelectionAndFocus(editor, null);
    },
    [editorRef, focusAtSavedOrEnd]
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (editing || !canEdit) return;
      const target = eventTargetElement(event.target);
      if (target && isInteractiveTarget(target)) {
        lastTapRef.current = null;
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
    },
    [canEdit, editing, enterEditingAtPoint]
  );

  /** 阅读态勾选待办：编辑器只读时勾选框忽略点击，由宿主直接改节点（改动照常经 onChange 保存） */
  const handleClickCapture = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (editing || !canEdit) return;
      const checkbox = eventTargetElement(event.target)?.closest(CHECK_LIST_CHECKBOX_SELECTOR);
      const itemElement = checkbox?.parentElement;
      const editor = getSlateEditor(editorRef);
      if (!itemElement || !editor) return;
      event.preventDefault();
      event.stopPropagation();
      try {
        const node = ReactEditor.toSlateNode(editor as ReactEditor, itemElement);
        if (!SlateElement.isElement(node) || node.type !== "check-list-item") return;
        const path = ReactEditor.findPath(editor as ReactEditor, node);
        const task = node as Parameters<typeof documentTaskIsChecked>[0];
        const patch = documentTaskCheck(task, !documentTaskIsChecked(task));
        if (patch) Transforms.setNodes(editor, patch, { at: path });
      } catch {
        // DOM 与 Slate 节点映射失效（正在重建）时忽略本次点击
      }
    },
    [canEdit, editing, editorRef]
  );

  return {
    editing,
    canEdit,
    enterEditing,
    enterEditingWithSelection,
    exitEditing,
    readingSurfaceProps: { onPointerUp: handlePointerUp, onClickCapture: handleClickCapture },
  };
}

export default useReadingMode;
