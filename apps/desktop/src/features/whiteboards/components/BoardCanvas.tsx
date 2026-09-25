/**
 * 单页画布：读取一页（WhiteBoardContent）、实时保存（改动停 400ms 落库）。
 * 单页页面（whiteboard-content）与多页白板详情（whiteboard-detail）共用；多页里按页 id 作 key 重挂。
 *
 * ref 暴露 flush()：把未落库的改动立即保存并等它完成（复制这一页前调用，保证副本拿到最新内容）。
 */

import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from "react";
import { useMemoizedFn } from "ahooks";
import { debounce } from "lodash";
import { Loading } from "@tau/ui";
import WhiteBoard from "@/components/WhiteBoard";
import type { WhiteBoardContent } from "@/types";
import { useWhiteBoardContent } from "../queries";

export interface BoardCanvasHandle {
  flush(): Promise<void>;
}

export function BoardCanvas({
  id,
  onLoaded,
  ref,
}: {
  id: number;
  /** 页内容就绪（名称用于面包屑） */
  onLoaded?(content: WhiteBoardContent): void;
  ref?: Ref<BoardCanvasHandle>;
}) {
  const { data: content, isPending, isError, save } = useWhiteBoardContent(id);
  /** 最近一次保存（flush 等它完成） */
  const savingRef = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    if (content) onLoaded?.(content);
    // 只在内容（含改名）变化时通知
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  const persist = useMemoizedFn((data: WhiteBoardContent["data"]) => {
    if (!content) return;
    savingRef.current = save.mutateAsync({ ...content, data }).catch(() => undefined);
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
        key={content.id}
        className="h-full w-full"
        initData={content.data.children}
        initSelection={content.data.selection}
        initViewPort={content.data.viewPort}
        initPresentationSequences={content.data.presentationSequences}
        onChange={onChange}
        showSidebar
      />
    </div>
  );
}
