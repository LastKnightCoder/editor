import { memo, useState, useRef, ReactNode } from "react";
import classNames from "classnames";

interface DropdownItem {
  key: string;
  label: ReactNode;
}

interface SimpleDropdownProps {
  items: DropdownItem[];
  onSelect: (key: string) => void;
  children: ReactNode;
  className?: string;
}

const SimpleDropdown = memo<SimpleDropdownProps>(
  ({ items, onSelect, children, className }) => {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const handleSelect = (key: string) => {
      onSelect(key);
      setOpen(false);
    };

    return (
      <div className="relative">
        <div ref={triggerRef} onClick={() => setOpen(!open)}>
          {children}
        </div>
        {open && (
          <>
            <div
              className="fixed inset-0 z-101"
              onClick={() => setOpen(false)}
            />
            <div
              ref={menuRef}
              className={classNames(
                "absolute z-102 mt-1 min-w-[120px] p-1 rounded-[14px]",
                "bg-[rgba(248,250,255,0.95)] dark:bg-[rgba(10,15,28,0.9)]",
                "border border-[rgba(255,255,255,0.45)] dark:border-[rgba(255,255,255,0.12)]",
                "shadow-[0_12px_32px_rgba(15,23,42,0.2)] dark:shadow-[0_12px_32px_rgba(2,6,23,0.5)]",
                "backdrop-blur-md",
                className,
              )}
            >
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="w-full border-none bg-transparent px-3 py-2 rounded-[10px] flex items-center gap-2 text-[13px] text-[rgba(15,23,42,0.95)] dark:text-[rgba(241,245,249,0.95)] cursor-pointer transition-all hover:bg-[rgba(255,255,255,0.6)] dark:hover:bg-[rgba(148,163,184,0.15)]"
                  onClick={() => handleSelect(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  },
);

SimpleDropdown.displayName = "SimpleDropdown";

export default SimpleDropdown;
