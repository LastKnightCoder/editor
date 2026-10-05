import { Editor, Range, Transforms, type BaseSelection, type RangeRef } from "slate";
import type { LinkElement } from "../types";
import { findLinkEntry } from "../operations";

/** 悬停停留多久才出现；划过不打扰。 */
export const HOVER_OPEN_DELAY = 350;
/** 离开链接后的宽限，让指针能移进浮层。 */
export const HOVER_CLOSE_GRACE = 220;
/** 光标停在链接里多久后出现。 */
export const CARET_OPEN_DELAY = 450;
/** 取消链接后「撤销」的保留时长。 */
export const NOTICE_DURATION = 3500;

export type LinkPanelState =
  | { mode: "closed" }
  | { mode: "view"; element: LinkElement; via: "hover" | "caret"; pointerY: number | null }
  | {
      mode: "edit";
      element: LinkElement;
      pointerY: number | null;
      /** 打开前的选区，Esc 还原时放回 */
      restore: BaseSelection;
    }
  | { mode: "create"; range: RangeRef; placement: "above" | "below" }
  | { mode: "notice"; range: RangeRef; url: string };

export type LinkPanelMode = LinkPanelState["mode"];

const CLOSED: LinkPanelState = { mode: "closed" };

/**
 * 每个编辑器一个链接浮层：查看、编辑、新建、撤销提示共用同一个容器，
 * 链接之间悬停可直接热切换。
 */
export class LinkPanelController {
  private state: LinkPanelState = CLOSED;
  private readonly listeners = new Set<() => void>();
  private openTimer = 0;
  private closeTimer = 0;
  private caretTimer = 0;
  private noticeTimer = 0;
  /** 开始打字后，光标所在链接不再自动弹出，直到光标离开它 */
  private suppressedCaretPath: string | null = null;

  constructor(private readonly editor: Editor) {}

  getState = (): LinkPanelState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: LinkPanelState) {
    // 离开新建 / 撤销提示时释放它们持有的选区引用
    const prev = this.state;
    if ((prev.mode === "create" || prev.mode === "notice") && next !== prev) prev.range.unref();
    window.clearTimeout(this.noticeTimer);
    this.state = next;
    this.listeners.forEach(listener => listener());
  }

  private clearHoverTimers() {
    window.clearTimeout(this.openTimer);
    window.clearTimeout(this.closeTimer);
  }

  /** 编辑和新建期间悬停与光标都不打断。 */
  private get busy() {
    return this.state.mode === "edit" || this.state.mode === "create";
  }

  close = () => {
    this.clearHoverTimers();
    window.clearTimeout(this.caretTimer);
    if (this.state.mode !== "closed") this.set(CLOSED);
  };

  hoverEnter(element: LinkElement, pointerY: number) {
    if (this.busy) return;
    window.clearTimeout(this.closeTimer);
    const { state } = this;
    if (state.mode === "view") {
      if (state.element !== element) this.set({ mode: "view", element, via: "hover", pointerY });
      return;
    }
    window.clearTimeout(this.openTimer);
    this.openTimer = window.setTimeout(
      () => this.set({ mode: "view", element, via: "hover", pointerY }),
      HOVER_OPEN_DELAY
    );
  }

  /** 跨行链接：浮层跟随指针所在的行。 */
  hoverMove(element: LinkElement, pointerY: number) {
    const { state } = this;
    if (state.mode !== "view" || state.via !== "hover" || state.element !== element) return;
    if (state.pointerY !== null && Math.abs(state.pointerY - pointerY) < 6) return;
    this.set({ ...state, pointerY });
  }

  hoverLeave(element: LinkElement) {
    window.clearTimeout(this.openTimer);
    const { state } = this;
    if (state.mode === "view" && state.via === "hover" && state.element === element) {
      this.scheduleClose();
    }
  }

  panelEnter() {
    window.clearTimeout(this.closeTimer);
  }

  panelLeave() {
    const { state } = this;
    if (state.mode === "view" && state.via === "hover") this.scheduleClose();
  }

  private scheduleClose() {
    window.clearTimeout(this.closeTimer);
    this.closeTimer = window.setTimeout(this.close, HOVER_CLOSE_GRACE);
  }

  /** 选区变化：光标停在链接里一会儿出现浮层，离开即收起。 */
  caretChanged(selection: BaseSelection, focused: boolean) {
    if (this.busy) return;
    window.clearTimeout(this.caretTimer);
    const entry =
      focused && selection && Range.isCollapsed(selection)
        ? findLinkEntry(this.editor, selection)
        : undefined;
    const pathKey = entry ? entry[1].join(".") : null;
    if (pathKey !== this.suppressedCaretPath) this.suppressedCaretPath = null;

    const { state } = this;
    if (state.mode === "view" && state.via === "caret" && state.element !== entry?.[0]) {
      this.close();
    }
    if (!entry || this.suppressedCaretPath) return;
    if (state.mode === "view" && state.element === entry[0]) return;
    const [element] = entry;
    this.caretTimer = window.setTimeout(() => {
      if (this.busy) return;
      this.set({ mode: "view", element, via: "caret", pointerY: null });
    }, CARET_OPEN_DELAY);
  }

  /** 开始打字：收起查看浮层，并在光标离开这个链接前不再自动弹出。 */
  typed() {
    window.clearTimeout(this.caretTimer);
    window.clearTimeout(this.openTimer);
    const entry = findLinkEntry(this.editor);
    if (entry) this.suppressedCaretPath = entry[1].join(".");
    if (this.state.mode === "view") this.close();
  }

  openEdit(element: LinkElement, pointerY: number | null = null) {
    this.clearHoverTimers();
    window.clearTimeout(this.caretTimer);
    const keepY = this.state.mode === "view" && this.state.element === element;
    this.set({
      mode: "edit",
      element,
      pointerY: keepY ? (this.state as { pointerY: number | null }).pointerY : pointerY,
      restore: this.editor.selection,
    });
  }

  openCreate(range: Range, placement: "above" | "below") {
    this.clearHoverTimers();
    window.clearTimeout(this.caretTimer);
    this.set({ mode: "create", range: Editor.rangeRef(this.editor, range), placement });
  }

  /**
   * ⌘L 与工具条入口：选区在链接里时编辑该链接，否则在选区（或光标）处新建。
   */
  startFromSelection(placement: "above" | "below") {
    const { selection } = this.editor;
    if (!selection) return;
    const entry = findLinkEntry(this.editor, selection);
    if (entry) this.openEdit(entry[0]);
    else this.openCreate(selection, placement);
    // 悬浮工具条随展开选区显示，清掉选区让它让位；原选区已由浮层状态保存
    if (Range.isExpanded(selection)) Transforms.deselect(this.editor);
  }

  showNotice(range: RangeRef, url: string) {
    this.clearHoverTimers();
    this.set({ mode: "notice", range, url });
    this.noticeTimer = window.setTimeout(this.close, NOTICE_DURATION);
  }
}

const controllers = new WeakMap<Editor, LinkPanelController>();

export const linkPanelOf = (editor: Editor): LinkPanelController => {
  let controller = controllers.get(editor);
  if (!controller) {
    controller = new LinkPanelController(editor);
    controllers.set(editor, controller);
  }
  return controller;
};

/** 宿主自建工具条的链接入口：选区在链接里时编辑，否则新建 */
export const openLinkPanel = (editor: Editor): void =>
  linkPanelOf(editor).startFromSelection("below");
