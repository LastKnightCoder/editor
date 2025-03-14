import { useMemoizedFn } from "ahooks";
import { useEffect, useRef } from "react";
import gsap from "gsap";

interface UseDragAndHideSidebarProps {
  width: number;
  open: boolean;
  onWidthChange?: (width: number, actualWidth?: number) => void;
}

const useDragAndHideSidebar = <T extends HTMLElement>({
  open,
  width,
  onWidthChange,
}: UseDragAndHideSidebarProps) => {
  const firstOpen = useRef(true);
  const ref = useRef<T | null>(null);

  const handleSidebarOpenChange = useMemoizedFn((open: boolean) => {
    if (!ref.current) return;
    if (open) {
      gsap.to(ref.current, {
        width,
        duration: 0.3,
        onUpdate: () => {
          onWidthChange?.(width, ref.current!.offsetWidth);
        },
      });
    } else {
      gsap.to(ref.current, {
        width: 0,
        duration: firstOpen.current ? 0 : 0.3,
        onUpdate: () => {
          onWidthChange?.(width, ref.current!.offsetWidth);
        },
      });
    }
    firstOpen.current = false;
  });

  const handleSidebarWidthChange = useMemoizedFn((width: number) => {
    if (!ref.current) return;
    if (open) {
      gsap.to(ref.current, {
        width,
        duration: 0,
      });
    }
  });

  useEffect(() => {
    handleSidebarOpenChange(open);
  }, [open, handleSidebarOpenChange]);

  useEffect(() => {
    handleSidebarWidthChange(width);
  }, [width, handleSidebarWidthChange]);

  return ref;
};

export default useDragAndHideSidebar;
