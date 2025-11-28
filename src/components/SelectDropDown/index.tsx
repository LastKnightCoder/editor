import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useMemoizedFn } from "ahooks";
import styles from "./index.module.less";

interface SelectDropDownProps<T> {
  items: T[];
  selectedKey: string | number;
  show: boolean;
  onClose: () => void;
  onSelect: (item: T) => void;
  triggerElement: HTMLElement | null;
  getKey: (item: T) => string | number;
  renderItem: (item: T) => React.ReactNode;
  width?: number;
  maxHeight?: number;
}

interface Position {
  top: number;
  left: number;
}

const SelectDropDown = <T,>({
  items,
  selectedKey,
  show,
  onClose,
  onSelect,
  triggerElement,
  getKey,
  renderItem,
  width = 240,
  maxHeight = 400,
}: SelectDropDownProps<T>) => {
  const [position, setPosition] = useState<Position>({ top: 0, left: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);

  const calculatePosition = useMemoizedFn((): Position => {
    if (!triggerElement || !dropdownRef.current) {
      return { top: 0, left: 0 };
    }

    const triggerRect = triggerElement.getBoundingClientRect();
    const dropdownHeight = Math.min(
      dropdownRef.current.scrollHeight,
      maxHeight,
    );

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const gap = 8;

    // 计算垂直位置（上下）
    const spaceBelow = viewportHeight - triggerRect.bottom - gap;
    const spaceAbove = triggerRect.top - gap;

    let top: number;
    if (spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove) {
      // 显示在下方
      top = triggerRect.bottom + gap;
    } else {
      // 显示在上方
      top = triggerRect.top - dropdownHeight - gap;
    }

    // 计算水平位置（左右）
    const spaceRight = viewportWidth - triggerRect.left;
    const spaceLeft = triggerRect.right;

    let left: number;
    if (spaceRight >= width) {
      // 左对齐
      left = triggerRect.left;
    } else if (spaceLeft >= width) {
      // 右对齐
      left = triggerRect.right - width;
    } else {
      // 居中或尽可能靠左
      left = Math.max(
        gap,
        Math.min(triggerRect.left, viewportWidth - width - gap),
      );
    }

    // 边界限制
    top = Math.max(gap, Math.min(top, viewportHeight - dropdownHeight - gap));
    left = Math.max(gap, Math.min(left, viewportWidth - width - gap));

    return { top, left };
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        triggerElement &&
        !triggerElement.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    const updatePosition = () => {
      if (show && triggerElement) {
        const newPosition = calculatePosition();
        setPosition(newPosition);
      }
    };

    if (show) {
      // 需要延迟计算位置，确保 DOM 已渲染
      setTimeout(updatePosition, 0);
      document.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [show, triggerElement, onClose, calculatePosition]);

  const handleItemClick = useMemoizedFn((item: T) => {
    onSelect(item);
    onClose();
  });

  return createPortal(
    <AnimatePresence>
      {show && (
        <motion.div
          ref={dropdownRef}
          className="fixed rounded-2xl bg-white/60 dark:bg-[rgba(30,30,30,0.6)] backdrop-blur-md backdrop-saturate-150 border border-white/30 dark:border-white/20 shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.4)]"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
            width: `${width}px`,
            zIndex: 9999,
          }}
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          <div
            className={`${styles.selectDropdownScroll} overflow-y-auto py-2 border-10 border-transparent`}
            style={{ maxHeight: `${maxHeight}px` }}
          >
            {items.map((item) => {
              const key = getKey(item);
              const isSelected = key === selectedKey;
              return (
                <div
                  key={String(key)}
                  className={`h-9 flex items-center px-3 mx-2 mb-1 last:mb-0 rounded-lg cursor-pointer transition-all duration-150 text-sm font-normal leading-normal ${
                    isSelected
                      ? "bg-white/40 dark:bg-white/10 text-blue-600 dark:text-blue-400 border border-white/40 dark:border-white/20"
                      : "text-gray-700 dark:text-gray-200 hover:bg-white/20 dark:hover:bg-white/8"
                  }`}
                  onClick={() => handleItemClick(item)}
                >
                  <div className="truncate">{renderItem(item)}</div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export default SelectDropDown;
