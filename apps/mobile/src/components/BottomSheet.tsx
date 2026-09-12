import { useCallback, useEffect, useRef, useState } from "react";
import { Z_INDEX } from "../router/zIndex";
import { useScrollLock } from "../hooks/useScrollLock";
import { useSheetBackDismiss } from "../router/useSheetBackDismiss";
import { useSheetDragDismiss } from "../hooks/useSheetDragDismiss";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

export type BottomSheetProps = {
  open: boolean;
  title?: string;
  onClose: () => void;
  /**
   * 返回手势是否关闭本面板（默认 true）。
   * 组件内置退场缓冲：所有关闭请求（遮罩/返回手势/下拉）先播完退场动画
   * 才回调 onClose，不会与 onClose 中的 goBack 互喂死锁——overlay 路由页
   * 主体可直接使用默认值获得带动画的返回关闭。以下场景须传 false：页面
   * 自身用 useBackHandler 表达返回语义（如关闭前冲洗落库），或使用
   * pushForResult/finish 做结果回传（内置拦截会消费 finish 的弹栈请求，
   * 导致 settle 未落账）。
   */
  backDismiss?: boolean;
  children: React.ReactNode;
};

export function BottomSheet({
  open,
  title,
  onClose,
  backDismiss = true,
  children,
}: BottomSheetProps) {
  const [shouldRender, setShouldRender] = useState(open);
  // 关闭缓冲：请求关闭先播退场动画（visible 置 false），动画完成后才回调
  // onClose——遮罩点击、返回手势、下拉关闭统一走该时序，避免父级在
  // onClose 中同步 goBack/setState 与退场动画竞速导致面板瞬间消失
  const [closing, setClosing] = useState(false);
  const closeRequestedRef = useRef(false);
  const visible = open && !closing;
  const contentRef = useRef<HTMLDivElement | null>(null);

  const requestClose = useCallback(() => {
    if (!open || closing) return;
    closeRequestedRef.current = true;
    setClosing(true);
  }, [open, closing]);

  const { y, dragging, panelBindings } = useSheetDragDismiss({
    enabled: visible,
    onClose: requestClose,
    scrollRef: contentRef,
  });

  useSheetBackDismiss(backDismiss && visible, requestClose);

  // 锁住 body 滚动：弹层挂载瞬间避免背景滚动链被重排打断产生"内容上窜"观感
  useScrollLock(open);

  useEffect(() => {
    if (open) setShouldRender(true);
  }, [open]);

  // 父级响应 onClose（open 置 false）后复位缓冲，使下次打开从入场动画开始
  useEffect(() => {
    if (!open) {
      setClosing(false);
      closeRequestedRef.current = false;
    }
  }, [open]);

  if (!shouldRender || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    // 卸载时机由 exit 动画完成回调驱动（此前为固定 300ms 定时器，会截断
    // spring 退场动画造成"直接消失"的观感）；内部发起的关闭在动画完成后
    // 才回调 onClose
    <AnimatePresence
      onExitComplete={() => {
        setShouldRender(false);
        if (closeRequestedRef.current) {
          closeRequestedRef.current = false;
          onClose();
        }
      }}
    >
      {visible && (
        <div className="fixed inset-0" style={{ zIndex: Z_INDEX.POPOVER }}>
          <motion.div
            key="mask"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-mask absolute inset-0"
            onClick={requestClose}
          />
          <motion.div
            key="panel"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 300, mass: 0.9 }}
            className={`bg-surface absolute bottom-0 left-0 right-0 rounded-t-[30px] shadow-float${
              dragging ? "select-none" : ""
            }`}
            style={{ y, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            {...panelBindings}
          >
            {/* 拖拽热区：抓手横线与标题，向下拖拽可关闭面板 */}
            <div data-sheet-drag-zone="true">
              <div className="sheet-grab" />
              {title && (
                <div className="text-ink px-5 pb-2 pt-1 text-center text-[15.5px] font-bold">
                  {title}
                </div>
              )}
            </div>
            {/* data-allow-touchmove：PanContainer 在 document 上拦截 touchmove 时按此标记放行面板内滚动 */}
            <div
              ref={contentRef}
              data-allow-touchmove="true"
              className="max-h-[72dvh] overflow-y-auto overscroll-contain px-5 pb-7 pt-2"
            >
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export default BottomSheet;
