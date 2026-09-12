import { useCallback, useEffect, useRef, useState } from "react";
import { Z_INDEX } from "../router/zIndex";
import { useSheetBackDismiss } from "../router/useSheetBackDismiss";
import { useSheetDragDismiss } from "../hooks/useSheetDragDismiss";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

/** 操作项图标的语义色，对应主题六组粉彩语义色 */
export type ActionSheetTone = "sage" | "sky" | "apricot" | "lilac" | "butter" | "rose";

export type ActionSheetItem = {
  label: string;
  icon?: React.ReactNode;
  /** 图标语义色；danger 项固定 rose，无需指定 */
  tone?: ActionSheetTone;
  danger?: boolean;
  onClick: () => void;
};

type ActionSheetProps = {
  open: boolean;
  title?: string;
  /** 标题行右侧的类型胶囊文案（如「文章」「项目」）；传入后标题按对象名左对齐，否则居中展示 */
  kind?: string;
  /** 与 groups 二选一；传入 groups 时忽略 items 的普通/危险分组 */
  items?: ActionSheetItem[];
  /** 分组渲染：每组独立卡片、组间留白 */
  groups?: ActionSheetItem[][];
  onClose: () => void;
  /**
   * 返回手势是否关闭本面板（默认 true）。
   * 组件内置退场缓冲：所有关闭请求（遮罩/返回手势/下拉/选项点击）先播完
   * 退场动画才回调 onClose，不会与 onClose 中的 goBack 互喂死锁——overlay
   * 路由页主体可直接使用默认值。以下场景须传 false：页面自身用
   * useBackHandler 表达返回语义，或使用 pushForResult/finish 做结果回传
   * （内置拦截会消费 finish 的弹栈请求，导致 settle 未落账）。
   */
  backDismiss?: boolean;
};

const TONE_CLASS: Record<ActionSheetTone, string> = {
  sage: "text-sage",
  sky: "text-sky",
  apricot: "text-apricot",
  lilac: "text-lilac",
  butter: "text-butter",
  rose: "text-rose",
};

export function ActionSheet({
  open,
  title,
  kind,
  items,
  groups,
  onClose,
  backDismiss = true,
}: ActionSheetProps) {
  const [shouldRender, setShouldRender] = useState(open);
  // 关闭缓冲：请求关闭先播退场动画（visible 置 false），动画完成后才回调
  // onClose——遮罩点击、返回手势、下拉、选项/取消点击统一走该时序
  const [closing, setClosing] = useState(false);
  const closeRequestedRef = useRef(false);
  // 长列表内容滚动容器：交给下拉手势判断滚动位置，避免内容中部下拉被误判为关闭
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const visible = open && !closing;

  const requestClose = useCallback(() => {
    if (!open || closing) return;
    closeRequestedRef.current = true;
    setClosing(true);
  }, [open, closing]);

  const { y, dragging, panelBindings } = useSheetDragDismiss({
    enabled: visible,
    onClose: requestClose,
    scrollRef: contentScrollRef,
  });

  useSheetBackDismiss(backDismiss && visible, requestClose);

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

  const normalItems = (items ?? []).filter(item => !item.danger);
  const dangerItems = (items ?? []).filter(item => item.danger);

  const renderItem = (item: ActionSheetItem) => (
    <button
      key={item.label}
      type="button"
      className="text-ink list-item w-full justify-start gap-3 text-[15px] font-medium"
      onClick={() => {
        item.onClick();
        requestClose();
      }}
    >
      {item.icon && (
        <span
          className={`flex-shrink-0 ${
            item.danger ? "text-rose" : item.tone ? TONE_CLASS[item.tone] : "text-ink-2"
          }`}
        >
          {item.icon}
        </span>
      )}
      <span className={item.danger ? "text-rose font-semibold" : undefined}>{item.label}</span>
    </button>
  );

  return createPortal(
    // 卸载时机由 exit 动画完成回调驱动，避免固定 300ms 定时器截断 spring
    // 退场动画；内部发起的关闭在动画完成后才回调 onClose
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
            className={`bg-page absolute bottom-0 left-0 right-0 flex max-h-[88dvh] flex-col rounded-t-[26px] px-3.5${
              dragging ? "select-none" : ""
            }`}
            data-allow-touchmove="true"
            style={{
              y,
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)",
            }}
            {...panelBindings}
          >
            {/* 拖拽热区：抓手横线与标题，向下拖拽可关闭面板 */}
            <div data-sheet-drag-zone="true">
              <div className="sheet-grab" />
              {title && kind ? (
                <div className="flex items-center gap-3 px-1.5 pb-2.5 pt-3">
                  <span className="text-ink min-w-0 flex-1 truncate text-[15.5px] font-bold">
                    {title}
                  </span>
                  <span className="bg-accent-soft text-accent flex-shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold">
                    {kind}
                  </span>
                </div>
              ) : title ? (
                <div className="text-ink-2 pb-2.5 pt-3 text-center text-[12.5px] font-semibold">
                  {title}
                </div>
              ) : null}
            </div>
            <div
              ref={contentScrollRef}
              className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain"
            >
              {groups ? (
                groups.map((groupItems, groupIndex) => (
                  <div key={groupIndex} className="list-group shrink-0 overflow-hidden">
                    {groupItems.map(renderItem)}
                  </div>
                ))
              ) : (
                <>
                  {normalItems.length > 0 && (
                    <div className="list-group shrink-0 overflow-hidden">
                      {normalItems.map(renderItem)}
                    </div>
                  )}
                  {dangerItems.length > 0 && (
                    <div className="list-group shrink-0 overflow-hidden">
                      {dangerItems.map(renderItem)}
                    </div>
                  )}
                </>
              )}
            </div>
            {/* 取消常驻面板底部：不随内容滚动，长列表中始终可见 */}
            <div className="list-group mt-2.5 shrink-0 overflow-hidden">
              <button
                type="button"
                className="text-ink-2 list-item w-full justify-center py-3 text-[15px] font-bold"
                onClick={requestClose}
              >
                取消
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export default ActionSheet;
