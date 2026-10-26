import type {
  WhiteboardModelCommand,
  WhiteboardSnapshot as DocumentSnapshot,
} from "@tau/collaboration";
import { DocumentBoardCanvas } from "./DocumentBoardCanvas";
/**
 * 单页画布：托管文档统一落盘；不支持的旧快照拒绝打开。
 * 单页页面（whiteboard-content）与多页白板详情（whiteboard-detail）共用；多页里按页 id 作 key 重挂。
 *
 * ref 暴露 flush()：把未落库的改动立即保存并等它完成（复制这一页前调用，保证副本拿到最新内容）。
 * 画布显示时取走发给这一页的定位请求（沿跳转链回到这一级时定位来源卡片，见 navigation.ts）。
 */

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { Loading } from "@tau/ui";
import type { WhiteboardExtension } from "@tau/whiteboard";
import type { WhiteBoardContent } from "@/types";
import { useWhiteBoardContent } from "../queries";

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
  const documentRef = useRef<BoardCanvasHandle>(null);
  const documentData = content?.data as
    | (WhiteBoardContent["data"] & { documentKind?: string; documentId?: string; pageId?: string })
    | undefined;
  const managed =
    documentData?.documentKind === "whiteboard" &&
    typeof documentData.documentId === "string" &&
    typeof documentData.pageId === "string";

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
        throw new Error("WHITEBOARD_FORMAT_UNSUPPORTED: 白板格式不受支持");
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
    <div role="alert" className="text-ink-2 p-6">
      白板格式不受支持
    </div>
  );
}
