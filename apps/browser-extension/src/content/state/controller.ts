/**
 * 内容脚本的总控：连接后台、维护本页标注与对话、跟踪选区与页面变化、响应 Tau 的页面工具请求。
 * UI 组件只读 store、调用这里的动作。
 */
import {
  COMPANION_METHODS,
  WEB_HIGHLIGHT_HASH,
  type HighlightColor,
} from "@tau/shared/browser-companion";
import type { AiRunEventNotification } from "@tau/shared/chat-core";
import { pageKeyOf } from "../../shared/messages";
import { notePendingKey } from "../../shared/note-storage";
import { BackgroundBridge } from "../bridge";
import { readBlocks } from "../page/extract";
import { PageAnnotations } from "./annotations";
import { configureToolInteractions, registerInteractionRenderers } from "@tau/chat-ui/conversation";
import { PageChat, QUICK_LABELS } from "./chat";
import { createInteractionHost } from "./interactions";
import {
  getState,
  patchChat,
  setState,
  showToast,
  toRect,
  type PanelTab,
  type QuickKind,
  type QuoteContext,
} from "./store";

const MUTATION_DEBOUNCE_MS = 800;
const URL_POLL_MS = 1000;

const storageGet = async <T>(key: string): Promise<T | undefined> =>
  (await chrome.storage.local.get(key))[key] as T | undefined;
const storageSet = (key: string, value: unknown) => chrome.storage.local.set({ [key]: value });

const isEditable = (node: Node | null) => {
  const element = node instanceof Element ? node : node?.parentElement;
  return Boolean(
    element?.closest("input, textarea, [contenteditable=''], [contenteditable='true']")
  );
};

export class CompanionController {
  readonly bridge: BackgroundBridge;
  readonly annotations: PageAnnotations;
  readonly chat: PageChat;
  private url = location.href;
  private selectionRange: Range | null = null;
  /** 快答气泡对应的原文，「存为批注」时用 */
  private bubbleRange: Range | null = null;
  private disposers: Array<() => void> = [];

  constructor(private readonly host: HTMLElement) {
    this.bridge = new BackgroundBridge({
      onStatus: status => {
        const previous = getState().status.state;
        setState({ status });
        if (status.state === "ready" && previous !== "ready") void this.onReady();
      },
      onNotify: (method, data) => {
        if (method === COMPANION_METHODS.runEvent)
          this.chat.onEvent(data as AiRunEventNotification);
      },
      onPageTool: (name, args) => this.runPageTool(name, args),
      onToggle: () => this.togglePanel(),
    });
    this.annotations = new PageAnnotations(host, items =>
      this.bridge.call("annotations.save", {
        url: pageKeyOf(this.url),
        title: document.title,
        items,
      })
    );
    this.chat = new PageChat(this.bridge);
  }

  async start(): Promise<void> {
    // 审批条与提问卡与桌面同一套，状态取自本页对话
    configureToolInteractions(createInteractionHost(this.chat));
    registerInteractionRenderers();
    this.bridge.start();
    this.bridge.setPage(this.url);
    setState({ pageUrl: this.url });
    this.chat.setPage(this.url);
    await this.loadPrefs();
    await this.loadPage();
    this.observe();
  }

  dispose(): void {
    configureToolInteractions(null);
    this.disposers.forEach(dispose => dispose());
    this.annotations.dispose();
  }

  // ———————— 页面与偏好 ————————

  private siteKey() {
    return location.hostname || "local";
  }

  private async loadPrefs(): Promise<void> {
    const site = this.siteKey();
    const [position, hidden, coachSeen] = await Promise.all([
      storageGet<{ side: "left" | "right"; ratio: number }>(`orb:${site}`),
      storageGet<boolean>(`hidden:${site}`),
      storageGet<boolean>("coach.seen"),
    ]);
    setState({
      side: position?.side ?? "right",
      orbRatio: position?.ratio ?? 0.62,
      hiddenOnSite: hidden === true,
      coachSeen: coachSeen === true,
    });
  }

  saveOrbPosition(side: "left" | "right", ratio: number): void {
    setState({ side, orbRatio: ratio });
    void storageSet(`orb:${this.siteKey()}`, { side, ratio });
  }

  dismissCoach(): void {
    setState({ coachSeen: true });
    void storageSet("coach.seen", true);
  }

  hideOnSite(): void {
    setState({ hiddenOnSite: true, panelOpen: false });
    void storageSet(`hidden:${this.siteKey()}`, true);
    showToast(`已在 ${this.siteKey()} 隐藏伴读，点工具栏的 Tau 图标可再次打开`);
  }

  private async loadPage(): Promise<void> {
    const key = pageKeyOf(this.url);
    const items = await this.bridge.call("annotations.load", { url: key }).catch(() => []);
    this.annotations.replaceAll(items);
    this.revealHashTarget();
  }

  /** 从 Tau 打开网页划线：URL 带 #tau-hl=<id> 时滚到那一条 */
  private revealHashTarget(): void {
    const match = location.hash.match(new RegExp(`${WEB_HIGHLIGHT_HASH}=([^&]+)`));
    const id = match?.[1];
    if (id) setTimeout(() => this.annotations.scrollTo(decodeURIComponent(id)), 300);
  }

  private async onReady(): Promise<void> {
    // 离线期间本机的标注已由后台补发；这里以 Tau 为准重新载入
    await this.loadPage();
    if (getState().panelOpen) void this.chat.load();
  }

  private onUrlChange(): void {
    if (pageKeyOf(location.href) === pageKeyOf(this.url)) {
      this.url = location.href;
      return;
    }
    this.url = location.href;
    setState({ pageUrl: this.url });
    this.bridge.setPage(this.url);
    this.chat.setPage(this.url);
    setState({ selection: null, bubble: null, editingNoteId: null, pinnedNoteId: null });
    void this.loadPage().then(() => {
      if (getState().panelOpen) void this.chat.load();
    });
  }

  private observe(): void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new MutationObserver(records => {
      if (records.every(record => this.host.contains(record.target))) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        this.chat.invalidateContent();
        this.annotations.relocate();
      }, MUTATION_DEBOUNCE_MS);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    const poll = setInterval(() => {
      if (location.href !== this.url) this.onUrlChange();
    }, URL_POLL_MS);

    let frame = 0;
    const relayout = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setState(state => ({ layoutVersion: state.layoutVersion + 1 }));
        this.refreshSelectionRect();
      });
    };
    addEventListener("scroll", relayout, { passive: true, capture: true });
    addEventListener("resize", relayout);

    const onPointerUp = (event: MouseEvent) => {
      if (event.composedPath().includes(this.host)) return;
      setTimeout(() => this.onPagePointerUp(event), 0);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.composedPath().includes(this.host)) return;
      if (event.shiftKey || event.key.startsWith("Arrow"))
        setTimeout(() => this.captureSelection(), 0);
    };
    document.addEventListener("mouseup", onPointerUp);
    document.addEventListener("keyup", onKeyUp);

    this.disposers.push(
      () => observer.disconnect(),
      () => clearInterval(poll),
      () => removeEventListener("scroll", relayout, { capture: true }),
      () => removeEventListener("resize", relayout),
      () => document.removeEventListener("mouseup", onPointerUp),
      () => document.removeEventListener("keyup", onKeyUp)
    );
  }

  // ———————— 选区 ————————

  private onPagePointerUp(event: MouseEvent): void {
    if (this.captureSelection()) return;
    const id = this.annotations.hitTest(event.clientX, event.clientY);
    if (id) this.selectAnnotation(id);
    else if (getState().selection) setState({ selection: null });
  }

  /** 页面上有非空选区就显示工具条；返回是否有选区 */
  private captureSelection(): boolean {
    const selection = getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return false;
    const range = selection.getRangeAt(0);
    if (
      this.host.contains(range.commonAncestorContainer) ||
      isEditable(range.commonAncestorContainer)
    )
      return false;
    const text = selection.toString().trim();
    if (!text) return false;
    this.selectionRange = range.cloneRange();
    setState({
      selection: {
        rect: toRect(range.getBoundingClientRect()),
        text,
        annotationId: null,
        block: this.blockOf(range),
      },
      bubble: null,
    });
    if (!getState().coachSeen) this.dismissCoach();
    return true;
  }

  private selectAnnotation(id: string): void {
    const range = this.annotations.rangeOf(id);
    const item = getState().annotations.find(annotation => annotation.id === id);
    if (!range || !item) return;
    this.selectionRange = range;
    setState({
      selection: {
        rect: toRect(range.getBoundingClientRect()),
        text: item.text,
        annotationId: id,
        block: this.blockOf(range),
      },
    });
  }

  private refreshSelectionRect(): void {
    const { selection } = getState();
    if (!selection || !this.selectionRange) return;
    setState({
      selection: { ...selection, rect: toRect(this.selectionRange.getBoundingClientRect()) },
    });
  }

  private blockOf(range: Range): number | null {
    const node = range.startContainer;
    const element = node instanceof Element ? node : node.parentElement;
    const block = this.chat.content().blocks.find(item => item.element.contains(element));
    return block?.index ?? null;
  }

  clearSelection(): void {
    this.selectionRange = null;
    getSelection()?.removeAllRanges();
    setState({ selection: null });
  }

  private currentQuote(): QuoteContext | null {
    const { selection } = getState();
    return selection ? { text: selection.text, block: selection.block } : null;
  }

  // ———————— 标注动作 ————————

  highlight(color: HighlightColor): void {
    const { selection } = getState();
    if (!selection) return;
    if (selection.annotationId) {
      this.annotations.update(selection.annotationId, { color });
      setState({ selection: null });
      return;
    }
    if (!this.selectionRange) return;
    const created = this.annotations.create(this.selectionRange, color);
    if (!created) showToast("这段文字没法标注");
    this.clearSelection();
  }

  /** 批注：新选区先以黄色高亮，再打开批注编辑 */
  annotate(): void {
    const { selection } = getState();
    if (!selection) return;
    let id = selection.annotationId;
    if (!id && this.selectionRange)
      id = this.annotations.create(this.selectionRange, "yellow")?.id ?? null;
    this.clearSelection();
    if (id) setState({ editingNoteId: id, pinnedNoteId: null });
  }

  saveNoteOf(id: string, note: string): void {
    this.annotations.update(id, { note: note.trim() });
    setState({ editingNoteId: null });
    if (note.trim()) showToast("批注已保存");
  }

  removeAnnotation(id: string): void {
    this.annotations.remove(id);
    showToast("已删除标注");
  }

  locateAnnotation(id: string): void {
    this.annotations.scrollTo(id);
  }

  excerpt(): void {
    const quote = this.currentQuote();
    if (!quote) return;
    const source = quote.block ? `（第 ${quote.block} 段）` : "";
    this.appendToNote(`> ${quote.text.replace(/\n/g, "\n> ")}\n> ${source}`.trimEnd());
    this.clearSelection();
    showToast("已摘录到页面笔记");
  }

  copySelection(): void {
    const quote = this.currentQuote();
    if (quote) void navigator.clipboard.writeText(quote.text).then(() => showToast("已复制"));
    this.clearSelection();
  }

  // ———————— 提问 ————————

  private ensureConnected(): boolean {
    const { state } = getState().status;
    if (state === "ready") return true;
    showToast(
      state === "pairing"
        ? "请先在 Tau 中确认连接，标注不受影响"
        : "还没连上 Tau：标注会先存在本机，连上后同步"
    );
    this.openPanel("chat");
    return false;
  }

  /** 选区快答：解释 / 翻译在原处气泡回答，概括与自由提问进面板 */
  async quickAsk(kind: QuickKind | "free"): Promise<void> {
    const quote = this.currentQuote();
    const rect = getState().selection?.rect;
    this.bubbleRange = this.selectionRange?.cloneRange() ?? null;
    this.clearSelection();
    if (!quote || !this.ensureConnected()) return;
    if (kind === "free") {
      patchChat({ quote });
      this.openPanel("chat");
      return;
    }
    await this.chat.load();
    if (kind === "summarize") {
      this.openPanel("chat");
      await this.chat.ask(QUICK_LABELS[kind], { quote, quick: kind });
      return;
    }
    setState({ bubble: { kind, quote, rect: rect!, runId: null, text: "", status: "streaming" } });
    const runId = await this.chat.ask(QUICK_LABELS[kind], { quote, quick: kind });
    const { bubble, chat } = getState();
    if (!bubble) return;
    setState({
      bubble: runId
        ? { ...bubble, runId }
        : { ...bubble, status: "error", error: chat.error ?? "提问失败" },
    });
  }

  closeBubble(): void {
    setState({ bubble: null });
  }

  /** 把快答的回答存成那段原文的批注 */
  bubbleToAnnotation(): void {
    const { bubble } = getState();
    if (!bubble || !this.bubbleRange) return;
    const created = this.annotations.create(this.bubbleRange, "purple", stripCites(bubble.text));
    this.bubbleRange = null;
    setState({ bubble: null });
    if (created) showToast("已存为批注");
  }

  // ———————— 面板 ————————

  togglePanel(): void {
    if (getState().panelOpen) this.closePanel();
    else this.openPanel();
  }

  openPanel(tab?: PanelTab): void {
    setState(state => ({ panelOpen: true, hiddenOnSite: false, tab: tab ?? state.tab }));
    this.dismissCoach();
    const { state } = getState().status;
    if (state === "unpaired" || state === "offline" || state === "revoked")
      void this.bridge.call("connect", undefined);
    void this.chat.load();
  }

  closePanel(): void {
    setState({ panelOpen: false });
  }

  setTab(tab: PanelTab): void {
    setState({ tab });
  }

  retryConnect(): void {
    void this.bridge.call("connect", undefined);
  }

  scrollToBlock(index: number): void {
    const block = this.chat.content().blocks.find(item => item.index === index);
    if (!block) return;
    block.element.scrollIntoView({ behavior: "smooth", block: "center" });
    const range = document.createRange();
    range.selectNodeContents(block.element);
    this.annotations.pulse(range);
  }

  // ———————— 页面笔记 ————————

  /**
   * 追加到页面笔记：草稿由笔记页（编辑器）独占写入，这里只往待追加队列放 Markdown，
   * 笔记页转换成编辑器节点后接到末尾（笔记页没打开时，下次打开再并入）。
   */
  appendToNote(markdown: string): void {
    const key = notePendingKey(this.url);
    void storageGet<string[]>(key).then(pending => storageSet(key, [...(pending ?? []), markdown]));
  }

  /** 笔记页地址（扩展页面，带当前网页与标题） */
  noteUrl(pageUrl: string): string {
    const query = new URLSearchParams({ url: pageKeyOf(pageUrl), title: document.title });
    return `${chrome.runtime.getURL("/note.html")}?${query}`;
  }

  // ———————— 页面工具（Tau 反向请求） ————————

  private async runPageTool(name: string, args: unknown): Promise<string> {
    const value = (args ?? {}) as { from?: number; to?: number };
    if (name === "read_page") {
      const from = Number(value.from) || 1;
      const to = Math.min(Number(value.to) || from + 39, from + 39);
      return readBlocks(this.chat.content(), from, to);
    }
    if (name === "get_annotations") {
      const items = getState().annotations;
      if (!items.length) return "用户还没有在本页做标注。";
      return items
        .map(item => `- 「${item.text}」${item.note ? `　批注：${item.note}` : ""}`)
        .join("\n");
    }
    throw new Error(`未知的页面工具：${name}`);
  }
}

/** 存批注时去掉回答里的 [n] 段落引用 */
export const stripCites = (text: string) => text.replace(/\s*\[\d{1,3}\]/g, "").trim();
