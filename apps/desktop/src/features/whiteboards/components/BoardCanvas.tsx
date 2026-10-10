/**
 * 单页画布：读取一页（WhiteBoardContent）、实时保存（改动停 400ms 落库）。
 * 单页页面（whiteboard-content）与多页白板详情（whiteboard-detail）共用；多页里按页 id 作 key 重挂。
 *
 * ref 暴露 flush()：把未落库的改动立即保存并等它完成（复制这一页前调用，保证副本拿到最新内容）。
 * 画布显示时取走发给这一页的定位请求（沿跳转链回到这一级时定位来源卡片，见 navigation.ts）。
 */

import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from "react";
import { useMemoizedFn } from "ahooks";
import { debounce } from "lodash";
import { Loading } from "@tau/ui";
import WhiteBoard from "@/features/shared/whiteboard/DesktopWhiteboard";
import { type WhiteBoardRef, type WhiteboardExtension } from "@tau/whiteboard";
import type { WhiteBoardContent } from "@/types";
import { useWhiteBoardContent } from "../queries";
import { subscribeReveal, takeReveal } from "../navigation";

export interface BoardCanvasHandle {
  flush(): Promise<void>;
}

export function BoardCanvas({
  id,
  onLoaded,
  onPresentationModeChange,
  onDockWidthChange,
  extensions,
  ref,
}: {
  id: number;
  /** 页内容就绪（名称用于面包屑） */
  onLoaded?(content: WhiteBoardContent): void;
  onPresentationModeChange?(presenting: boolean): void;
  onDockWidthChange?(width: number): void;
  /** 宿主覆盖的白板插槽（如创作模式的画布层） */
  extensions?: readonly WhiteboardExtension[];
  ref?: Ref<BoardCanvasHandle>;
}) {
  const { data: content, isPending, isError, save } = useWhiteBoardContent(id);
  /** 最近一次保存（flush 等它完成） */
  const savingRef = useRef<Promise<unknown>>(Promise.resolve());
  const boardRef = useRef<WhiteBoardRef>(null);
  const ready = Boolean(content);

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

  const persist = useMemoizedFn((data: WhiteBoardContent["data"]) => {
    if (!content) return;
    savingRef.current = save.mutateAsync({ ...content, data });
    // 后台保存由 mutation 提示错误，显式 flush 仍须收到原始拒绝。
    void savingRef.current.catch(() => undefined);
  });
  const onChange = useMemo(() => debounce(persist, 400), [persist]);
  useEffect(
    () => () => {
      onChange.flush();
    },
    [onChange]
  );

  useImperativeHandle(
    ref,
    () => ({
      async flush() {
        onChange.flush();
        await savingRef.current;
      },
    }),
    [onChange]
  );

  if (isPending) return <Loading />;
  if (isError || !content) return <div className="text-ink-2 p-6">白板不存在或读取失败</div>;
  return (
    <div className="h-full w-full">
      <WhiteBoard
        ref={boardRef}
        key={content.id}
        className="h-full w-full"
        initData={content.data.children}
        initSelection={content.data.selection}
        initViewPort={content.data.viewPort}
        initPresentationSequences={content.data.presentationSequences}
        initSketch={content.data.sketch}
        onChange={onChange}
        showSidebar
        onPresentationModeChange={onPresentationModeChange}
        onDockWidthChange={onDockWidthChange}
        extensions={extensions}
      />
    </div>
  );
}
