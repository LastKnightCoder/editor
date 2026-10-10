/**
 * 文档扩展的画布内阅读层：文档卡双击 / ↵ / 「展开」后，从卡片原位展开成可编辑的纸。
 * - 铺满：纸面盖住整个画布区域，正文在阅读版心里水平居中；
 * - 停靠右侧：画布可继续操作，选中另一张文档卡即换成那一篇；被面板挡住的卡片先平移出来；
 * - 两种摆放可在纸面右上角切换，记住上一次的选择；Esc / 收起按钮收回原位。
 * 正文经 ContentEditor 实时保存；浮层根节点带 CANVAS_OVERLAY_ATTR，其中的按键、剪贴板、滚轮不归画布。
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useMemoizedFn, useThrottleFn, useUnmount } from "ahooks";
import { useQueryClient } from "@tanstack/react-query";
import type { Descendant } from "slate";
import type { ContentSessionTarget } from "@tau/collaboration";
import {
  ExternalLink,
  FileText,
  Feather,
  FolderOpen,
  Minimize2,
  PanelRight,
  AppWindow,
  StickyNote,
  X,
} from "lucide-react";
import { cn, FadeScroll, IconButton, toast, Tooltip } from "@tau/ui";
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
import { updateDiarySegment } from "@/commands/diary";
import { CardContentPreview } from "@/features/cards/components/CardContentPreview";
import { getContentKit } from "@/services/editorKit";
import { openEntity } from "@/services/open-content";
import { openPage } from "@/services/page-navigation";
import { DesktopEditorOverlayDismiss } from "@/services/editorOverlayDismiss";
import { DocumentPaper } from "./DocumentPaper";
import { DOCUMENT_PAPER_WIDTH } from "./layout";
import { DOCUMENT_KIND_LABEL, useDocumentSource, type DocumentSource } from "./source";
import {
  getDocumentReaderStore,
  useDocumentReaderPreference,
  useDocumentReaderState,
  type DocumentReaderMode,
} from "./readerStore";
import { SPRING, boxStyle, prefersReducedMotion, relativeBox, type Box } from "./morph";
import { useDocumentHost } from "./DocumentHostContext";

/** 停靠纸面的圆角；铺满时贴合画布容器，由容器裁圆角 */
const FRAME_RADIUS = 16;
const HEADER_HEIGHT = 46;
const EDGE = 12;
/** 停靠时卡片离面板至少留这么宽，否则先平移画布 */
const DOCK_CLEARANCE = 24;

const KIND_ICON: Record<DocumentKind, typeof FileText> = {
  card: StickyNote,
  article: FileText,
  "project-item": FolderOpen,
  "diary-moment": Feather,
};

/** 盒子在图层上的裁切形状 */
function clipOf(box: Box, layer: { width: number; height: number }, radius: number) {
  const right = layer.width - box.left - box.width;
  const bottom = layer.height - box.top - box.height;
  return `inset(${box.top}px ${right}px ${bottom}px ${box.left}px round ${radius}px)`;
}

function computeBox(mode: DocumentReaderMode, layer: { width: number; height: number }): Box {
  const { width: W, height: H } = layer;
  if (mode === "center") return { left: 0, top: 0, width: W, height: H };
  const width = Math.min(W - EDGE * 2, Math.max(640, Math.min(720, W * 0.5)));
  return { left: W - width - EDGE, top: EDGE, width, height: H - EDGE * 2 };
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

/** 碎碎念节流同步字数与时间（同日记页）；主进程的 diary:changed 只广播其他窗口，同窗口的日记缓存在这里失效 */
const MOMENT_SYNC_WAIT = 800;

/** 只读全文：编辑器会话就绪前的占位，与编辑器同排版（去掉预览自带的上下内边距），换上编辑器时不位移 */
const BodyPreview = ({ source }: { source: DocumentSource }) => (
  <CardContentPreview content={source.content} blocks={Infinity} className="py-0" />
);

/** 正文编辑器：正文经文档会话落库；碎碎念另外节流同步片段的字数与时间 */
function DocumentEditor({ source, readonly }: { source: DocumentSource; readonly: boolean }) {
  const client = useQueryClient();
  const { moment } = source;
  const unsaved = useRef<Descendant[] | null>(null);
  const syncNow = useMemoizedFn(() => {
    const content = unsaved.current;
    if (!content || !moment) return;
    unsaved.current = null;
    updateDiarySegment({ segmentId: moment.segmentId, content })
      .then(() => {
        void client.invalidateQueries({ queryKey: ["diary"] });
        void client.invalidateQueries({ queryKey: ["home"] });
      })
      .catch(() => toast.error("碎碎念同步失败"));
  });
  // ahooks 的节流在卸载时会取消尾调用，最后一段改动由 useUnmount 补存
  const { run: throttledSync } = useThrottleFn(syncNow, { wait: MOMENT_SYNC_WAIT });
  useUnmount(syncNow);

  const sessionSource: Omit<ContentSessionTarget, "contentId"> | undefined =
    source.kind === "card"
      ? { sourceType: "card", sourceId: source.id }
      : moment
        ? { sourceType: "content", sourceId: source.contentId }
        : undefined;

  return (
    <ContentEditor
      contentId={source.contentId}
      kit={getContentKit()}
      initValue={source.content}
      readonly={readonly}
      fallback={<BodyPreview source={source} />}
      {...(sessionSource ? { source: sessionSource } : {})}
      editingContext={{ entityType: source.kind, entityId: moment?.segmentId ?? source.id }}
      {...(moment
        ? {
            onChange: (content: Descendant[]) => {
              unsaved.current = content;
              throttledSync();
            },
          }
        : {})}
    />
  );
}

interface ReaderProps {
  board: Board;
  element: DocumentElement;
  source: DocumentSource;
  mode: DocumentReaderMode;
  /** 宿主不允许停靠时不传，纸面上不出现切换按钮 */
  onModeChange?(mode: DocumentReaderMode): void;
  onClosed(): void;
}

function Reader({ board, element, source, mode, onModeChange, onClosed }: ReaderProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const [layer, setLayer] = useState<{ width: number; height: number } | null>(null);
  const phase = useRef<"opening" | "open" | "closing">("opening");
  /** 展开动画结束才挂编辑器：会话 IPC 与协作文档初始化是主线程长任务，会让纸面的 clip-path 动画停住 */
  const [opened, setOpened] = useState(false);
  const store = getDocumentReaderStore(board);

  const box = layer ? computeBox(mode, layer) : null;
  const radius = mode === "center" ? 0 : FRAME_RADIUS;
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

  /**
   * 纸面铺满图层、用圆角 clip-path 从卡片的形状展开到纸面盒子：圆角全程是真圆角，替身与正文都裁在纸面里。
   * 阴影另由 sheet 随纸面伸缩（阴影柔，横纵比例不一致看不出来）。卡面替身随纸面放大到正文原大，
   * 正文层（实底）在它上面淡入接手，看起来是卡片本身展开。reverse 为收起。
   * 替身始终不透明、只淡正文层：两层对淡时中段合成不透明度只有约 75%，会透出底下的画布。
   */
  const morph = (cardEl: HTMLElement, from: Box, to: Box, reverse: boolean) => {
    const layerEl = layerRef.current!;
    const size = { width: layerEl.clientWidth, height: layerEl.clientHeight };
    const duration = reverse ? SPRING.duration * 0.85 : SPRING.duration;
    const options: KeyframeAnimationOptions = { duration, easing: SPRING.easing, fill: "forwards" };
    const frames = <T,>(card: T, paper: T) => (reverse ? [paper, card] : [card, paper]);
    // 卡片在 SVG foreignObject 里、由 viewBox 缩放；屏幕尺寸 / 画布尺寸即画布缩放
    const zoom = from.width / element.width;

    const paper = paperRef.current!.animate(
      frames(
        { clipPath: clipOf(from, size, DOCUMENT_CARD_RADIUS * zoom) },
        { clipPath: clipOf(to, size, radius) }
      ),
      options
    );
    sheetRef.current?.animate(
      frames(
        {
          transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${
            from.width / to.width
          }, ${from.height / to.height})`,
        },
        { transform: "none" }
      ),
      options
    );
    // 收起最后一段淡出，露出底下的卡片（替身盖着卡片的手绘边框与选中框，直接卸载会让它们突然冒出来）
    if (reverse)
      for (const el of [paperRef.current, sheetRef.current])
        el?.animate([{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], {
          duration,
          fill: "forwards",
        });

    // 卡面替身：卡片 DOM 的克隆，从卡片原位放大到正文的位置与原大（卡面是版宽排版按比例缩小的）。
    // 克隆出来后不再受 viewBox 缩放，故按画布单位（元素原尺寸）排版，画布缩放并进 transform
    const paperEl = scrollRef.current?.firstElementChild;
    const ghostLayer = ghostRef.current;
    if (paperEl && ghostLayer) {
      const target = relativeBox(paperEl, layerEl);
      const scale = DOCUMENT_PAPER_WIDTH[source.kind] / element.width;
      const ghost = cardEl.cloneNode(true) as HTMLElement;
      ghost.removeAttribute("data-document-card");
      ghost
        .querySelectorAll("[data-document-badge], [data-document-accessory]")
        .forEach(el => el.remove());
      ghost.classList.remove("shadow-paper");
      Object.assign(ghost.style, {
        position: "absolute",
        left: `${from.left}px`,
        top: `${from.top}px`,
        width: `${element.width}px`,
        height: `${element.height}px`,
        transformOrigin: "0 0",
      });
      ghostLayer.replaceChildren(ghost);
      ghost.animate(
        frames(
          { transform: `scale(${zoom})` },
          {
            transform: `translate(${target.left - from.left}px, ${target.top - from.top}px) scale(${scale})`,
          }
        ),
        options
      );
    }
    // 正文层不随纸面缩放：纸面基本铺开后在替身上淡入，收起时先淡出交给替身
    frameRef.current?.animate(
      reverse
        ? [{ opacity: 1 }, { opacity: 0, offset: 0.25 }, { opacity: 0 }]
        : [
            { opacity: 0 },
            { opacity: 0, offset: 0.45 },
            { opacity: 1, offset: 0.8 },
            { opacity: 1 },
          ],
      { duration, fill: "forwards" }
    );
    if (mode === "center")
      scrimRef.current?.animate(frames({ opacity: 0 }, { opacity: 1 }), {
        duration: duration * 0.5,
        easing: "ease-out",
        fill: "forwards",
      });
    return paper.finished;
  };

  // 打开：等纸面盒子算出来后从卡片原位长出
  const ready = box !== null;
  useLayoutEffect(() => {
    if (!ready || phase.current !== "opening") return;
    const layerEl = layerRef.current!;
    const to = boxRef.current!;
    const cardEl = findCard(layerEl, element.id);
    const from = cardEl ? relativeBox(cardEl, layerEl) : null;
    const settle = () => {
      if (phase.current !== "opening") return;
      phase.current = "open";
      setOpened(true);
      for (const el of [sheetRef, paperRef, frameRef, scrimRef])
        el.current?.getAnimations().forEach(animation => animation.cancel());
      ghostRef.current?.replaceChildren();
      frameRef.current?.focus({ preventScroll: true });
    };
    // 被停靠面板挡住的卡片平移出来；纸面从卡片当前所在处长出，卡片在纸面下随画布移开
    if (from && mode === "dock" && from.left + from.width > to.left - DOCK_CLEARANCE)
      panBoard(
        board,
        Math.max(to.left - DOCK_CLEARANCE - (from.left + from.width), DOCK_CLEARANCE - from.left),
        SPRING.duration
      );
    if (!cardEl || !from || prefersReducedMotion()) {
      frameRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], 120);
      settle();
      return;
    }
    void morph(cardEl, from, to, false).then(settle, settle);
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
    void morph(cardEl, relativeBox(cardEl, layerEl), to, true).then(onClosed, onClosed);
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
    sheetRef.current?.animate(keyframes, options);
    if (layer) {
      const fromRadius = mode === "center" ? FRAME_RADIUS : 0;
      paperRef.current?.animate(
        [{ clipPath: clipOf(from, layer, fromRadius) }, { clipPath: clipOf(to, layer, radius) }],
        options
      );
    }
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
    // 碎碎念定位到日记页的那一条；其余按实体打开
    if (source.moment) {
      openPage("diary", { date: source.moment.day, moment: String(source.moment.segmentId) });
      return;
    }
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
      {box && layer && (
        <>
          {/* 只投阴影：外阴影画在盒子之外，纸面圆角处不会露出方角 */}
          <div
            ref={sheetRef}
            className={cn(
              "shadow-float absolute origin-top-left",
              mode === "dock" && "ring-line-2 ring-1"
            )}
            style={{ ...boxStyle(box), borderRadius: radius }}
          />
          <div
            ref={paperRef}
            className="bg-surface absolute inset-0"
            style={{ clipPath: clipOf(box, layer, radius) }}
          >
            <div ref={ghostRef} className="absolute inset-0" />
            <div
              ref={frameRef}
              tabIndex={-1}
              className="bg-surface pointer-events-auto absolute flex flex-col overflow-hidden outline-none"
              style={boxStyle(box)}
            >
              <div
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
                {onModeChange &&
                  (mode === "center" ? (
                    <HeaderButton label="停靠到右侧" onClick={() => onModeChange("dock")}>
                      <PanelRight className="size-4" strokeWidth={1.75} />
                    </HeaderButton>
                  ) : (
                    <HeaderButton label="居中展开" onClick={() => onModeChange("center")}>
                      <AppWindow className="size-4" strokeWidth={1.75} />
                    </HeaderButton>
                  ))}
                <HeaderButton
                  label={`在${source.moment ? "日记" : DOCUMENT_KIND_LABEL[source.kind]}页打开`}
                  onClick={openInPage}
                >
                  <ExternalLink className="size-4" strokeWidth={1.75} />
                </HeaderButton>
                {mode === "dock" && closeButton}
              </div>
              <FadeScroll scrollRef={scrollRef} className="min-h-0 flex-1 overscroll-contain">
                <DocumentPaper source={source} fill>
                  {opened ? (
                    <DocumentEditor
                      key={source.contentId}
                      source={source}
                      readonly={board.readonly}
                    />
                  ) : (
                    <BodyPreview source={source} />
                  )}
                </DocumentPaper>
              </FadeScroll>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** 文档扩展界面层：监听展开请求，停靠时跟随选中换篇 */
export function DocumentReaderLayer() {
  const board = useBoard();
  const store = getDocumentReaderStore(board);
  const openId = useDocumentReaderState(board, state => state.openId);
  const { mode: preferred, setMode } = useDocumentReaderPreference();
  const { allowDock } = useDocumentHost();
  const mode = allowDock ? preferred : "center";
  const selection = useSelection();
  const element = openId
    ? (BoardUtil.getElementById(board, openId) as DocumentElement | null)
    : null;
  const { source, missing } = useDocumentSource(element);

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
      onModeChange={allowDock ? setMode : undefined}
      onClosed={closed}
    />
  );
}
