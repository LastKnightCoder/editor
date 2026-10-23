// 锚定式气泡菜单：portal + fixed 定位展示在锚点下方右对齐，
// 底部放不下时翻转到锚点上方；滚动/视口变化时直接关闭（锚点已位移）。

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Z_INDEX } from "../router/zIndex";

export type PopoverItem = {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
};

type PopoverProps = {
  open: boolean;
  /** 锚点元素（通常是触发按钮），菜单展示在其下方且右缘对齐 */
  anchorEl: HTMLElement | null;
  items: PopoverItem[];
  onClose: () => void;
};

const ITEM_HEIGHT = 38;
const CONTAINER_PADDING = 10;
const GAP = 8;

export function Popover({ open, anchorEl, items, onClose }: PopoverProps) {
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!open || !anchorEl) {
      setPosition(null);
      return;
    }
    const menuHeight = items.length * ITEM_HEIGHT + CONTAINER_PADDING;
    const rect = anchorEl.getBoundingClientRect();
    const fitBelow = rect.bottom + GAP + menuHeight <= window.innerHeight;
    setPosition({
      top: fitBelow ? rect.bottom + GAP : Math.max(12, rect.top - GAP - menuHeight),
      right: Math.max(12, window.innerWidth - rect.right),
    });

    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [open, anchorEl, items.length, onClose]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open && position ? (
        // 截断点击冒泡：portal 在 React 树上仍是调用方的后代，
        // 不拦截会误触发锚点所在可点击元素（如卡片 onClick 进详情）
        <div
          className="fixed inset-0"
          style={{ zIndex: Z_INDEX.POPOVER }}
          onClick={event => event.stopPropagation()}
        >
          <div className="absolute inset-0" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.12 } }}
            transition={{ type: "spring", damping: 24, stiffness: 380, mass: 0.75 }}
            style={{
              position: "absolute",
              top: position.top,
              right: position.right,
              transformOrigin: "top right",
            }}
            className="bg-surface shadow-float w-max min-w-[152px] rounded-[15px] p-[5px]"
            role="menu"
          >
            {items.map(item => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className="text-ink-1 active:bg-page flex h-[38px] w-full items-center gap-2.5 rounded-[10px] px-3 text-[13.5px] font-semibold transition-colors"
                onClick={() => {
                  item.onClick();
                  onClose();
                }}
              >
                {item.icon ? (
                  <span className={`flex-shrink-0 ${item.danger ? "text-tag-5" : "text-ink-2"}`}>
                    {item.icon}
                  </span>
                ) : null}
                <span className={item.danger ? "text-tag-5" : undefined}>{item.label}</span>
              </button>
            ))}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

export default Popover;
