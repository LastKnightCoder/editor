/**
 * 速览：按住文档卡 250ms，或选中后按住空格，卡面从原位放大到能读（版宽原大，放不下时按画布可用区缩小），
 * 松开落回原位。只读，不挂编辑会话；居中阅读时不响应。
 * 动画只动 transform：放大 220ms 缓出，落回略快；减少动态效果时改为 120ms 淡入淡出。
 * 根节点带 CANVAS_OVERLAY_ATTR，且不接收指针：速览期间画布照常收到松手。
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { ErrorBoundary } from "@tau/ui";
import {
  CANVAS_OVERLAY_ATTR,
  DOCUMENT_CARD_RADIUS,
  DOCUMENT_PEEK_EVENT,
  useBoard,
  type DocumentElement,
} from "@tau/whiteboard";
import ContentEditor from "@/components/ContentEditor";
import { DocumentPaper } from "./DocumentPaper";
import { PdfFace } from "./PdfFace";
import { DOCUMENT_PAPER_WIDTH } from "./layout";
import { useDocumentSource } from "./source";
import { prefersReducedMotion, relativeBox, type Box } from "./morph";
import { getDocumentReaderStore, useDocumentReaderPreference } from "./readerStore";
import { useDocumentHost } from "./DocumentHostContext";

const MARGIN = 24;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const OPEN_MS = 220;
const CLOSE_MS = 180;
const REDUCED_MS = 120;

/** 速览盒子：版宽原大、保持卡片比例，放不下时整体缩小；以卡片中心为中心，贴边时往里收 */
export function peekBox(
  card: Box,
  paperWidth: number,
  layer: { width: number; height: number }
): Box {
  const ratio = card.height / card.width;
  const width = Math.max(
    card.width,
    Math.min(paperWidth, layer.width - MARGIN * 2, (layer.height - MARGIN * 2) / ratio)
  );
  const height = width * ratio;
  const clamp = (center: number, size: number, total: number) =>
    Math.min(Math.max(center - size / 2, MARGIN), Math.max(MARGIN, total - size - MARGIN));
  return {
    left: clamp(card.left + card.width / 2, width, layer.width),
    top: clamp(card.top + card.height / 2, height, layer.height),
    width,
    height,
  };
}

const findCard = (layer: HTMLElement, id: string) =>
  Array.from(layer.parentElement?.querySelectorAll<HTMLElement>("[data-document-card]") ?? []).find(
    el => el.dataset.documentCard === id
  ) ?? null;

const transformFrom = (from: Box, to: Box) =>
  `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${
    from.height / to.height
  })`;

function Peek({
  element,
  closing,
  onClosed,
  onAbort,
}: {
  element: DocumentElement;
  closing: boolean;
  onClosed(): void;
  /** 卡片不在画面里或正文已删除：直接撤掉 */
  onAbort(): void;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<{ from: Box; to: Box } | null>(null);
  const { source, missing } = useDocumentSource(element);
  const paperWidth = DOCUMENT_PAPER_WIDTH[source?.kind ?? element.entityRef?.kind ?? "article"];

  useLayoutEffect(() => {
    const layer = layerRef.current;
    const card = layer && findCard(layer, element.id);
    if (!layer || !card) return onAbort();
    const from = relativeBox(card, layer);
    setBoxes({
      from,
      to: peekBox(from, paperWidth, { width: layer.clientWidth, height: layer.clientHeight }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 打开时量一次；版宽随正文加载变化不重排
  }, [element.id]);

  useLayoutEffect(() => {
    const paper = paperRef.current;
    if (!paper || !boxes) return;
    const reduced = prefersReducedMotion();
    if (!closing) {
      paper.animate(
        reduced
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [{ transform: transformFrom(boxes.from, boxes.to) }, { transform: "none" }],
        { duration: reduced ? REDUCED_MS : OPEN_MS, easing: EASE_OUT }
      );
      return;
    }
    const animation = paper.animate(
      reduced
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [
            { transform: "none", opacity: 1 },
            { transform: transformFrom(boxes.from, boxes.to), opacity: 1, offset: 0.85 },
            { transform: transformFrom(boxes.from, boxes.to), opacity: 0 },
          ],
      { duration: reduced ? REDUCED_MS : CLOSE_MS, easing: EASE_OUT, fill: "forwards" }
    );
    void animation.finished.then(onClosed, onClosed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxes, closing]);

  useEffect(() => {
    if (missing) onAbort();
  }, [missing, onAbort]);

  return (
    <div
      ref={layerRef}
      {...{ [CANVAS_OVERLAY_ATTR]: "" }}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[7] overflow-hidden"
    >
      {boxes && (
        <div
          ref={paperRef}
          className="bg-surface shadow-float absolute origin-top-left overflow-hidden"
          style={{
            left: boxes.to.left,
            top: boxes.to.top,
            width: boxes.to.width,
            height: boxes.to.height,
            borderRadius: DOCUMENT_CARD_RADIUS * (boxes.to.width / element.width),
          }}
        >
          {source?.pdf ? (
            <PdfFace
              element={{ ...element, width: boxes.to.width, height: boxes.to.height }}
              pdf={source.pdf}
              zoom={1}
              lowZoom={false}
            />
          ) : (
            source && (
              <div
                className="absolute top-0 left-0 origin-top-left"
                style={{ transform: `scale(${boxes.to.width / paperWidth})` }}
              >
                <DocumentPaper source={source}>
                  <ErrorBoundary>
                    <ContentEditor
                      contentId={source.contentId}
                      readonly
                      className="overflow-hidden py-0.5"
                    />
                  </ErrorBoundary>
                </DocumentPaper>
              </div>
            )
          )}
          {!source?.pdf && (
            <div className="to-surface absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent" />
          )}
          <span className="bg-surface border-line-1 text-ink-3 absolute bottom-2.5 left-1/2 -translate-x-1/2 rounded-full border px-2.5 text-[11px] leading-5">
            松开收回 · 双击展开
          </span>
        </div>
      )}
    </div>
  );
}

/** 画布层：同一时间只速览一张；空格速览在松开空格时收回，长按速览由内核在松手时发结束 */
export function PeekLayer() {
  const board = useBoard();
  const host = useDocumentHost();
  const preferred = useDocumentReaderPreference(state => state.mode);
  const centered = !host.allowDock || preferred === "center";
  const [peek, setPeek] = useState<{ element: DocumentElement; closing: boolean } | null>(null);
  const peekRef = useRef(peek);
  peekRef.current = peek;

  const end = useMemoizedFn(() =>
    setPeek(current => (current && !current.closing ? { ...current, closing: true } : current))
  );

  useEffect(() => {
    const onPeek = (id: string | null) => {
      if (id === null) return end();
      if (peekRef.current?.element.id === id && !peekRef.current.closing) return;
      // 居中阅读时纸面盖着画布，不速览
      if (centered && getDocumentReaderStore(board).getState().openId) return;
      const element = board.getElement(id);
      if (element?.type !== "document") return;
      setPeek({ element: element as DocumentElement, closing: false });
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === " ") end();
    };
    board.on(DOCUMENT_PEEK_EVENT, onPeek);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", end);
    return () => {
      board.off(DOCUMENT_PEEK_EVENT, onPeek);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", end);
    };
  }, [board, centered, end]);

  // 速览中双击（或 ↵）展开：阅读纸接手，速览直接让开
  useEffect(() => {
    const store = getDocumentReaderStore(board);
    return store.subscribe(state => {
      if (state.openId) setPeek(null);
    });
  }, [board]);

  const closed = useMemoizedFn(() => setPeek(current => (current?.closing ? null : current)));

  if (!peek) return null;
  return (
    <Peek
      key={peek.element.id}
      element={peek.element}
      closing={peek.closing}
      onClosed={closed}
      onAbort={() => setPeek(null)}
    />
  );
}
