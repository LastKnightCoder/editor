import { useMemoizedFn } from "ahooks";
import { useEffect, useRef } from "react";
import { useAnimate } from "framer-motion";

interface UseDragAndHideSidebarProps {
  width: number;
  open: boolean;
  onWidthChange?: (width: number, actualWidth?: number) => void;
}

const useDragAndHideSidebar = ({ open, width, onWidthChange }: UseDragAndHideSidebarProps) => {
  const firstOpen = useRef(true);

  const [scope, animate] = useAnimate();

  const handleSidebarOpenChange = useMemoizedFn((open: boolean) => {
    if (!scope.current) return;
    if (open) {
      animate(scope.current, {
        width,
      }, {
        onUpdate: (w) => {
          onWidthChange?.(width, w);
        }
      });
    } else {
      animate(scope.current, {
        width: 0,
      }, {
        duration: firstOpen.current ? 0 : 0.3,
        onUpdate: (w) => {
          onWidthChange?.(width, w);
        }
      })
    }
    firstOpen.current = false;
  });

  const handleSidebarWidthChange = useMemoizedFn((width: number) => {
    if (!scope.current) return;
    if(open) {
      animate(scope.current, {
        width,
      }, {
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
