import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

type BottomSheetProps = {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
};

export function BottomSheet({
  open,
  title,
  onClose,
  children,
}: BottomSheetProps) {
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
        <div className="fixed inset-0 z-70">
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
            className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-white dark:bg-neutral-900"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          >
            <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-gray-300 dark:bg-neutral-600" />
            {title && (
              <div className="px-4 pb-2 pt-4 text-center text-base font-semibold text-gray-900 dark:text-neutral-100">
                {title}
              </div>
            )}
            <div className="px-4 pb-6 pt-3">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export default BottomSheet;
