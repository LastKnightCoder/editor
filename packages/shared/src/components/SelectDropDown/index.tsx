import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@tau/ui";
const styles = {
  selectDropdown:
    "bg-surface text-ink-1 rounded-tau-lg shadow-float fixed z-[9999] min-w-[180px] p-2 backdrop-blur-[18px]",
  selectDropdownScroll: "overflow-x-hidden overflow-y-auto",
  menuItem:
    "hover:bg-hover rounded-tau-md mb-0.5 mx-1 flex min-h-9 cursor-pointer items-center px-3 py-2 text-tau-body transition-colors",
  selected: "bg-selected text-accent hover:bg-selected",
};

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
  preferredPlacement?: "top" | "bottom";
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
  preferredPlacement,
}: SelectDropDownProps<T>) => {
  const [position, setPosition] = useState<Position>({ top: 0, left: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);

  const calculatePosition = (): Position => {
    if (!triggerElement || !dropdownRef.current) {
      return { top: 0, left: 0 };
    }

    const triggerRect = triggerElement.getBoundingClientRect();
    const dropdownHeight = Math.min(dropdownRef.current.scrollHeight, maxHeight);

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const gap = 8;

    // 计算垂直位置（上下）
    const spaceBelow = viewportHeight - triggerRect.bottom - gap;
    const spaceAbove = triggerRect.top - gap;

    let top: number;
    const preferBottom = preferredPlacement === "bottom";
    const preferTop = preferredPlacement === "top";

    if (preferBottom) {
      top = triggerRect.bottom + gap;
    } else if (preferTop) {
      top = triggerRect.top - dropdownHeight - gap;
    } else if (spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove) {
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
      left = Math.max(gap, Math.min(triggerRect.left, viewportWidth - width - gap));
    }

    // 边界限制
    top = Math.max(gap, Math.min(top, viewportHeight - dropdownHeight - gap));
    left = Math.max(gap, Math.min(left, viewportWidth - width - gap));

    return { top, left };
  };

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
  }, [show, triggerElement, onClose]);

  const handleItemClick = (item: T) => {
    onSelect(item);
    onClose();
  };

  return createPortal(
    <AnimatePresence>
      {show && (
        <motion.div
          ref={dropdownRef}
          className={styles.selectDropdown}
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
            width: `${width}px`,
          }}
          initial={{ opacity: 0, scale: 0.98, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 6 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
        >
          <div className={styles.selectDropdownScroll} style={{ maxHeight: `${maxHeight}px` }}>
            {items.map(item => {
              const key = getKey(item);
              const isSelected = key === selectedKey;

              return (
                <div key={String(key)}>
                  <div
                    className={cn(styles.menuItem, isSelected && styles.selected)}
                    onClick={() => handleItemClick(item)}
                  >
                    <div className="w-full">{renderItem(item)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default SelectDropDown;
