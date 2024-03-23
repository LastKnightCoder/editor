import useGlobalStateStore from "@/stores/useGlobalStateStore";
import { useMemoizedFn } from "ahooks";
import { useEffect } from "react";

const useExitFocusMode = () => {
  const {
    focusMode,
  } = useGlobalStateStore(state => ({
    focusMode: state.focusMode,
  }));

  const exitFocusMode = useMemoizedFn(() => {
    if (focusMode) {
      useGlobalStateStore.setState({ focusMode: false });
    }
  });

  useEffect(() => {
    // 监听 esc 按键
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        exitFocusMode();
        e.stopPropagation();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    }
  }, [exitFocusMode]);
}

export default useExitFocusMode;