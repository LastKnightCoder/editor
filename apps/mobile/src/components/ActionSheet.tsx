import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

export type ActionSheetItem = {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
};

type ActionSheetProps = {
  open: boolean;
  title?: string;
  items: ActionSheetItem[];
  onClose: () => void;
};

export function ActionSheet({ open, title, items, onClose }: ActionSheetProps) {
  const [shouldRender, setShouldRender] = useState(open);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      return;
    }
    if (!shouldRender) return;
    const timer = setTimeout(() => setShouldRender(false), 300);
    return () => clearTimeout(timer);
  }, [open, shouldRender]);

  if (!shouldRender || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70]">
          <motion.div
            key="mask"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/50 dark:bg-black/70"
            onClick={onClose}
          />
          <motion.div
            key="panel"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-gray-100 px-3 dark:bg-neutral-950"
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
              paddingTop: "16px",
            }}
          >
            <div className="list-group mb-2 overflow-hidden">
              {title && (
                <div className="px-4 py-3 text-center text-xs text-gray-500 dark:text-neutral-400">
                  {title}
                </div>
              )}
              {items.map((item, index) => (
                <button
                  key={index}
                  type="button"
                  className={`list-item w-full justify-center py-4 text-base font-medium ${
                    item.danger
                      ? "text-red-600 dark:text-red-400"
                      : "text-gray-900 dark:text-neutral-100"
                  }`}
                  onClick={() => {
                    item.onClick();
                    onClose();
                  }}
                >
                  {item.icon && <span className="mr-2">{item.icon}</span>}
                  {item.label}
                </button>
              ))}
            </div>
            <div className="list-group overflow-hidden">
              <button
                type="button"
                className="list-item w-full justify-center py-4 text-base font-semibold text-gray-700 dark:text-neutral-200"
                onClick={onClose}
              >
                取消
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export default ActionSheet;
