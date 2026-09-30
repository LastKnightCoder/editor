import React, {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Tooltip } from "../../ui/Tooltip";
import classnames from "classnames";

import { IConfigItem } from "../../types";
import { HoveringBarContext } from "./context";
import { calculateFloatingPosition } from "./floatingPosition";

type CompactGroupMenuProps = {
  id: string;
  title: string;
  icon: React.ReactNode;
  items: IConfigItem[];
};

function CompactGroupMenu(props: CompactGroupMenuProps) {
  const { title, icon, items, id } = props;
  const { isHoveringBarShow } = useContext(HoveringBarContext);

  const triggerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !panelRef.current) {
      return;
    }
    const anchorRect = triggerRef.current.getBoundingClientRect();
    const panelRect = panelRef.current.getBoundingClientRect();
    const next = calculateFloatingPosition({
      anchorRect,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      floatingWidth: panelRect.width,
      floatingHeight: panelRect.height,
      preferredPlacement: "bottom",
    });

    setPosition({
      left: next.left,
      top: next.top,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    updatePosition();

    const handleViewportChange = () => {
      requestAnimationFrame(updatePosition);
    };

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const handleOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [open]);

  useEffect(() => {
    if (!isHoveringBarShow) {
      setOpen(false);
    }
  }, [isHoveringBarShow]);

  if (items.length === 0) {
    return null;
  }

  const panel =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            className="fixed z-[10020] flex animate-[ed-menu-fade-in_120ms_ease-out] items-center gap-[2px] rounded-[12px] border border-solid border-[var(--ed-border)] bg-[var(--ed-bg-surface)] p-[4px] shadow-[var(--ed-shadow-float)]"
            style={{ left: position.left, top: position.top }}
            onPointerDown={event => {
              event.stopPropagation();
            }}
            onClick={event => {
              event.stopPropagation();
            }}
          >
            {items.map(config => {
              const { element: Element, id: itemId } = config;
              return (
                <div
                  key={`${id}-${itemId}`}
                  onClickCapture={() => {
                    setOpen(false);
                  }}
                >
                  <Element />
                </div>
              );
            })}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <Tooltip content={title} disabled={open}>
        <div
          ref={triggerRef}
          className={classnames(
            "flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-all duration-200",
            "ed-toolbar-item",
            open && "is-open"
          )}
          onClick={event => {
            event.preventDefault();
            event.stopPropagation();
            setOpen(prev => !prev);
          }}
          onPointerDown={event => {
            event.stopPropagation();
          }}
        >
          {icon}
        </div>
      </Tooltip>
      {panel}
    </>
  );
}

export default CompactGroupMenu;
