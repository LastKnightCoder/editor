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
  /** 说明副文案（可选）：帮助用户理解操作后果，降低误触 */
  desc?: string;
  icon?: React.ReactNode;
  /** 图标语义色；danger 项固定 rose，无需指定 */
  tone?: ActionSheetTone;
  danger?: boolean;
  /**
   * 尾部槽位（可选）：状态值（如「已置顶」）、当前位置、跳转箭头等右缘内容。
   * 槽位统一视觉规格：文字 12px ink-3，内部 svg 自动 16px，无需调用方设置。
   */
  trailing?: React.ReactNode;
  onClick: () => void;
};

type ActionSheetProps = {
  open: boolean;
  title?: string;
  /** 标题上方的眉题标签（如「文章」「项目」），主色小字 */
  kind?: string;
  /** 标题下方的 meta 副信息行（可选） */
  subtitle?: string;
  /** 与 groups 二选一；传入 groups 时忽略 items 的普通/危险分组 */
  items?: ActionSheetItem[];
  /** 分组渲染：组间以发丝线分隔 */
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

/** 图标瓷贴：语义色圆形底 + 同色系图标前景 */
const TONE_CHIP_CLASS: Record<ActionSheetTone, string> = {
  sage: "bg-tag-1-soft text-tag-1",
  sky: "bg-tag-2-soft text-tag-2",
  apricot: "bg-accent-soft text-accent-text",
  lilac: "bg-tag-3-soft text-tag-3",
  butter: "bg-tag-4-soft text-tag-4",
  rose: "bg-tag-5-soft text-tag-5",
};

export function ActionSheet({
  open,
  title,
  kind,
  subtitle,
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
  // 空组不渲染，避免组间出现孤立分隔线
  const resolvedGroups = (groups ?? [normalItems, dangerItems]).filter(g => g.length > 0);

  const renderItem = (item: ActionSheetItem) => {
    const chipClass = item.danger
      ? TONE_CHIP_CLASS.rose
      : item.tone
        ? TONE_CHIP_CLASS[item.tone]
        : "bg-page text-ink-2";
    return (
      <button
        key={item.label}
        type="button"
        className="active:bg-hover flex w-full items-center gap-3.5 rounded-[14px] px-3.5 py-[13px] text-left transition-colors"
        onClick={() => {
          item.onClick();
          requestClose();
        }}
      >
        {item.icon && (
          <span
            className={`flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full ${chipClass}`}
          >
            {item.icon}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-[15px] font-semibold ${
              item.danger ? "text-tag-5" : "text-ink-1"
            }`}
          >
            {item.label}
          </span>
          {item.desc && (
            <span className="text-ink-3 mt-0.5 block truncate text-[11.5px]">{item.desc}</span>
          )}
        </span>
        {item.trailing !== undefined && item.trailing !== null && (
          <span className="text-ink-3 flex min-w-5 flex-shrink-0 items-center justify-end gap-1 text-xs font-medium [&_svg]:h-4 [&_svg]:w-4">
            {item.trailing}
          </span>
        )}
      </button>
    );
  };

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
            className="bg-overlay absolute inset-0"
            onClick={requestClose}
          />
          <motion.div
            key="panel"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 300, mass: 0.9 }}
            className={`bg-surface shadow-float absolute bottom-0 left-0 right-0 flex max-h-[88dvh] flex-col rounded-t-sheet${
              dragging ? "select-none" : ""
            }`}
            data-allow-touchmove="true"
            style={{
              y,
              paddingBottom: "calc(var(--mobile-overlay-bottom) + 10px)",
            }}
            {...panelBindings}
          >
            {/* 拖拽热区：抓手横线与标题区，向下拖拽可关闭面板 */}
            <div data-sheet-drag-zone="true">
              <div className="sheet-grab" />
              {title ? (
                <div className="border-line-2 border-b px-6 pb-[18px] pt-1.5">
                  {kind && (
                    <div className="text-accent mb-1.5 text-[10.5px] font-bold tracking-[0.12em]">
                      {kind}
                    </div>
                  )}
                  <div className="text-ink-1 truncate text-[19px] font-extrabold leading-snug">
                    {title}
                  </div>
                  {subtitle && <div className="text-ink-3 mt-1 truncate text-xs">{subtitle}</div>}
                </div>
              ) : null}
            </div>
            <div
              ref={contentScrollRef}
              className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-2.5 py-1.5"
            >
              {resolvedGroups.map((groupItems, groupIndex) => (
                <div key={groupIndex} className="shrink-0">
                  {groupIndex > 0 && <div className="border-line-2 mx-5 my-1.5 border-t" />}
                  {groupItems.map(renderItem)}
                </div>
              ))}
            </div>
            {/* 取消常驻面板底部：不随内容滚动，长列表中始终可见 */}
            <div className="shrink-0 px-2.5 pt-1.5">
              <button
                type="button"
                className="text-ink-2 active:bg-hover w-full rounded-[14px] py-[13px] text-[15px] font-bold transition-colors"
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
