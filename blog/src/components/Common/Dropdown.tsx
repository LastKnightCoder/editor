import { memo, useState, useRef, useEffect, ReactNode } from "react";
import classNames from "classnames";

export interface DropdownItem {
  id: string;
  label: string;
  icon?: ReactNode;
  href?: string;
  onClick?: () => void;
}

interface DropdownProps {
  trigger: ReactNode;
  items: DropdownItem[];
  activeId?: string;
  align?: "left" | "right";
  className?: string;
}

const Dropdown = memo(
  ({ trigger, items, activeId, align = "left", className }: DropdownProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // 点击外部关闭
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          dropdownRef.current &&
          !dropdownRef.current.contains(event.target as Node)
        ) {
          setIsOpen(false);
        }
      };

      if (isOpen) {
        document.addEventListener("mousedown", handleClickOutside);
      }

      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }, [isOpen]);

    // ESC 关闭
    useEffect(() => {
      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          setIsOpen(false);
        }
      };

      if (isOpen) {
        document.addEventListener("keydown", handleEscape);
      }

      return () => {
        document.removeEventListener("keydown", handleEscape);
      };
    }, [isOpen]);

    return (
      <div ref={dropdownRef} className={classNames("dropdown", className)}>
        <button
          type="button"
          className={classNames("dropdown-trigger", { active: isOpen })}
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-haspopup="true"
        >
          {trigger}
          <svg
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {isOpen && (
          <div
            className="dropdown-menu"
            style={{ [align === "right" ? "right" : "left"]: 0 }}
          >
            {items.map((item) => {
              const isActive = activeId === item.id;

              if (item.href) {
                return (
                  <a
                    key={item.id}
                    href={item.href}
                    className={classNames("dropdown-item", {
                      active: isActive,
                    })}
                    onClick={() => setIsOpen(false)}
                  >
                    {item.label}
                  </a>
                );
              }

              return (
                <button
                  key={item.id}
                  type="button"
                  className={classNames("dropdown-item", { active: isActive })}
                  onClick={() => {
                    item.onClick?.();
                    setIsOpen(false);
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  },
);

Dropdown.displayName = "Dropdown";

export default Dropdown;
