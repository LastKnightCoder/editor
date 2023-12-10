import { useMemoizedFn } from "ahooks";
import { useEffect, useRef } from "react";
import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";
import { useAnimate } from "framer-motion";

const useDragAndHideSidebar = () => {
  const {
    sidebarOpen,
    sidebarWidth,
  } = useGlobalStateStore(state => ({
    sidebarOpen: state.sidebarOpen,
    sidebarWidth: state.sidebarWidth,
  }));

  const first = useRef(true);

  const [scope, animate] = useAnimate();

  const handleSidebarOpenChange = useMemoizedFn((open: boolean) => {
    if (!scope.current) return;
    if (open) {
      animate(scope.current, {
        width: sidebarWidth,
      })
    } else {
      animate(scope.current, {
        width: 0,
      }, {
        duration: first.current ? 0 : 0.3,
      })
    }
    first.current = false;
  });

  const handleSidebarWidthChange = useMemoizedFn((width: number) => {
    if (!scope.current) return;
    if(sidebarOpen) {
      animate(scope.current, {
        width,
      }, {
        duration: 0,
      })
    }
  });

  useEffect(() => {
    handleSidebarOpenChange(sidebarOpen);
  }, [sidebarOpen, handleSidebarOpenChange]);

  useEffect(() => {
    handleSidebarWidthChange(sidebarWidth);
  }, [sidebarWidth, handleSidebarWidthChange]);

  return scope;
}

export default useDragAndHideSidebar;