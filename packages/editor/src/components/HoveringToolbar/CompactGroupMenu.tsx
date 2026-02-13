import React, {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Tooltip } from "antd";
import classnames from "classnames";

import { IConfigItem } from "../../types";
import useThemeColors from "../../hooks/useThemeColors";
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
  const themeColors = useThemeColors();
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
            className="fixed z-[10020] flex items-center gap-1 rounded-xl border border-white/40 bg-white/92 p-1 shadow-[0_12px_34px_rgba(15,23,42,0.24)] backdrop-blur-xl dark:border-white/12 dark:bg-slate-950/90 dark:shadow-[0_16px_40px_rgba(2,6,23,0.62)]"
            style={{ left: position.left, top: position.top }}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            {items.map((config) => {
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
          document.body,
        )
      : null;

  return (
    <>
      <Tooltip title={title} trigger="hover">
        <div
          ref={triggerRef}
          className={classnames(
            "flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer transition-all duration-200",
            open
              ? themeColors.activeClass
              : classnames(
                  themeColors.textClass,
                  themeColors.hoverClass,
                  themeColors.hoverTextClass,
                ),
          )}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpen((prev) => !prev);
          }}
          onPointerDown={(event) => {
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
