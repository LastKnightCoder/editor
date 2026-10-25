import { useEffect, useLayoutEffect, useRef, useState, type PropsWithChildren } from "react";
import { createPortal } from "react-dom";
import { useDebounceFn, useMemoizedFn } from "ahooks";
import { Transforms } from "slate";
import { useReadOnly, useSlateStatic } from "slate-react";
import { cn } from "@tau/ui";
import {
  AddParagraph,
  ELEMENT_SELECTED_OUTLINE_CLASS,
  OverlayBackDismiss,
  canEditElement,
  captureElementSubmission,
  useIsLastElement,
  useNotifier,
  useTouchVoidSelection,
} from "@tau/editor/api";
import { useSourceFocusRequests } from "./focusRequests";
import { previewActionsMap } from "./menu";
import { EmptySourcePlaceholder, ErrorBar } from "./parts";
import { PreviewErrorContext, type PreviewError } from "./previewError";
import type { IPreviewWithEditorProps } from "./PreviewWithEditor";
import { SourceEditorPage } from "./SourceEditorPage";

/** 非绑定模式的写回防抖：停顿后写入节点，返回时立即写入；页面隐藏时编辑器提交域已结束，未写入的停顿内输入随之丢弃 */
const WRITE_DELAY = 300;

/**
 * 触屏源码块：正文只显示预览，编辑态点按把选区放进块（宿主配件栏据此接管操作），编辑在源码页里进行。
 * 源码页打开期间，预览 DOM 整体移进页面的预览区（同一个 React 子树，不重复编译），块原位保留高度占位。
 * 字段绑定即时同步；非绑定模式防抖写回，返回即完成。
 */
export function TouchPreviewWithEditor({
  element,
  initValue,
  onChange,
  mode,
  title,
  icon,
  center,
  extend,
  children,
  textBinding,
}: PropsWithChildren<IPreviewWithEditorProps>) {
  const editor = useSlateStatic();
  const notifier = useNotifier();
  const editorReadOnly = useReadOnly();
  const readOnly =
    editorReadOnly || (!onChange && !textBinding) || !canEditElement(editor, element);
  const isLast = useIsLastElement(element);
  const { selected, select } = useTouchVoidSelection(element);
  const isEmpty = !initValue.trim();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<PreviewError | null>(null);
  // 居中的块按内容宽度居中、过宽时从左缘开始滚动；其余按正文宽度排版
  const [previewHost] = useState(() => {
    const host = document.createElement("div");
    host.className = center ? "mx-auto w-fit" : "w-full";
    return host;
  });
  const frameRef = useRef<HTMLDivElement>(null);
  const [blockSlot, setBlockSlot] = useState<HTMLDivElement | null>(null);
  const [pageSlot, setPageSlot] = useState<HTMLDivElement | null>(null);
  const [placeholderHeight, setPlaceholderHeight] = useState<number>();
  const [canScrollRight, setCanScrollRight] = useState(false);

  const latest = useRef({ element, onChange });
  latest.current = { element, onChange };
  /** 非绑定模式最后写入的源码，用来区分自己的回写与外部改写 */
  const written = useRef(initValue);
  const [externalRevision, setExternalRevision] = useState(0);

  const write = useMemoizedFn((value: string) => {
    const { element: current, onChange: commit } = latest.current;
    if (!commit) return;
    written.current = value;
    const submission = captureElementSubmission(editor, { element: current });
    try {
      submission.commit(() => {
        commit(value);
        return undefined;
      });
    } finally {
      submission.dispose();
    }
  });
  const { run: scheduleWrite, flush, cancel } = useDebounceFn(write, { wait: WRITE_DELAY });

  const close = useMemoizedFn(() => {
    flush();
    setOpen(false);
  });
  /** 用户返回：关闭后选中本块，配件栏回到该块的上下文 */
  const finish = useMemoizedFn(() => {
    close();
    select();
  });
  useEffect(() => close, [close]);
  useEffect(() => {
    if (readOnly) close();
  }, [readOnly, close]);

  useEffect(() => {
    if (textBinding || initValue === written.current) return;
    // 外部改写（撤销、协作等）：丢弃尚未写入的输入，页面以节点源码为准
    cancel();
    written.current = initValue;
    setExternalRevision(revision => revision + 1);
  }, [initValue, textBinding, cancel]);

  useLayoutEffect(() => {
    const target = open ? pageSlot : blockSlot;
    if (target && previewHost.parentNode !== target) target.appendChild(previewHost);
  }, [open, pageSlot, blockSlot, previewHost]);

  useEffect(() => {
    if (!blockSlot) return;
    const update = () =>
      setCanScrollRight(blockSlot.scrollLeft + blockSlot.clientWidth < blockSlot.scrollWidth - 1);
    update();
    blockSlot.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(blockSlot);
    observer?.observe(previewHost);
    return () => {
      blockSlot.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [blockSlot, previewHost]);

  const openPage = useMemoizedFn(() => {
    if (readOnly) return false;
    setPlaceholderHeight(frameRef.current?.offsetHeight);
    written.current = initValue;
    // 源码页打开期间正文不保留选区，配件栏不在页面底下维持本块的上下文
    Transforms.deselect(editor);
    setOpen(true);
    return true;
  });

  const copySource = useMemoizedFn(() => {
    void navigator.clipboard?.writeText(initValue).then(
      () => notifier.success("源码已复制"),
      () => notifier.error("复制失败")
    );
  });

  useSourceFocusRequests(element, () => openPage());

  useEffect(() => {
    previewActionsMap.set(element, { title, icon, edit: openPage, copySource, readOnly });
    return () => {
      previewActionsMap.delete(element);
    };
  }, [element, title, icon, openPage, copySource, readOnly]);

  return (
    <div contentEditable={false} data-source-presentation="touch">
      <div
        ref={frameRef}
        className={cn("rounded-[0.625em]", selected && ELEMENT_SELECTED_OUTLINE_CLASS)}
        style={open ? { height: placeholderHeight } : undefined}
        onClickCapture={() => {
          if (!editorReadOnly) select();
        }}
      >
        {isEmpty && !open && (
          <EmptySourcePlaceholder
            title={title}
            readOnly={readOnly}
            hint="点按"
            onClick={openPage}
          />
        )}
        <div
          ref={setBlockSlot}
          data-source-preview-slot=""
          className={cn(
            "box-border flex min-h-[3em] flex-col justify-center overflow-x-auto whitespace-normal transition-opacity duration-150",
            (isEmpty || open) && "hidden",
            extend && "py-[0.3125em]",
            error?.stale && "opacity-40",
            canScrollRight &&
              "[mask-image:linear-gradient(to_right,#000_calc(100%-1.5em),transparent)]"
          )}
        />
      </div>
      {createPortal(
        <PreviewErrorContext.Provider value={setError}>{children}</PreviewErrorContext.Provider>,
        previewHost
      )}
      {error && !open && (
        <div className="mt-[0.25em] overflow-hidden rounded-[0.5em]" role="alert">
          <ErrorBar message={error.message} stale={error.stale && !isEmpty} />
        </div>
      )}
      {!(readOnly && isLast) && <AddParagraph element={element} />}
      <OverlayBackDismiss open={open} onDismiss={finish} />
      {open && (
        <SourceEditorPage
          title={title}
          icon={icon}
          mode={mode}
          textBinding={textBinding}
          value={initValue}
          externalRevision={externalRevision}
          onChange={textBinding ? undefined : scheduleWrite}
          readOnly={readOnly}
          error={error}
          previewSlotRef={setPageSlot}
          onClose={finish}
        />
      )}
    </div>
  );
}
