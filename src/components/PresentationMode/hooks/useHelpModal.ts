import { useEffect, useState } from "react";

// localStorage 键名
const PRESENTATION_HELP_SHOWN_KEY = "presentation_help_shown";

/**
 * 帮助弹窗Hook
 * 用于管理帮助弹窗的显示逻辑，包括首次使用时显示帮助弹窗的功能
 */
const useHelpModal = () => {
  const [showHelp, setShowHelp] = useState(false);

  // 检查是否是首次使用演示模式
  useEffect(() => {
    const hasShownHelp = localStorage.getItem(PRESENTATION_HELP_SHOWN_KEY);
    if (!hasShownHelp) {
      setShowHelp(true);
      localStorage.setItem(PRESENTATION_HELP_SHOWN_KEY, "true");
    }
  }, []);

  const openHelp = () => {
    setShowHelp(true);
  };

  const closeHelp = () => {
    setShowHelp(false);
  };

  const toggleHelp = () => {
    setShowHelp((prev) => !prev);
  };

  return {
    showHelp,
    openHelp,
    closeHelp,
    toggleHelp,
  };
};

export default useHelpModal;
