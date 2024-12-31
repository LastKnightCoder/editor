import { useMemoizedFn } from "ahooks";
import { useEffect, useRef } from "react";
import gsap from "gsap";

interface UseDragAndHideSidebarProps {
  width: number;
  open: boolean;
  onWidthChange?: (width: number, actualWidth?: number) => void;
  ref: HTMLElement | null;
}

const useDragAndHideSidebar = ({ open, width, onWidthChange, ref }: UseDragAndHideSidebarProps) => {
  const firstOpen = useRef(true);
  // const scope = useRef<HTMLElement>(null);

  const handleSidebarOpenChange = useMemoizedFn((open: boolean) => {
    if (!ref) return;
    if (open) {
      // 使用 gsap 来做动画
      gsap.to(ref, {
        width,
        duration: 0.3,
        onUpdate: () => {
          onWidthChange?.(width, ref.offsetWidth);
        }
      })
    } else {
      gsap.to(ref, {
        width: 0,
        duration: firstOpen.current ? 0 : 0.3,
        onUpdate: () => {
          onWidthChange?.(width, ref.offsetWidth);
        }
      })
    }
    firstOpen.current = false;
  });

  const handleSidebarWidthChange = useMemoizedFn((width: number) => {
    if (!ref) return;
    if(open) {
      gsap.to(ref, {
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
}

export default useDragAndHideSidebar;
