/**
 * 单页画布：读取一页（WhiteBoardContent）、实时保存（改动停 400ms 落库）、后台生成列表缩略图。
 * 单页页面（whiteboard-content）与多页白板详情（whiteboard-detail）共用；多页里按页 id 作 key 重挂。
 *
 * ref 暴露 flush()：把未落库的改动立即保存并等它完成（复制这一页前调用，保证副本拿到最新内容）。
 */

import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from "react";
import { useMemoizedFn } from "ahooks";
import { debounce } from "lodash";
import { Loading } from "@tau/ui";
import WhiteBoard, { type WhiteBoardRef } from "@/components/WhiteBoard";
import type { WhiteBoardContent } from "@/types";
import { useWhiteBoardContent } from "../queries";
import { getThumbnailTime, saveThumbnail } from "../thumbnails";

/** 缩略图：编辑停下这么久后截一张（与列表卡片同比例、按目标宽度缩放） */
const THUMBNAIL_IDLE_MS = 4000;
/** 打开时缩略图缺失或过期：等画布渲染稳定后补一张 */
const THUMBNAIL_BOOT_MS = 1500;
const THUMBNAIL_WIDTH = 640;
const THUMBNAIL_ASPECT = 16 / 10;

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
  const boardRef = useRef<WhiteBoardRef>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  /** 有未截进缩略图的改动（离开页面时截不了，回来再补） */
  const dirtyRef = useRef(false);
  /** 最近一次保存（flush 等它完成） */
  const savingRef = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    if (content) onLoaded?.(content);
    // 只在内容（含改名）变化时通知
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  // 列表缩略图：复用导出图片的截图管线，后台截图不打扰编辑（不动选区与视口）
  const captureThumbnail = useMemoizedFn(async () => {
    const board = boardRef.current;
    // 页面被保活隐藏（display:none）或窗口在后台时截出来是空白，留到回来再截
    const visible = (wrapperRef.current?.getClientRects().length ?? 0) > 0;
    if (!board || !visible || document.hidden) return;
    const background = getComputedStyle(document.documentElement)
      .getPropertyValue("--tau-bg-surface")
      .trim();
    try {
      const blob = await board.captureThumbnail({
        width: THUMBNAIL_WIDTH,
        aspect: THUMBNAIL_ASPECT,
        backgroundColor: background || null,
      });
      if (blob) await saveThumbnail(id, blob);
      dirtyRef.current = false;
    } catch (error) {
      console.warn("[whiteboard] 缩略图生成失败", error);
    }
  });
  const scheduleThumbnail = useMemo(
    () => debounce(() => void captureThumbnail(), THUMBNAIL_IDLE_MS),
    [captureThumbnail]
  );
  // 保活页重新激活时 effect 会重跑：补上离开前没截成的那张；隐藏时取消待截
  useEffect(() => {
    if (dirtyRef.current) scheduleThumbnail();
    return () => scheduleThumbnail.cancel();
  }, [scheduleThumbnail]);

  // 打开时：缩略图缺失，或画布在截图之后又被改过（其它设备 / 旧版本），补一张
  const contentLoaded = Boolean(content);
  useEffect(() => {
    if (!contentLoaded || !content?.data.children.length) return;
    let cancelled = false;
    let timer = 0;
    void getThumbnailTime(id).then(capturedAt => {
      if (cancelled || (capturedAt !== null && capturedAt >= content.updateTime)) return;
      timer = window.setTimeout(() => void captureThumbnail(), THUMBNAIL_BOOT_MS);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // 只在首次拿到内容时检查一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentLoaded, id]);

  const persist = useMemoizedFn((data: WhiteBoardContent["data"]) => {
    if (!content) return;
    savingRef.current = save.mutateAsync({ ...content, data }).catch(() => undefined);
    dirtyRef.current = true;
    scheduleThumbnail();
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
    <div ref={wrapperRef} className="h-full w-full">
      <WhiteBoard
        ref={boardRef}
        key={content.id}
        className="h-full w-full"
        initData={content.data.children}
        initSelection={content.data.selection}
        initViewPort={content.data.viewPort}
        initPresentationSequences={content.data.presentationSequences}
        onChange={onChange}
      />
    </div>
  );
}
