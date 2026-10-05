/**
 * 白板块（D-057）：模型输出的白板 DSL（dsl.ts）→ 只读白板画布。
 * 对话里直接画出来（display: inline，边写边画），右上角「放大」进统一预览框；
 * 预览里缩放浮控 + 更多菜单（复制到白板、导出 PNG）。生成中语法暂时不完整时保留上次成功结果。
 */

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, FileImage, Presentation } from "lucide-react";
import { useDebounce } from "ahooks";
import { Spinner, toast } from "@tau/ui";
import useTheme from "@/hooks/useTheme";
import { captureBlobWithSnapdom } from "@/utils/snapdom-export";
import { copyElementsToClipboard } from "@/utils/clipboardHelpers";
import type { BoardElement, WhiteBoardRef } from "@/components/WhiteBoard";
import {
  defineBlockRenderer,
  type BlockInlineProps,
  type BlockPreviewProps,
} from "@/types/block-preview";
import { InlineBlockShell } from "@/features/previews/components/InlineBlockShell";
import { usePreviewActions } from "@/features/previews/components/previewActions";
import { downloadBlob } from "@/features/previews/exportImage";
import { sanitizeFileName } from "@/utils/file-name";
import { convertWhiteboardToBoard, parseWhiteboardDsl, type WhiteboardDocument } from "./dsl";

const WhiteBoard = lazy(() => import("@/components/WhiteBoard"));

const INLINE_HEIGHT = 280;

interface Compiled {
  document: WhiteboardDocument | null;
  elements: BoardElement[];
  error: Error | null;
}

function compile(code: string): Compiled {
  if (!code.trim()) return { document: null, elements: [], error: null };
  try {
    const document = parseWhiteboardDsl(code);
    return { document, elements: convertWhiteboardToBoard(document), error: null };
  } catch (error) {
    return {
      document: null,
      elements: [],
      error: error instanceof Error ? error : new Error("白板解析失败"),
    };
  }
}

/** 防抖编译；生成中出错时退回上一次成功的结果 */
function useCompiledBoard(code: string, generating: boolean): Compiled {
  const debounced = useDebounce(code, { wait: 300 });
  const compiled = useMemo(() => compile(debounced), [debounced]);
  const lastGood = useRef<Compiled | null>(null);
  if (!compiled.error) lastGood.current = compiled;
  if (compiled.error && generating) return lastGood.current ?? { ...compiled, error: null };
  return compiled;
}

function BoardView({
  compiled,
  boardRef,
  padding,
  className,
  style,
}: {
  compiled: Compiled;
  boardRef: React.RefObject<WhiteBoardRef | null>;
  padding: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { isDark } = useTheme();
  const boxRef = useRef<HTMLDivElement>(null);
  // 画布组件懒加载：挂上后才能适应视口（首帧 ref 为空），挂载时间点记进 state 触发下方 effect
  const [mounted, setMounted] = useState(false);
  const attachBoard = useCallback(
    (board: WhiteBoardRef | null) => {
      boardRef.current = board;
      setMounted(Boolean(board));
    },
    [boardRef]
  );
  const { elements } = compiled;

  // 内容、容器尺寸变化或画布就绪 → 重新适应
  useEffect(() => {
    const box = boxRef.current;
    if (!box || !elements.length || !mounted) return;
    let raf = 0;
    const fit = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => boardRef.current?.fitAllElements(padding, false));
    };
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    const timer = window.setTimeout(fit, 80);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [boardRef, elements, padding, mounted]);

  if (compiled.error) throw compiled.error;
  const background = isDark ? "#0f172a" : "#ffffff";
  return (
    <div ref={boxRef} className={className} style={{ ...style, background }}>
      {elements.length ? (
        <Suspense fallback={<BoardLoading />}>
          <WhiteBoard
            ref={attachBoard}
            initData={elements as BoardElement[] & { presentationSequences?: never[] }}
            readonly
            showSidebar={false}
            showToolbar={false}
            showAttributeSetter={false}
            showStatusBar={false}
            className="h-full"
            style={{ background }}
          />
        </Suspense>
      ) : (
        <BoardLoading label="等待白板内容…" />
      )}
    </div>
  );
}

function BoardLoading({ label }: { label?: string }) {
  return (
    <div className="text-tau-sm text-ink-3 flex h-full items-center justify-center gap-2">
      <Spinner className="size-3.5 border-[1.5px]" />
      {label}
    </div>
  );
}

function WhiteboardInline({ block, generating, onExpand }: BlockInlineProps) {
  const boardRef = useRef<WhiteBoardRef>(null);
  const compiled = useCompiledBoard(block.content, generating);
  return (
    <InlineBlockShell source={block.content} onExpand={onExpand}>
      <BoardView
        compiled={compiled}
        boardRef={boardRef}
        padding={32}
        className="w-full"
        style={{ height: INLINE_HEIGHT }}
      />
    </InlineBlockShell>
  );
}

function WhiteboardPreview({ block, generating }: BlockPreviewProps) {
  const boardRef = useRef<WhiteBoardRef>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const compiled = useCompiledBoard(block.content, generating);
  const [busy, setBusy] = useState(false);
  const title = compiled.document?.title || block.metadata.title || "白板";

  usePreviewActions({
    zoom: {
      zoomIn: () => boardRef.current?.zoomIn(),
      zoomOut: () => boardRef.current?.zoomOut(),
      fit: () => boardRef.current?.fitAllElements(64, true),
    },
    more: [
      {
        key: "to-whiteboard",
        label: "复制到白板",
        icon: Copy,
        disabled: !compiled.elements.length,
        onSelect: () => copyElementsToClipboard(compiled.elements),
      },
      {
        key: "png",
        label: "导出 PNG",
        icon: FileImage,
        disabled: busy || !compiled.elements.length,
        onSelect: async () => {
          const target = boxRef.current;
          if (!target) return;
          setBusy(true);
          try {
            boardRef.current?.fitAllElements(64, false);
            await new Promise<void>(r =>
              requestAnimationFrame(() => requestAnimationFrame(() => r()))
            );
            const blob = await captureBlobWithSnapdom(target, {
              dpr: window.devicePixelRatio || 2,
              type: "png",
              quality: 0.95,
            });
            downloadBlob(blob, `${sanitizeFileName(title, "白板")}.png`);
            toast.success("图片已导出");
          } finally {
            setBusy(false);
          }
        },
      },
    ],
  });

  return (
    <div ref={boxRef} className="size-full">
      <BoardView compiled={compiled} boardRef={boardRef} padding={64} className="size-full" />
    </div>
  );
}

export default defineBlockRenderer({
  type: "whiteboard",
  label: "白板",
  icon: Presentation,
  display: "inline",
  streaming: "live",
  surface: "white",
  title: content => {
    try {
      return parseWhiteboardDsl(content).title || undefined;
    } catch {
      return undefined;
    }
  },
  Preview: WhiteboardPreview,
  Inline: WhiteboardInline,
});
