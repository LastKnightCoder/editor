import type {
  WhiteboardModelCommand,
  WhiteboardSnapshot as DocumentSnapshot,
} from "@tau/collaboration";
import { DocumentBoardCanvas } from "./DocumentBoardCanvas";
/**
 * 单页画布：托管文档统一落盘；旧快照仅保留只读预览，转换由后台统一完成。
 * 单页页面（whiteboard-content）与多页白板详情（whiteboard-detail）共用；多页里按页 id 作 key 重挂。
 *
 * ref 暴露 flush()：把未落库的改动立即保存并等它完成（复制这一页前调用，保证副本拿到最新内容）。
 * 画布显示时取走发给这一页的定位请求（沿跳转链回到这一级时定位来源卡片，见 navigation.ts）。
 */

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { Loading } from "@tau/ui";
import WhiteBoard from "@/features/shared/whiteboard/DesktopWhiteboard";
import { getDocumentVersion, type WhiteBoardRef, type WhiteboardExtension } from "@tau/whiteboard";
import type { WhiteBoardContent } from "@/types";
import { useWhiteBoardContent } from "../queries";
import { subscribeReveal, takeReveal } from "../navigation";

export interface BoardCanvasHandle {
  flush(): Promise<void>;
  readonly document?: {
    snapshot(): DocumentSnapshot;
    duplicatePage(pageId: string): Promise<string>;
    pageTitle(pageId: string): import("@tau/editor/text-field-contract").EditorTextField;
    submit(
      commands: readonly WhiteboardModelCommand[]
    ): Promise<{ readonly createdIds: readonly string[] }>;
  };
}

export function BoardCanvas({
  id,
  onLoaded,
  onPresentationModeChange,
  onDockWidthChange,
  extensions,
  collaboration,
  ref,
}: {
  id: number;
  /** 页内容就绪（名称用于面包屑） */
  onLoaded?(content: WhiteBoardContent): void;
  onPresentationModeChange?(presenting: boolean): void;
  onDockWidthChange?(width: number): void;
  /** 宿主覆盖的白板插槽（如创作模式的画布层） */
  extensions?: readonly WhiteboardExtension[];
  /** 白板页面提供共享入口；嵌入其它页面的画布不提供。 */
  collaboration?: boolean;
  ref?: Ref<BoardCanvasHandle>;
}) {
  const { data: content, isPending, isError } = useWhiteBoardContent(id);
  const boardRef = useRef<WhiteBoardRef>(null);
  const ready = Boolean(content);
  const documentRef = useRef<BoardCanvasHandle>(null);
  const documentData = content?.data as
    | (WhiteBoardContent["data"] & { documentKind?: string; documentId?: string; pageId?: string })
    | undefined;
  const managed =
    documentData?.documentKind === "whiteboard" &&
    typeof documentData.documentId === "string" &&
    typeof documentData.pageId === "string";

  useEffect(() => {
    if (!ready) return;
    let frame = 0;
    const reveal = () => {
      const elementId = takeReveal(id);
      if (!elementId) return;
      // 等画布容器量好尺寸再居中（新挂载 / 刚从隐藏态恢复）
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => boardRef.current?.revealElement(elementId));
      });
    };
    reveal();
    const unsubscribe = subscribeReveal(reveal);
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
    };
  }, [ready, id]);

  useEffect(() => {
    if (content) onLoaded?.(content);
    // 只在内容（含改名）变化时通知
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  useImperativeHandle(
    ref,
    () => ({
      get document() {
        return documentRef.current?.document;
      },
      async flush() {
        if (managed) {
          if (!documentRef.current) throw new Error("白板文档尚未就绪");
          await documentRef.current.flush();
          return;
        }
        throw new Error("白板正在后台升级，当前仅提供只读预览");
      },
    }),
    [managed]
  );

  if (isPending) return <Loading />;
  if (isError || !content) return <div className="text-ink-2 p-6">白板不存在或读取失败</div>;
  if (managed)
    return (
      <DocumentBoardCanvas
        ref={documentRef}
        contentId={id}
        documentId={documentData!.documentId!}
        pageId={documentData!.pageId!}
        extensions={extensions}
        collaboration={collaboration}
        onPresentationModeChange={onPresentationModeChange}
        onDockWidthChange={onDockWidthChange}
      />
    );
  return (
    <div className="flex h-full w-full flex-col">
      <WhiteBoard
        ref={boardRef}
        key={content.id}
        className="min-h-0 w-full flex-1"
        initData={content.data.children}
        initSelection={content.data.selection}
        initViewPort={content.data.viewPort}
        initPresentationSequences={content.data.presentationSequences}
        initSketch={content.data.sketch}
        version={getDocumentVersion(content.data)}
        readonly
        showSidebar
        onPresentationModeChange={onPresentationModeChange}
        onDockWidthChange={onDockWidthChange}
        extensions={extensions}
      />
    </div>
  );
}
