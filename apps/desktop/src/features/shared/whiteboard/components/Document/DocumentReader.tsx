/**
 * 文档阅读纸（白板 slots.CanvasLayer）：文档卡双击 / ↵ / 「展开」后，从卡片原位展开成可编辑的纸。
 * - 居中：画布压暗，纸居中；卡片是短内容，展开成更小的纸、高度随内容；
 * - 停靠右侧：画布可继续操作，选中另一张文档卡即换成那一篇；被面板挡住的卡片先平移出来；
 * - 两种摆放可在纸面右上角切换，记住上一次的选择；Esc / 点纸外 / 收起按钮收回原位。
 * 正文经 ContentEditor 实时保存；浮层根节点带 CANVAS_OVERLAY_ATTR，其中的按键、剪贴板、滚轮不归画布。
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useMemoizedFn } from "ahooks";
import {
  ExternalLink,
  FileText,
  FolderOpen,
  Minimize2,
  PanelRight,
  AppWindow,
  StickyNote,
  X,
} from "lucide-react";
import { cn, IconButton, toast, Tooltip } from "@tau/ui";
import {
  BoardUtil,
  CANVAS_OVERLAY_ATTR,
  DOCUMENT_CARD_RADIUS,
  DOCUMENT_OPEN_EVENT,
  ViewPortTransforms,
  isDocumentElement,
  useBoard,
  useSelection,
  type Board,
  type DocumentElement,
  type DocumentKind,
} from "@tau/whiteboard";
import ContentEditor from "@/components/ContentEditor";
import { CardContentPreview } from "@/features/cards/components/CardContentPreview";
import { getContentKit } from "@/services/editorKit";
import { openEntity } from "@/services/open-content";
import { DesktopEditorOverlayDismiss } from "@/services/editorOverlayDismiss";
import { DocumentPaper } from "./DocumentPaper";
import { DOCUMENT_KIND_LABEL, useDocumentSource, type DocumentSource } from "./source";
import {
  getDocumentReaderStore,
  useDocumentReaderPreference,
  useDocumentReaderState,
  type DocumentReaderMode,
} from "./readerStore";
import { SPRING, boxStyle, insetOf, prefersReducedMotion, relativeBox, type Box } from "./morph";

const FRAME_RADIUS = 16;
const HEADER_HEIGHT = 46;
const EDGE = 12;
/** 停靠时卡片离面板至少留这么宽，否则先平移画布 */
const DOCK_CLEARANCE = 24;

const KIND_ICON: Record<DocumentKind, typeof FileText> = {
  card: StickyNote,
  article: FileText,
  "project-item": FolderOpen,
};

function computeBox(
  mode: DocumentReaderMode,
  kind: DocumentKind,
  layer: { width: number; height: number },
  docHeight: number
): Box {
  const { width: W, height: H } = layer;
  if (mode === "dock") {
    const width = Math.min(W - EDGE * 2, Math.max(640, Math.min(720, W * 0.5)));
    return { left: W - width - EDGE, top: EDGE, width, height: H - EDGE * 2 };
  }
  const card = kind === "card";
  const width = Math.min(W - 64, card ? 560 : 780);
  const height = card ? Math.min(H - 40, Math.max(320, docHeight + HEADER_HEIGHT)) : H - 40;
  return { left: (W - width) / 2, top: (H - height) / 2, width, height };
}

const findCard = (layer: HTMLElement, id: string) =>
  Array.from(layer.parentElement?.querySelectorAll<HTMLElement>("[data-document-card]") ?? []).find(
    el => el.dataset.documentCard === id
  ) ?? null;

/** 画布平移 dx 屏幕像素（rAF 插值，与形变同步） */
function panBoard(board: Board, dx: number, duration: number) {
  const { minX, minY, zoom } = board.viewPort;
  const target = minX - dx / zoom;
  if (prefersReducedMotion()) return ViewPortTransforms.moveViewPort(board, target, minY);
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    ViewPortTransforms.moveViewPort(board, minX + (target - minX) * eased, minY);
    if (t < 1 && !board.isDestroyed) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function HeaderButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <Tooltip content={label} placement="bottom" arrow={false}>
      <IconButton aria-label={label} onClick={onClick}>
        {children}
      </IconButton>
    </Tooltip>
  );
}

interface ReaderProps {
  board: Board;
  element: DocumentElement;
  source: DocumentSource;
  mode: DocumentReaderMode;
  onModeChange(mode: DocumentReaderMode): void;
  onClosed(): void;
}

function Reader({ board, element, source, mode, onModeChange, onClosed }: ReaderProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const [layer, setLayer] = useState<{ width: number; height: number } | null>(null);
  // null = 尚未测量；卡片的居中纸高度随内容，要等测量后再展开
  const [docHeight, setDocHeight] = useState<number | null>(null);
  const phase = useRef<"opening" | "open" | "closing">("opening");
  const store = getDocumentReaderStore(board);

  const box = layer ? computeBox(mode, source.kind, layer, docHeight ?? 0) : null;
  const boxRef = useRef(box);
  boxRef.current = box;

  useLayoutEffect(() => {
    const el = layerRef.current!;
    const measure = () => setLayer({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const doc = docRef.current;
    if (!doc) return;
    setDocHeight(doc.offsetHeight);
    const observer = new ResizeObserver(() => setDocHeight(doc.offsetHeight));
    observer.observe(doc);
    return () => observer.disconnect();
  }, [layer !== null]);

  const setMorphing = (on: boolean) => {
    if (clipRef.current) clipRef.current.dataset.morphing = on ? "true" : "false";
    if (!on) clipRef.current?.style.removeProperty("clip-path");
  };

  /** 文档 DOM 在 from（卡片）与 to（纸面）之间形变；reverse 为收起 */
  const morph = (from: Box, to: Box, reverse: boolean) => {
    const layerEl = layerRef.current!;
    const doc = docRef.current!;
    const full = { left: 0, top: 0, width: layerEl.clientWidth, height: layerEl.clientHeight };
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setMorphing(true);
    const d = relativeBox(doc, layerEl);
    const cardRadius = DOCUMENT_CARD_RADIUS * board.viewPort.zoom;
    const atCard = `translate(${from.left - d.left}px, ${from.top - d.top}px) scale(${from.width / d.width})`;
    const atPaper = reverse ? `translateY(${-scrollTop}px)` : "none";
    const duration = reverse ? SPRING.duration * 0.85 : SPRING.duration;
    const options: KeyframeAnimationOptions = { duration, easing: SPRING.easing, fill: "forwards" };
    const frames = <T,>(card: T, paper: T) => (reverse ? [paper, card] : [card, paper]);

    doc.animate(frames({ transform: atCard }, { transform: atPaper }), options);
    shadowRef.current?.animate(
      frames(
        { ...boxStyle(from), borderRadius: `${cardRadius}px`, opacity: 0.4 },
        { ...boxStyle(to), borderRadius: `${FRAME_RADIUS}px`, opacity: 1 }
      ),
      options
    );
    headRef.current?.animate(
      reverse
        ? [{ opacity: 1 }, { opacity: 0, offset: 0.3 }, { opacity: 0 }]
        : [{ opacity: 0 }, { opacity: 0, offset: 0.45 }, { opacity: 1 }],
      { duration, fill: "forwards" }
    );
    if (mode === "center")
      scrimRef.current?.animate(frames({ opacity: 0 }, { opacity: 1 }), {
        duration: duration * 0.8,
        easing: "ease-out",
        fill: "forwards",
      });
    const clip = clipRef.current!.animate(
      frames(
        { clipPath: insetOf(from, full, cardRadius) },
        { clipPath: insetOf(to, full, FRAME_RADIUS) }
      ),
      options
    );
    // 收起的最后一段淡出，露出底下已复位的卡片，交接帧不闪
    if (reverse)
      clipRef.current!.animate([{ opacity: 1 }, { opacity: 1, offset: 0.82 }, { opacity: 0 }], {
        duration,
        fill: "forwards",
      });
    return clip.finished;
  };

  // 打开：等纸面盒子算出来后从卡片原位长出
  const ready = box !== null && (source.kind !== "card" || docHeight !== null);
  useLayoutEffect(() => {
    if (!ready || phase.current !== "opening") return;
    const layerEl = layerRef.current!;
    const to = boxRef.current!;
    const cardEl = findCard(layerEl, element.id);
    let from = cardEl ? relativeBox(cardEl, layerEl) : null;
    const settle = () => {
      if (phase.current !== "opening") return;
      phase.current = "open";
      setMorphing(false);
      for (const el of [docRef, shadowRef, headRef, scrimRef, clipRef])
        el.current?.getAnimations().forEach(animation => animation.cancel());
      frameRef.current?.focus({ preventScroll: true });
    };
    if (from && mode === "dock" && from.left + from.width > to.left - DOCK_CLEARANCE) {
      const shift = Math.max(
        to.left - DOCK_CLEARANCE - (from.left + from.width),
        DOCK_CLEARANCE - from.left
      );
      panBoard(board, shift, SPRING.duration);
      from = { ...from, left: from.left + shift };
    }
    if (!from || prefersReducedMotion()) {
      frameRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], 120);
      settle();
      return;
    }
    void morph(from, to, false).then(settle, settle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在首次就绪时展开一次
  }, [ready]);

  const close = useMemoizedFn(() => {
    if (phase.current === "closing") return;
    phase.current = "closing";
    store.setState({ closing: true });
    const layerEl = layerRef.current;
    const to = boxRef.current;
    const cardEl = layerEl ? findCard(layerEl, element.id) : null;
    if (!layerEl || !to || !cardEl || prefersReducedMotion()) return onClosed();
    (document.activeElement as HTMLElement | null)?.blur?.();
    void morph(relativeBox(cardEl, layerEl), to, true).then(onClosed, onClosed);
  });

  // 居中 ⇄ 停靠：纸面在两个盒子之间 FLIP
  const previousBox = useRef<Box | null>(null);
  const previousMode = useRef(mode);
  useLayoutEffect(() => {
    if (previousMode.current === mode) return;
    previousMode.current = mode;
    const from = previousBox.current;
    const to = boxRef.current;
    if (!from || !to || phase.current !== "open" || prefersReducedMotion()) return;
    const options = { duration: 420, easing: SPRING.easing };
    const keyframes = [boxStyle(from), boxStyle(to)];
    frameRef.current?.animate(keyframes, options);
    shadowRef.current?.animate(keyframes, options);
    scrimRef.current?.animate(
      mode === "center" ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }],
      { duration: 280, easing: "ease-out" }
    );
  }, [mode]);
  useLayoutEffect(() => {
    previousBox.current = box;
  });

  // 停靠时换篇：正文轻淡入，纸面不动
  const previousId = useRef(element.id);
  useLayoutEffect(() => {
    if (previousId.current === element.id) return;
    previousId.current = element.id;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (!prefersReducedMotion())
      scrollRef.current?.animate(
        [
          { opacity: 0, transform: "translateY(6px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 200, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
      );
  }, [element.id]);

  const openInPage = useMemoizedFn(() => {
    onClosed();
    openEntity(source).catch(error =>
      toast.error(error instanceof Error ? error.message : "打开失败")
    );
  });

  const Icon = KIND_ICON[source.kind];
  const crumb =
    source.kind === "project-item" ? source.projectName : DOCUMENT_KIND_LABEL[source.kind];
  const closeButton =
    mode === "center" ? (
      <HeaderButton label="收起  Esc" onClick={close}>
        <Minimize2 className="size-4" strokeWidth={1.75} />
      </HeaderButton>
    ) : (
      <HeaderButton label="关闭  Esc" onClick={close}>
        <X className="size-4" strokeWidth={1.75} />
      </HeaderButton>
    );

  return (
    <div
      ref={layerRef}
      {...{ [CANVAS_OVERLAY_ATTR]: "" }}
      className="pointer-events-none absolute inset-0 z-[8] overflow-hidden"
    >
      <DesktopEditorOverlayDismiss open onDismiss={close} />
      {mode === "center" && (
        <div
          ref={scrimRef}
          className="bg-overlay pointer-events-auto absolute inset-0"
          onClick={close}
        />
      )}
      {box && (
        <>
          <div
            ref={shadowRef}
            className="shadow-float absolute"
            style={{ ...boxStyle(box), borderRadius: FRAME_RADIUS }}
          />
          <div
            ref={clipRef}
            data-morphing="false"
            className="data-[morphing=true]:bg-surface group absolute inset-0"
          >
            <div
              ref={frameRef}
              tabIndex={-1}
              className={cn(
                "bg-surface pointer-events-auto absolute flex flex-col overflow-hidden outline-none",
                "group-data-[morphing=true]:overflow-visible group-data-[morphing=true]:bg-transparent",
                mode === "dock" && "ring-line-2 ring-1"
              )}
              style={{ ...boxStyle(box), borderRadius: FRAME_RADIUS }}
            >
              <div
                ref={headRef}
                className="flex shrink-0 items-center gap-1 pl-2.5 pr-2"
                style={{ height: HEADER_HEIGHT }}
              >
                {mode === "center" && closeButton}
                <div className="text-ink-3 ml-1 flex min-w-0 items-center gap-1.5 text-[12.5px]">
                  <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="shrink-0">{crumb}</span>
                  <span className="shrink-0">/</span>
                  <b className="text-ink-2 truncate font-medium">{source.title || "无标题"}</b>
                </div>
                <div className="flex-1" />
                {mode === "center" ? (
                  <HeaderButton label="停靠到右侧" onClick={() => onModeChange("dock")}>
                    <PanelRight className="size-4" strokeWidth={1.75} />
                  </HeaderButton>
                ) : (
                  <HeaderButton label="居中展开" onClick={() => onModeChange("center")}>
                    <AppWindow className="size-4" strokeWidth={1.75} />
                  </HeaderButton>
                )}
                <HeaderButton
                  label={`在${DOCUMENT_KIND_LABEL[source.kind]}页打开`}
                  onClick={openInPage}
                >
                  <ExternalLink className="size-4" strokeWidth={1.75} />
                </HeaderButton>
                {mode === "dock" && closeButton}
              </div>
              <div
                ref={scrollRef}
                className="min-h-0 flex-1 overflow-auto overscroll-contain group-data-[morphing=true]:overflow-visible"
              >
                <div ref={docRef} className="mx-auto w-fit origin-top-left">
                  <DocumentPaper source={source}>
                    <ContentEditor
                      key={source.contentId}
                      contentId={source.contentId}
                      kit={getContentKit()}
                      initValue={source.content}
                      readonly={board.readonly}
                      fallback={<CardContentPreview content={source.content} blocks={Infinity} />}
                      {...(source.kind === "card"
                        ? { source: { sourceType: "card", sourceId: source.id } }
                        : {})}
                      editingContext={{ entityType: source.kind, entityId: source.id }}
                    />
                  </DocumentPaper>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** slots.CanvasLayer：监听展开请求，停靠时跟随选中换篇 */
export function DocumentReaderLayer() {
  const board = useBoard();
  const store = getDocumentReaderStore(board);
  const openId = useDocumentReaderState(board, state => state.openId);
  const { mode, setMode } = useDocumentReaderPreference();
  const selection = useSelection();
  const element = openId
    ? (BoardUtil.getElementById(board, openId) as DocumentElement | null)
    : null;
  const { source, missing } = useDocumentSource(element?.entityRef ?? null);

  useEffect(() => {
    const onOpen = (id: string) => {
      if (store.getState().openId) return;
      const target = BoardUtil.getElementById(board, id);
      if (!isDocumentElement(target)) return;
      store.setState({ openId: id, closing: false });
    };
    board.on(DOCUMENT_OPEN_EVENT, onOpen);
    return () => board.off(DOCUMENT_OPEN_EVENT, onOpen);
  }, [board, store]);

  // 停靠时选中另一张文档卡 = 换成那一篇
  useEffect(() => {
    if (!openId || mode !== "dock" || store.getState().closing) return;
    const selected = selection?.selectedElements ?? [];
    const next = selected.length === 1 ? selected[0] : null;
    if (next && next.id !== openId && isDocumentElement(next)) store.setState({ openId: next.id });
  }, [selection, openId, mode, store]);

  const closed = useMemoizedFn(() => store.setState({ openId: null, closing: false }));

  // 元素被删除（含撤销其插入）或正文已删除：直接收起
  useEffect(() => {
    if (openId && (!element || missing)) closed();
  }, [openId, element, missing, closed]);

  if (!openId || !element || !source) return null;
  return (
    <Reader
      board={board}
      element={element}
      source={source}
      mode={mode}
      onModeChange={setMode}
      onClosed={closed}
    />
  );
}
