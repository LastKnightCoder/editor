import { useMemoizedFn } from "ahooks";
import { useEffect, useRef } from "react";
import { useAnimate } from "framer-motion";

interface UseDragAndHideSidebarProps {
  width: number;
  open: boolean;
}

const useDragAndHideSidebar = ({ open, width }: UseDragAndHideSidebarProps) => {
  const firstOpen = useRef(true);

  const [scope, animate] = useAnimate();

  const handleSidebarOpenChange = useMemoizedFn((open: boolean) => {
    if (!scope.current) return;
    if (open) {
      animate(scope.current, {
        width,
      });
    } else {
      animate(scope.current, {
        width: 0,
      }, {
        duration: firstOpen.current ? 0 : 0.3,
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