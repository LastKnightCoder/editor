import { useMemoizedFn } from "ahooks";
import { useEffect, useRef } from "react";
import gsap from "gsap";

interface UseDragAndHideSidebarProps {
  width: number;
  open: boolean;
  onWidthChange?: (width: number, actualWidth?: number) => void;
}

const useDragAndHideSidebar = ({ open, width, onWidthChange }: UseDragAndHideSidebarProps) => {
  const firstOpen = useRef(true);
  const scope = useRef<HTMLElement>(null);

  const handleSidebarOpenChange = useMemoizedFn((open: boolean) => {
    if (!scope.current) return;
    if (open) {
      // 使用 gsap 来做动画
      gsap.to(scope.current, {
        width,
        duration: 0.3,
        onUpdate: () => {
          onWidthChange?.(width, scope.current!.offsetWidth);
        }
      })
    } else {
      gsap.to(scope.current, {
        width: 0,
        duration: firstOpen.current ? 0 : 0.3,
        onUpdate: () => {
          onWidthChange?.(width, scope.current!.offsetWidth);
        }
      })
    }
    firstOpen.current = false;
  });

  const handleSidebarWidthChange = useMemoizedFn((width: number) => {
    if (!scope.current) return;
    if(open) {
      gsap.to(scope.current, {
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

  return scope;
}

export default useDragAndHideSidebar;
